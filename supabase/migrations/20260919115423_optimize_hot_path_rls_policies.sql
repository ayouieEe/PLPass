-- Cache stable auth.uid() evaluation per statement without changing policy
-- semantics. This migration is unapplied until remote migration history is
-- reconciled and the policy behavior is regression-tested.
drop policy if exists admin_profiles_read_admin on public.admin_profiles;
create policy admin_profiles_read_admin
on public.admin_profiles
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
      and p.account_status = 'active'
  )
);

drop policy if exists admin_profiles_update_admin on public.admin_profiles;
create policy admin_profiles_update_admin
on public.admin_profiles
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
      and p.account_status = 'active'
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
      and p.account_status = 'active'
  )
);

drop policy if exists event_email_outbox_read_organizer on public.event_email_outbox;
create policy event_email_outbox_read_organizer
on public.event_email_outbox
for select
to authenticated
using (
  event_id in (
    select e.id
    from public.events e
    where e.organizer_id in (
      select o.id
      from public.organizers o
      where o.profile_id = (select auth.uid())
    )
  )
  or recipient_profile_id = (select auth.uid())
);

drop policy if exists event_email_outbox_update_organizer on public.event_email_outbox;
create policy event_email_outbox_update_organizer
on public.event_email_outbox
for update
to authenticated
using (
  event_id in (
    select e.id
    from public.events e
    where e.organizer_id in (
      select o.id
      from public.organizers o
      where o.profile_id = (select auth.uid())
    )
  )
)
with check (
  event_id in (
    select e.id
    from public.events e
    where e.organizer_id in (
      select o.id
      from public.organizers o
      where o.profile_id = (select auth.uid())
    )
  )
);
