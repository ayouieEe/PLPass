-- Existing event writers predate notification_code and were classified as
-- legacy.system. Preserve their rows and history, but make them visible in
-- the event category used by student and organizer notification screens.
update public.notifications
set notification_code = case
  when lower(title || ' ' || message) like '%reschedul%' then 'event.rescheduled'
  when lower(title || ' ' || message) like '%cancel%' then 'event.cancelled'
  when lower(title || ' ' || message) like '%invitation%'
    or lower(title || ' ' || message) like '%added to%' then 'event.invited'
  else 'event.updated'
end
where notification_code = 'legacy.system'
  and (
    lower(title || ' ' || message) like '%event%'
    or lower(title || ' ' || message) like '%invitation%'
    or lower(title || ' ' || message) like '%added to%'
    or lower(title || ' ' || message) like '%reschedul%'
  );
