begin;
alter table public.events
  add column predicted_turnout_percent numeric(5, 2),
  add constraint events_predicted_turnout_percent_valid
    check (predicted_turnout_percent is null or predicted_turnout_percent between 0 and 100);
alter table public.attendance_records
  add column late_reason_category text,
  add column minutes_late smallint,
  add constraint attendance_records_late_reason_valid
    check (
      late_reason_category is null
      or late_reason_category in (
        'Traffic / Commute',
        'Class or Academic Conflict',
        'Personal / Health',
        'Weather / Force Majeure',
        'Other'
      )
    ),
  add constraint attendance_records_minutes_late_valid
    check (minutes_late is null or minutes_late between 0 and 1440);
create table public.event_objectives (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  objective_order smallint not null,
  objective_text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_objectives_order_valid check (objective_order between 1 and 3),
  constraint event_objectives_text_not_blank check (btrim(objective_text) <> ''),
  constraint event_objectives_event_order_unique unique (event_id, objective_order)
);
create table public.event_feedback (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  attendance_record_id uuid not null references public.attendance_records(id) on delete cascade,
  comment text,
  sentiment_score numeric(5, 4),
  sentiment_label text,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_feedback_event_student_unique unique (event_id, student_id),
  constraint event_feedback_attendance_record_unique unique (attendance_record_id),
  constraint event_feedback_comment_not_blank check (comment is null or btrim(comment) <> ''),
  constraint event_feedback_sentiment_score_valid
    check (sentiment_score is null or sentiment_score between -1 and 1),
  constraint event_feedback_sentiment_label_valid
    check (sentiment_label is null or sentiment_label in ('positive', 'neutral', 'negative'))
);
create index event_feedback_student_id_idx on public.event_feedback (student_id);
create table public.event_feedback_ratings (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.event_feedback(id) on delete cascade,
  objective_id uuid not null references public.event_objectives(id) on delete cascade,
  rating smallint not null,
  created_at timestamptz not null default now(),
  constraint event_feedback_ratings_value_valid check (rating between 1 and 5),
  constraint event_feedback_ratings_feedback_objective_unique unique (feedback_id, objective_id)
);
create index event_feedback_ratings_objective_id_idx on public.event_feedback_ratings (objective_id);
create table public.event_summary_snapshots (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.events(id) on delete cascade,
  present_count integer not null,
  late_count integer not null,
  absent_count integer not null,
  total_registered integer not null,
  attendance_rate numeric(5, 2) not null,
  average_sentiment_score numeric(5, 4),
  positive_percent numeric(5, 2) not null,
  neutral_percent numeric(5, 2) not null,
  negative_percent numeric(5, 2) not null,
  source text not null default 'calculated',
  captured_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_summary_counts_nonnegative check (
    present_count >= 0 and late_count >= 0 and absent_count >= 0 and total_registered >= 0
  ),
  constraint event_summary_counts_match check (
    present_count + late_count + absent_count = total_registered
  ),
  constraint event_summary_attendance_rate_valid check (attendance_rate between 0 and 100),
  constraint event_summary_sentiment_score_valid
    check (average_sentiment_score is null or average_sentiment_score between -1 and 1),
  constraint event_summary_sentiment_percentages_valid check (
    positive_percent between 0 and 100
    and neutral_percent between 0 and 100
    and negative_percent between 0 and 100
    and positive_percent + neutral_percent + negative_percent = 100
  ),
  constraint event_summary_source_not_blank check (btrim(source) <> '')
);
alter table public.event_objectives enable row level security;
alter table public.event_feedback enable row level security;
alter table public.event_feedback_ratings enable row level security;
alter table public.event_summary_snapshots enable row level security;
grant select, insert, update, delete on
  public.event_objectives,
  public.event_feedback,
  public.event_feedback_ratings,
  public.event_summary_snapshots
to service_role;
grant select, insert, update, delete on public.event_objectives to authenticated;
grant select, insert, update on public.event_feedback to authenticated;
grant select, insert, update on public.event_feedback_ratings to authenticated;
grant select, insert, update on public.event_summary_snapshots to authenticated;
create policy event_objectives_read on public.event_objectives for select to authenticated
  using (exists (
    select 1
    from public.events
    where events.id = event_objectives.event_id
      and (
        events.approval_status = 'approved'
        or events.organizer_id = (select private.current_organizer_id())
      )
  ));
