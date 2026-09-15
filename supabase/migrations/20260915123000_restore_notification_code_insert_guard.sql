-- Older notification writers may not supply notification_code. Keep those
-- inserts compatible with the current non-null notification_code column.
create or replace function private.normalize_notification_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.notification_code is null or btrim(new.notification_code) = '' then
    new.notification_code := 'legacy.' || new.notification_type;
  end if;

  return new;
end;
$$;

drop trigger if exists normalize_notification_row on public.notifications;

create trigger normalize_notification_row
before insert on public.notifications
for each row
execute function private.normalize_notification_row();
