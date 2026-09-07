begin;

create table public.event_feedback_tasks (
  id uuid primary key default gen_random_uuid(),
  attendance_record_id uuid not null unique references public.attendance_records(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  task_status text not null default 'pending' check (task_status in ('pending', 'completed', 'expired')),
  due_at timestamptz not null,
  completed_at timestamptz,
  expired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_feedback_tasks_completion_valid check (
    (task_status = 'pending' and completed_at is null and expired_at is null)
    or (task_status = 'completed' and completed_at is not null and expired_at is null)
    or (task_status = 'expired' and completed_at is null and expired_at is not null)
  )
);

create index event_feedback_tasks_student_status_due_idx
  on public.event_feedback_tasks(student_id, task_status, due_at);

create table public.event_feedback_task_objectives (
  task_id uuid not null references public.event_feedback_tasks(id) on delete cascade,
  objective_id uuid not null references public.event_objectives(id) on delete restrict,
  objective_order smallint not null check (objective_order >= 1),
  objective_text text not null check (btrim(objective_text) <> ''),
  primary key (task_id, objective_id),
  unique (task_id, objective_order)
);

alter table public.event_feedback_tasks enable row level security;
alter table public.event_feedback_task_objectives enable row level security;
revoke all on public.event_feedback_tasks, public.event_feedback_task_objectives from anon, authenticated;
grant select on public.event_feedback_tasks, public.event_feedback_task_objectives to authenticated;

create policy event_feedback_tasks_read_scoped on public.event_feedback_tasks
  for select to authenticated
  using (
    student_id = (select private.current_student_id())
    or exists (select 1 from public.events e where e.id = event_feedback_tasks.event_id and e.organizer_id = (select private.current_organizer_id()))
  );

create policy event_feedback_task_objectives_read_scoped on public.event_feedback_task_objectives
  for select to authenticated
  using (exists (
    select 1 from public.event_feedback_tasks task
    where task.id = event_feedback_task_objectives.task_id
      and (
        task.student_id = (select private.current_student_id())
        or exists (select 1 from public.events e where e.id = task.event_id and e.organizer_id = (select private.current_organizer_id()))
      )
  ));

create or replace function private.create_feedback_tasks_for_session(p_session_id uuid, p_due_at timestamptz)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.event_feedback_tasks(attendance_record_id, event_id, student_id, due_at)
  select ar.id, es.event_id, ar.student_id, p_due_at
  from public.attendance_records ar
  join public.event_sessions es on es.id = ar.event_session_id
  where ar.event_session_id = p_session_id
    and ar.attendance_status in ('present', 'late')
    and ar.time_in is not null
    and ar.time_out is not null
    and not exists (select 1 from public.event_feedback ef where ef.attendance_record_id = ar.id)
  on conflict (attendance_record_id) do nothing;

  insert into public.event_feedback_task_objectives(task_id, objective_id, objective_order, objective_text)
  select task.id, objective.id, objective.objective_order, objective.objective_text
  from public.event_feedback_tasks task
  join public.event_objectives objective on objective.event_id = task.event_id
  where task.attendance_record_id in (
    select id from public.attendance_records where event_session_id = p_session_id
  )
  on conflict (task_id, objective_id) do nothing;
end;
$$;

create or replace function private.create_feedback_tasks_after_session_completion()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.session_status = 'completed' and old.session_status is distinct from 'completed' then
    perform private.create_feedback_tasks_for_session(new.id, coalesce(new.actual_end, now()) + interval '24 hours');
  end if;
  return new;
end;
$$;

drop trigger if exists create_feedback_tasks_after_session_completion on public.event_sessions;
create trigger create_feedback_tasks_after_session_completion
  after update of session_status on public.event_sessions
  for each row execute function private.create_feedback_tasks_after_session_completion();

insert into public.event_feedback_tasks(attendance_record_id, event_id, student_id, due_at)
select ar.id, es.event_id, ar.student_id, coalesce(es.actual_end, ar.time_out, ar.recorded_at) + interval '24 hours'
from public.attendance_records ar
join public.event_sessions es on es.id = ar.event_session_id and es.session_status = 'completed'
where ar.attendance_status in ('present', 'late')
  and ar.time_in is not null
  and ar.time_out is not null
  and not exists (select 1 from public.event_feedback ef where ef.attendance_record_id = ar.id)
on conflict (attendance_record_id) do nothing;

insert into public.event_feedback_task_objectives(task_id, objective_id, objective_order, objective_text)
select task.id, objective.id, objective.objective_order, objective.objective_text
from public.event_feedback_tasks task
join public.event_objectives objective on objective.event_id = task.event_id
on conflict (task_id, objective_id) do nothing;

create or replace function public.expire_overdue_feedback_tasks()
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  expired_count integer := 0;
begin
  with expired as (
    update public.event_feedback_tasks
    set task_status = 'expired', expired_at = now(), updated_at = now()
    where task_status = 'pending' and due_at <= now()
    returning attendance_record_id
  ), updated as (
    update public.attendance_records ar
    set attendance_status = 'absent',
        remarks = concat_ws(E'\n', ar.remarks, 'Attendance changed to absent: required feedback was not submitted within 24 hours.'),
        updated_at = now()
    from expired
    where ar.id = expired.attendance_record_id
    returning ar.id
  )
  select count(*) into expired_count from updated;
  return expired_count;
end;
$$;

create or replace function public.submit_feedback_task(
  p_task_id uuid,
  p_comment text,
  p_ratings jsonb,
  p_sentiment_label text default null,
  p_sentiment_score numeric default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_task public.event_feedback_tasks;
  v_feedback_id uuid;
  v_expected_count integer;
  v_received_count integer;
begin
  perform public.expire_overdue_feedback_tasks();
  select * into v_task from public.event_feedback_tasks where id = p_task_id for update;
  if not found or v_task.student_id <> private.current_student_id() then
    raise exception 'Feedback task was not found.' using errcode = '42501';
  end if;
  if v_task.task_status <> 'pending' then
    raise exception 'This feedback task is no longer available.' using errcode = '22023';
  end if;
  if v_task.due_at <= now() then
    raise exception 'The 24-hour feedback deadline has passed and attendance is now absent.' using errcode = '22023';
  end if;

  select count(*) into v_expected_count from public.event_feedback_task_objectives where task_id = v_task.id;
  select count(*) into v_received_count from jsonb_array_elements(coalesce(p_ratings, '[]'::jsonb));
  if v_expected_count = 0 or v_received_count <> v_expected_count then
    raise exception 'Rate every assigned event objective before submitting feedback.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_ratings) as rating(objective_id uuid, rating integer)
    where rating.rating not between 1 and 5
  ) or exists (
    select 1 from jsonb_to_recordset(p_ratings) as rating(objective_id uuid, rating integer)
    group by rating.objective_id having count(*) <> 1
  ) or exists (
    select 1 from jsonb_to_recordset(p_ratings) as rating(objective_id uuid, rating integer)
    where not exists (select 1 from public.event_feedback_task_objectives assigned where assigned.task_id = v_task.id and assigned.objective_id = rating.objective_id)
  ) then
    raise exception 'Feedback ratings must match every assigned objective and use values from 1 to 5.' using errcode = '22023';
  end if;

  insert into public.event_feedback(event_id, student_id, attendance_record_id, comment, sentiment_label, sentiment_score)
  values (v_task.event_id, v_task.student_id, v_task.attendance_record_id, nullif(btrim(coalesce(p_comment, '')), ''), p_sentiment_label, p_sentiment_score)
  on conflict (attendance_record_id) do update set
    comment = excluded.comment, sentiment_label = excluded.sentiment_label, sentiment_score = excluded.sentiment_score, updated_at = now()
  returning id into v_feedback_id;

  delete from public.event_feedback_ratings where feedback_id = v_feedback_id;
  insert into public.event_feedback_ratings(feedback_id, objective_id, rating)
  select v_feedback_id, rating.objective_id, rating.rating
  from jsonb_to_recordset(p_ratings) as rating(objective_id uuid, rating integer);

  update public.event_feedback_tasks
  set task_status = 'completed', completed_at = now(), updated_at = now()
  where id = v_task.id;
  return v_feedback_id;
end;
$$;

alter table public.event_objectives add column if not exists rating_count integer not null default 0;
create or replace function public.recalculate_feedback_analytics()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  _event_id uuid;
  _total_feedback integer;
  _positive integer;
  _neutral integer;
  _negative integer;
begin
  if tg_table_name = 'event_feedback' then
    _event_id := case when tg_op = 'DELETE' then old.event_id else new.event_id end;
  elsif tg_table_name = 'event_feedback_ratings' then
    select event_id into _event_id
    from public.event_feedback
    where id = case when tg_op = 'DELETE' then old.feedback_id else new.feedback_id end;
  end if;
  if _event_id is null then return null; end if;
  update public.event_objectives objective
  set average_rating = (
        select round(avg(rating.rating)::numeric, 2)
        from public.event_feedback_ratings rating
        join public.event_feedback feedback on feedback.id = rating.feedback_id
        where rating.objective_id = objective.id
      ),
      rating_count = (
        select count(*) from public.event_feedback_ratings rating
        join public.event_feedback feedback on feedback.id = rating.feedback_id
        where rating.objective_id = objective.id
      )
  where objective.event_id = _event_id;
  select count(*) into _total_feedback
  from public.event_feedback where event_id = _event_id and sentiment_label is not null;
  if _total_feedback > 0 then
    select
      count(*) filter (where sentiment_label = 'positive'),
      count(*) filter (where sentiment_label = 'neutral'),
      count(*) filter (where sentiment_label = 'negative')
    into _positive, _neutral, _negative
    from public.event_feedback where event_id = _event_id;
    update public.event_summary_snapshots
    set average_sentiment_score = (
          select round(avg(sentiment_score)::numeric, 4)
          from public.event_feedback where event_id = _event_id
        ),
        positive_percent = round((_positive::numeric / _total_feedback) * 100, 2),
        neutral_percent = round((_neutral::numeric / _total_feedback) * 100, 2),
        negative_percent = round((_negative::numeric / _total_feedback) * 100, 2),
        updated_at = now()
    where event_id = _event_id;
  end if;
  return null;
end;
$$;

revoke all on function public.expire_overdue_feedback_tasks() from public, anon, authenticated;
revoke all on function public.submit_feedback_task(uuid, text, jsonb, text, numeric) from public, anon;
grant execute on function public.submit_feedback_task(uuid, text, jsonb, text, numeric) to authenticated;

create extension if not exists pg_cron with schema extensions;
select cron.unschedule(jobid) from cron.job where jobname = 'expire-overdue-feedback-tasks';
select cron.schedule('expire-overdue-feedback-tasks', '*/15 * * * *', $$select public.expire_overdue_feedback_tasks()$$);

commit;
