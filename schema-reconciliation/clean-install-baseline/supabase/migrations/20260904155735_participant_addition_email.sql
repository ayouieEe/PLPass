begin;

alter table public.event_email_outbox
  drop constraint if exists event_email_outbox_type_valid;

alter table public.event_email_outbox
  add constraint event_email_outbox_type_valid
  check (notification_type in ('published', 'rescheduled', 'participant_added'));

create or replace function private.queue_event_participant_invitation(
  p_event_id uuid,
  p_student_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_email text;
  v_first_name text;
  v_event_code text;
  v_title text;
  v_venue text;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_approval_status text;
  v_event_status text;
  v_subject text;
  v_body text;
  v_html_body text;
  v_safe_first_name text;
  v_safe_event_code text;
  v_safe_title text;
  v_safe_venue text;
  v_date text;
  v_start_time text;
  v_end_time text;
  v_revision timestamptz := clock_timestamp();
begin
  select student.profile_id, profile.email, profile.first_name
    into v_profile_id, v_email, v_first_name
  from public.students as student
  join public.profiles as profile on profile.id = student.profile_id
  where student.id = p_student_id;

  select event.event_code, event.title, event.venue, event.starts_at, event.ends_at, event.approval_status, event.event_status
    into v_event_code, v_title, v_venue, v_starts_at, v_ends_at, v_approval_status, v_event_status
  from public.events as event
  where event.id = p_event_id;

  if v_profile_id is null
    or v_email is null
    or btrim(v_email) = ''
    or v_event_code is null
    or v_approval_status <> 'approved'
    or v_event_status in ('cancelled', 'completed') then
    return;
  end if;

  v_subject := format('PLPass event invitation: %s', v_title);
  v_safe_first_name := replace(replace(replace(replace(coalesce(v_first_name, 'PLPass participant'), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;');
  v_safe_event_code := replace(replace(replace(replace(v_event_code, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;');
  v_safe_title := replace(replace(replace(replace(v_title, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;');
  v_safe_venue := replace(replace(replace(replace(coalesce(v_venue, 'To be announced'), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;');
  v_date := to_char(v_starts_at at time zone 'Asia/Manila', 'Mon DD, YYYY');
  v_start_time := to_char(v_starts_at at time zone 'Asia/Manila', 'HH12:MI AM');
  v_end_time := to_char(v_ends_at at time zone 'Asia/Manila', 'HH12:MI AM');
  v_body := format(
    'Dear %s,\n\nYou have been added to %s (%s).\n\nVenue: %s\nDate: %s\nTime: %s - %s\n\nPlease sign in to PLPass for the complete event details.',
    coalesce(v_first_name, 'PLPass participant'),
    v_title,
    v_event_code,
    coalesce(v_venue, 'To be announced'),
    v_date,
    v_start_time,
    v_end_time
  );
  v_html_body := format($html$
    <div style="margin:0;background:#f4f7f3;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#26352c;">
      <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #dce8dd;border-radius:18px;overflow:hidden;">
        <div style="background:#237a3b;padding:26px 32px;color:#ffffff;">
          <div style="font-size:26px;font-weight:700;letter-spacing:.3px;">PLPass</div>
          <div style="margin-top:5px;font-size:13px;opacity:.9;">Event Attendance Workspace</div>
        </div>
        <div style="padding:34px 32px;">
          <div style="font-size:14px;color:#237a3b;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Event Notification</div>
          <h1 style="margin:10px 0 18px;font-size:25px;line-height:1.25;color:#1e3024;">You are invited to an event</h1>
          <p style="font-size:16px;line-height:1.6;margin:0 0 22px;">Dear <strong>%s</strong>,<br>We are pleased to inform you about the following PLPass event.</p>
          <div style="border:1px solid #dce8dd;border-radius:12px;padding:22px;background:#f8fbf8;">
            <div style="font-size:12px;color:#5f7465;text-transform:uppercase;letter-spacing:.08em;">Event</div>
            <div style="font-size:21px;font-weight:700;margin-top:6px;color:#1e3024;">%s</div>
            <div style="font-size:13px;color:#5f7465;margin-top:5px;">Event code: %s</div>
            <table style="width:100%%;margin-top:18px;border-collapse:collapse;font-size:14px;">
              <tr><td style="padding:8px 0;color:#5f7465;width:90px;">Venue</td><td style="padding:8px 0;font-weight:600;">%s</td></tr>
              <tr><td style="padding:8px 0;color:#5f7465;">Date</td><td style="padding:8px 0;font-weight:600;">%s</td></tr>
              <tr><td style="padding:8px 0;color:#5f7465;">Time</td><td style="padding:8px 0;font-weight:600;">%s - %s</td></tr>
            </table>
          </div>
          <p style="font-size:14px;line-height:1.6;color:#5f7465;margin:24px 0 0;">Please sign in to PLPass for the complete event details.</p>
        </div>
        <div style="border-top:1px solid #e5eee6;padding:18px 32px;font-size:12px;color:#718176;">This is an automated message from PLPass. Please do not reply.</div>
      </div>
    </div>
  $html$, v_safe_first_name, v_safe_title, v_safe_event_code, v_safe_venue, v_date, v_start_time, v_end_time);

  insert into public.notifications (
    recipient_id,
    notification_type,
    title,
    message,
    notification_status,
    action_url,
    reference_id
  )
  values (
    v_profile_id,
    'system',
    v_subject,
    v_body,
    'unread',
    '/student/events/' || p_event_id::text,
    p_event_id
  );

  insert into public.event_email_outbox (
    recipient_profile_id,
    recipient_email,
    event_id,
    event_code,
    event_title,
    notification_type,
    event_revision,
    subject,
    body,
    html_body
  )
  values (
    v_profile_id,
    v_email,
    p_event_id,
    v_event_code,
    v_title,
    'participant_added',
    v_revision,
    v_subject,
    v_body,
    v_html_body
  )
  on conflict (event_id, recipient_profile_id, notification_type, event_revision) do nothing;
end;
$$;

revoke all on function private.queue_event_participant_invitation(uuid, uuid) from public;

create or replace function private.queue_event_email_after_participant_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.participant_status <> 'removed' then
    perform private.queue_event_participant_invitation(new.event_id, new.student_id);
  end if;
  return new;
end;
$$;

revoke all on function private.queue_event_email_after_participant_insert() from public;

create or replace function private.queue_event_email_after_participant_reactivated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.participant_status = 'removed' and new.participant_status <> 'removed' then
    perform private.queue_event_participant_invitation(new.event_id, new.student_id);
  end if;
  return new;
end;
$$;

revoke all on function private.queue_event_email_after_participant_reactivated() from public;

drop trigger if exists queue_event_email_after_participant_reactivated on public.event_participants;

create trigger queue_event_email_after_participant_reactivated
after update of participant_status on public.event_participants
for each row
when (old.participant_status = 'removed' and new.participant_status <> 'removed')
execute function private.queue_event_email_after_participant_reactivated();

commit;