create policy event_objectives_insert_owner on public.event_objectives for insert to authenticated
  with check (exists (
    select 1 from public.events
    where events.id = event_objectives.event_id
      and events.organizer_id = (select private.current_organizer_id())
  ));
create policy event_objectives_update_owner on public.event_objectives for update to authenticated
  using (exists (
    select 1 from public.events
    where events.id = event_objectives.event_id
      and events.organizer_id = (select private.current_organizer_id())
  ))
  with check (exists (
    select 1 from public.events
    where events.id = event_objectives.event_id
      and events.organizer_id = (select private.current_organizer_id())
  ));
create policy event_objectives_delete_owner on public.event_objectives for delete to authenticated
  using (exists (
    select 1 from public.events
    where events.id = event_objectives.event_id
      and events.organizer_id = (select private.current_organizer_id())
  ));
create policy event_feedback_read on public.event_feedback for select to authenticated
  using (
    student_id = (select private.current_student_id())
    or exists (
      select 1 from public.events
      where events.id = event_feedback.event_id
        and events.organizer_id = (select private.current_organizer_id())
    )
  );
create policy event_feedback_insert_self on public.event_feedback for insert to authenticated
  with check (
    student_id = (select private.current_student_id())
    and exists (
      select 1
      from public.attendance_records
      join public.event_sessions on event_sessions.id = attendance_records.event_session_id
      where attendance_records.id = event_feedback.attendance_record_id
        and attendance_records.student_id = event_feedback.student_id
        and event_sessions.event_id = event_feedback.event_id
    )
  );
create policy event_feedback_update_self on public.event_feedback for update to authenticated
  using (student_id = (select private.current_student_id()))
  with check (student_id = (select private.current_student_id()));
create policy event_feedback_ratings_read on public.event_feedback_ratings for select to authenticated
  using (exists (
    select 1
    from public.event_feedback
    join public.events on events.id = event_feedback.event_id
    where event_feedback.id = event_feedback_ratings.feedback_id
      and (
        event_feedback.student_id = (select private.current_student_id())
        or events.organizer_id = (select private.current_organizer_id())
      )
  ));
create policy event_feedback_ratings_insert_self on public.event_feedback_ratings for insert to authenticated
  with check (exists (
    select 1 from public.event_feedback
    where event_feedback.id = event_feedback_ratings.feedback_id
      and event_feedback.student_id = (select private.current_student_id())
  ));
create policy event_feedback_ratings_update_self on public.event_feedback_ratings for update to authenticated
  using (exists (
    select 1 from public.event_feedback
    where event_feedback.id = event_feedback_ratings.feedback_id
      and event_feedback.student_id = (select private.current_student_id())
  ))
  with check (exists (
    select 1 from public.event_feedback
    where event_feedback.id = event_feedback_ratings.feedback_id
      and event_feedback.student_id = (select private.current_student_id())
  ));
create policy event_summary_snapshots_read on public.event_summary_snapshots for select to authenticated
  using (exists (
    select 1 from public.events
    where events.id = event_summary_snapshots.event_id
      and (
        events.approval_status = 'approved'
        or events.organizer_id = (select private.current_organizer_id())
      )
  ));
create policy event_summary_snapshots_insert_owner on public.event_summary_snapshots for insert to authenticated
  with check (exists (
    select 1 from public.events
    where events.id = event_summary_snapshots.event_id
      and events.organizer_id = (select private.current_organizer_id())
  ));
create policy event_summary_snapshots_update_owner on public.event_summary_snapshots for update to authenticated
  using (exists (
    select 1 from public.events
    where events.id = event_summary_snapshots.event_id
      and events.organizer_id = (select private.current_organizer_id())
  ))
  with check (exists (
    select 1 from public.events
    where events.id = event_summary_snapshots.event_id
      and events.organizer_id = (select private.current_organizer_id())
  ));
commit;
