-- Account status changes are informational. They must not be presented as an
-- action-required task or expose a profile navigation action.
create or replace function private.normalize_account_status_notification()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.notification_code = 'account.status_changed' then
    new.requires_action := false;
    new.action_url := null;
  end if;
  return new;
end;
$$;

revoke all on function private.normalize_account_status_notification() from public, anon, authenticated;

drop trigger if exists normalize_account_status_notification on public.notifications;
create trigger normalize_account_status_notification
before insert or update of notification_code, requires_action, action_url on public.notifications
for each row
when (new.notification_code = 'account.status_changed')
execute function private.normalize_account_status_notification();

update public.notifications
set requires_action = false,
    action_url = null
where notification_code = 'account.status_changed'
  and (requires_action or action_url is not null);
