begin;

-- Email delivery and in-app notifications are independent.  The in-app
-- trigger below is authoritative; this helper must only queue email.
create or replace function private.queue_event_student_email(
  p_event_id uuid,
  p_student_id uuid,
  p_notification_type text,
  p_event_revision timestamptz
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
  v_subject text;
  v_body text;
  v_html_body text;
  v_safe_first_name text;
  v_safe_code text;
  v_safe_title text;
  v_safe_venue text;
  v_date text;
  v_start_time text;
  v_end_time text;
begin
  select students.profile_id, profiles.email, profiles.first_name
    into v_profile_id, v_email, v_first_name
  from public.students
  join public.profiles on profiles.id = students.profile_id
  where students.id = p_student_id;

  select event_code, title, venue, starts_at, ends_at
    into v_event_code, v_title, v_venue, v_starts_at, v_ends_at
  from public.events where id = p_event_id;

  if v_profile_id is null or v_email is null or btrim(v_email) = '' or v_event_code is null then return; end if;

  v_safe_first_name := replace(replace(replace(replace(coalesce(v_first_name, 'PLPass participant'), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;');
  v_safe_code := replace(replace(replace(replace(v_event_code, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;');
  v_safe_title := replace(replace(replace(replace(v_title, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;');
  v_safe_venue := replace(replace(replace(replace(coalesce(v_venue, 'To be announced'), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;');
  v_date := to_char(v_starts_at at time zone 'Asia/Manila', 'Mon DD, YYYY');
  v_start_time := to_char(v_starts_at at time zone 'Asia/Manila', 'HH12:MI AM');
  v_end_time := to_char(v_ends_at at time zone 'Asia/Manila', 'HH12:MI AM');

  if p_notification_type = 'published' then
    v_subject := format('PLPass event published: %s', v_title);
    v_body := format('Dear %s,\n\nYou have been invited to %s (%s).\n\nVenue: %s\nDate: %s\nTime: %s - %s\n\nPlease sign in to PLPass for more details.', coalesce(v_first_name, 'PLPass participant'), v_title, v_event_code, coalesce(v_venue, 'To be announced'), v_date, v_start_time, v_end_time);
    v_html_body := format($html$<div style="margin:0;background:#f4f7f3;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#26352c;"><div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #dce8dd;border-radius:18px;overflow:hidden;"><div style="background:#237a3b;padding:26px 32px;color:#ffffff;"><div style="font-size:26px;font-weight:700;letter-spacing:.3px;">PLPass</div><div style="margin-top:5px;font-size:13px;opacity:.9;">Event Attendance Workspace</div></div><div style="padding:34px 32px;"><div style="font-size:14px;color:#237a3b;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Event Notification</div><h1 style="margin:10px 0 18px;font-size:25px;line-height:1.25;color:#1e3024;">You are invited to an event</h1><p style="font-size:16px;line-height:1.6;margin:0 0 22px;">Dear <strong>%s</strong>,<br>We are pleased to inform you about the following PLPass event.</p><div style="border:1px solid #dce8dd;border-radius:12px;padding:22px;background:#f8fbf8;"><div style="font-size:12px;color:#5f7465;text-transform:uppercase;letter-spacing:.08em;">Event</div><div style="font-size:21px;font-weight:700;margin-top:6px;color:#1e3024;">%s</div><div style="font-size:13px;color:#5f7465;margin-top:5px;">Event code: %s</div><table style="width:100%%;margin-top:18px;border-collapse:collapse;font-size:14px;"><tr><td style="padding:8px 0;color:#5f7465;width:90px;">Venue</td><td style="padding:8px 0;font-weight:600;">%s</td></tr><tr><td style="padding:8px 0;color:#5f7465;">Date</td><td style="padding:8px 0;font-weight:600;">%s</td></tr><tr><td style="padding:8px 0;color:#5f7465;">Time</td><td style="padding:8px 0;font-weight:600;">%s - %s</td></tr></table></div><p style="font-size:14px;line-height:1.6;color:#5f7465;margin:24px 0 0;">Please sign in to PLPass for the complete event details.</p></div><div style="border-top:1px solid #e5eee6;padding:18px 32px;font-size:12px;color:#718176;">This is an automated message from PLPass. Please do not reply.</div></div></div>$html$, v_safe_first_name, v_safe_title, v_safe_code, v_safe_venue, v_date, v_start_time, v_end_time);
  else
    v_subject := format('PLPass event rescheduled: %s', v_title);
    v_body := format('Dear %s,\n\n%s (%s) has been rescheduled.\n\nVenue: %s\nNew date: %s\nNew time: %s - %s\n\nPlease sign in to PLPass for the latest details.', coalesce(v_first_name, 'PLPass participant'), v_title, v_event_code, coalesce(v_venue, 'To be announced'), v_date, v_start_time, v_end_time);
    v_html_body := format($html$<div style="margin:0;background:#f4f7f3;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#26352c;"><div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #dce8dd;border-radius:18px;overflow:hidden;"><div style="background:#237a3b;padding:26px 32px;color:#ffffff;"><div style="font-size:26px;font-weight:700;">PLPass</div><div style="margin-top:5px;font-size:13px;opacity:.9;">Event Attendance Workspace</div></div><div style="padding:34px 32px;"><div style="font-size:14px;color:#237a3b;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Schedule Update</div><h1 style="margin:10px 0 18px;font-size:25px;color:#1e3024;">Your event was rescheduled</h1><p style="font-size:16px;line-height:1.6;">Dear <strong>%s</strong>,<br><strong>%s</strong> (%s) has been rescheduled.</p><div style="border:1px solid #dce8dd;border-radius:12px;padding:22px;background:#f8fbf8;font-size:14px;line-height:1.8;"><strong>Venue:</strong> %s<br><strong>New date:</strong> %s<br><strong>New time:</strong> %s - %s</div><p style="font-size:14px;color:#5f7465;margin-top:24px;">Please sign in to PLPass for the latest details.</p></div><div style="border-top:1px solid #e5eee6;padding:18px 32px;font-size:12px;color:#718176;">This is an automated message from PLPass. Please do not reply.</div></div></div>$html$, v_safe_first_name, v_safe_title, v_safe_code, v_safe_venue, v_date, v_start_time, v_end_time);
  end if;

  insert into public.event_email_outbox (recipient_profile_id, recipient_email, event_id, event_code, event_title, notification_type, event_revision, subject, body, html_body)
  values (v_profile_id, v_email, p_event_id, v_event_code, v_title, p_notification_type, p_event_revision, v_subject, v_body, v_html_body)
  on conflict (event_id, recipient_profile_id, notification_type, event_revision) do update
    set subject = excluded.subject, body = excluded.body, html_body = excluded.html_body;
end;
$$;

create or replace function private.notify_student_event_change()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_participant record;
  v_code text;
  v_title text;
  v_message text;
  v_date text;
  v_start_time text;
  v_end_time text;
begin
  if tg_op = 'INSERT' then
    if new.approval_status <> 'approved' then return new; end if;
    v_code := 'event.invited';
  elsif new.event_status = 'cancelled' and new.event_status is distinct from old.event_status then
    v_code := 'event.cancelled';
  elsif new.event_status <> 'cancelled' and (new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at or new.venue is distinct from old.venue) then
    v_code := 'event.rescheduled';
  else
    return new;
  end if;

  v_date := to_char(new.starts_at at time zone 'Asia/Manila', 'Mon DD, YYYY');
  v_start_time := to_char(new.starts_at at time zone 'Asia/Manila', 'HH12:MI AM');
  v_end_time := to_char(new.ends_at at time zone 'Asia/Manila', 'HH12:MI AM');

  for v_participant in
    select p.id as profile_id, p.first_name
    from public.event_participants ep
    join public.students s on s.id = ep.student_id
    join public.profiles p on p.id = s.profile_id
    where ep.event_id = new.id and ep.participant_status <> 'removed' and p.account_status = 'active'
  loop
    if v_code = 'event.invited' then
      v_title := format('PLPass Event Invitation: %s', new.title);
      v_message := format('Dear %s,\n\nYou have been invited to %s (%s).\n\nVenue: %s\nDate: %s\nTime: %s - %s\n\nPlease sign in to PLPass for the complete event details.', coalesce(v_participant.first_name, 'PLPass participant'), new.title, new.event_code, coalesce(new.venue, 'To be announced'), v_date, v_start_time, v_end_time);
    elsif v_code = 'event.rescheduled' then
      v_title := format('PLPass Event Rescheduled: %s', new.title);
      v_message := format('Dear %s,\n\n%s (%s) has been rescheduled.\n\nVenue: %s\nNew date: %s\nNew time: %s - %s\n\nPlease sign in to PLPass for the latest details.', coalesce(v_participant.first_name, 'PLPass participant'), new.title, new.event_code, coalesce(new.venue, 'To be announced'), v_date, v_start_time, v_end_time);
    else
      v_title := 'Event cancelled';
      v_message := format('%s was cancelled.', new.title);
    end if;

    perform private.create_role_notification(v_participant.profile_id, v_code, 'system', v_title, v_message, case when v_code = 'event.cancelled' then 'warning' else 'info' end, v_code <> 'event.rescheduled', 'event', new.id, '/student/events/' || new.id::text, v_code || ':student:' || v_participant.profile_id::text || ':' || new.updated_at::text);
  end loop;
  return new;
end;
$$;

create or replace function private.notify_student_event_invitation()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_profile_id uuid;
  v_first_name text;
  v_event_code text;
  v_event_title text;
  v_event_venue text;
  v_event_starts_at timestamptz;
  v_event_ends_at timestamptz;
begin
  if new.participant_status = 'removed' then return new; end if;
  select s.profile_id, p.first_name, e.event_code, e.title, e.venue, e.starts_at, e.ends_at
    into v_profile_id, v_first_name, v_event_code, v_event_title, v_event_venue, v_event_starts_at, v_event_ends_at
  from public.students s
  join public.profiles p on p.id = s.profile_id
  join public.events e on e.id = new.event_id
  where s.id = new.student_id and e.approval_status = 'approved' and e.event_status <> 'cancelled';
  if v_profile_id is not null then
    perform private.create_role_notification(v_profile_id, 'event.invited', 'system', format('PLPass Event Invitation: %s', v_event_title), format('Dear %s,\n\nYou have been invited to %s (%s).\n\nVenue: %s\nDate: %s\nTime: %s - %s\n\nPlease sign in to PLPass for the complete event details.', coalesce(v_first_name, 'PLPass participant'), v_event_title, v_event_code, coalesce(v_event_venue, 'To be announced'), to_char(v_event_starts_at at time zone 'Asia/Manila', 'Mon DD, YYYY'), to_char(v_event_starts_at at time zone 'Asia/Manila', 'HH12:MI AM'), to_char(v_event_ends_at at time zone 'Asia/Manila', 'HH12:MI AM')), 'info', false, 'event', new.event_id, '/student/events/' || new.event_id::text, 'event:invited:student:' || v_profile_id::text || ':' || new.event_id::text);
  end if;
  return new;
end;
$$;

revoke all on function private.queue_event_student_email(uuid, uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function private.notify_student_event_change() from public, anon, authenticated;
revoke all on function private.notify_student_event_invitation() from public, anon, authenticated;

commit;
