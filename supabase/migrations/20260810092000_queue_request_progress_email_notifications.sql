create table if not exists public.request_email_outbox (
  id uuid primary key default gen_random_uuid(),
  recipient_profile_id uuid not null references public.profiles(id) on delete cascade,
  recipient_email text not null,
  request_table text not null,
  request_id uuid not null,
  request_status text not null,
  subject text not null,
  body text not null,
  delivery_status text not null default 'pending',
  provider_message_id text,
  error_message text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint request_email_outbox_email_not_blank check (btrim(recipient_email) <> ''),
  constraint request_email_outbox_table_valid check (request_table in ('attendance_requests', 'credential_requests')),
  constraint request_email_outbox_delivery_valid check (delivery_status in ('pending', 'sent', 'failed', 'skipped'))
);

create index if not exists request_email_outbox_pending_idx
  on public.request_email_outbox (delivery_status, created_at)
  where delivery_status = 'pending';

alter table public.request_email_outbox enable row level security;

grant select on public.request_email_outbox to authenticated;

drop policy if exists request_email_outbox_read_self on public.request_email_outbox;
create policy request_email_outbox_read_self on public.request_email_outbox
  for select to authenticated
  using (recipient_profile_id = (select auth.uid()));

create or replace function private.queue_attendance_request_progress_email()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  student_profile_id uuid;
  student_email text;
  request_label text;
begin
  if tg_op <> 'UPDATE' or new.request_status = old.request_status then
    return new;
  end if;

  select students.profile_id, profiles.email
    into student_profile_id, student_email
  from public.students
  join public.profiles on profiles.id = students.profile_id
  where students.id = new.student_id;

  if student_profile_id is null or student_email is null or btrim(student_email) = '' then
    return new;
  end if;

  request_label := coalesce(new.requested_status, 'attendance correction');

  insert into public.notifications (
    recipient_id,
    notification_type,
    title,
    message,
    notification_status
  )
  values (
    student_profile_id,
    'correction',
    'Request status updated',
    format('Your attendance correction request is now %s.', new.request_status),
    'unread'
  );

  insert into public.request_email_outbox (
    recipient_profile_id,
    recipient_email,
    request_table,
    request_id,
    request_status,
    subject,
    body
  )
  values (
    student_profile_id,
    student_email,
    'attendance_requests',
    new.id,
    new.request_status,
    format('PLPass request update: %s', initcap(new.request_status)),
    format('Your %s request has been marked as %s.%s',
      request_label,
      new.request_status,
      case when new.review_reason is not null then E'\n\nOrganizer note: ' || new.review_reason else '' end
    )
  );

  return new;
end;
$$;

create or replace function private.queue_credential_request_progress_email()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  student_profile_id uuid;
  student_email text;
begin
  if tg_op <> 'UPDATE' or new.request_status = old.request_status then
    return new;
  end if;

  select students.profile_id, profiles.email
    into student_profile_id, student_email
  from public.students
  join public.profiles on profiles.id = students.profile_id
  where students.id = new.student_id;

  if student_profile_id is null or student_email is null or btrim(student_email) = '' then
    return new;
  end if;

  insert into public.notifications (
    recipient_id,
    notification_type,
    title,
    message,
    notification_status
  )
  values (
    student_profile_id,
    'system',
    'Request status updated',
    format('Your %s request is now %s.', replace(new.request_type, '_', ' '), new.request_status),
    'unread'
  );

  insert into public.request_email_outbox (
    recipient_profile_id,
    recipient_email,
    request_table,
    request_id,
    request_status,
    subject,
    body
  )
  values (
    student_profile_id,
    student_email,
    'credential_requests',
    new.id,
    new.request_status,
    format('PLPass request update: %s', initcap(new.request_status)),
    format('Your %s request has been marked as %s.%s',
      replace(new.request_type, '_', ' '),
      new.request_status,
      case when new.review_remarks is not null then E'\n\nReviewer note: ' || new.review_remarks else '' end
    )
  );

  return new;
end;
$$;

drop trigger if exists queue_attendance_request_progress_email on public.attendance_requests;
create trigger queue_attendance_request_progress_email
after update of request_status on public.attendance_requests
for each row
execute function private.queue_attendance_request_progress_email();

drop trigger if exists queue_credential_request_progress_email on public.credential_requests;
create trigger queue_credential_request_progress_email
after update of request_status on public.credential_requests
for each row
execute function private.queue_credential_request_progress_email();
