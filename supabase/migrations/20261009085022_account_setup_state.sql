-- Track completion of the first password setup separately from email
-- confirmation. Supabase confirms an invitation when it is opened, before
-- the recipient necessarily finishes creating a password.
alter table public.profiles
  add column if not exists account_setup_completed_at timestamptz;

create index if not exists profiles_setup_status_idx
  on public.profiles (role, account_setup_completed_at)
  where role in ('admin', 'department_admin', 'organizer');

-- Existing accounts with a recorded sign-in have already completed setup.
-- Leave never-signed-in accounts pending so administrators can resend an
-- invitation conservatively.
update public.profiles p
set account_setup_completed_at = coalesce(p.updated_at, p.created_at)
from auth.users u
where u.id = p.id
  and p.role in ('admin', 'department_admin', 'organizer')
  and p.account_setup_completed_at is null
  and u.last_sign_in_at is not null;

grant update (account_setup_completed_at, updated_at)
  on public.profiles to authenticated;

create or replace function public.complete_account_setup()
returns void
language sql
security invoker
set search_path = public
as $$
  update public.profiles
  set account_setup_completed_at = coalesce(account_setup_completed_at, now()),
      updated_at = now()
  where id = (select auth.uid())
    and role in ('admin', 'department_admin', 'organizer')
    and account_status = 'active';
$$;

revoke all on function public.complete_account_setup() from public, anon;
grant execute on function public.complete_account_setup() to authenticated;
