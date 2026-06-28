create policy "faculty can read own faculty role record"
on public.faculty
for select
to authenticated
using (profile_id = auth.uid());

create policy "organizers can read own organizer role record"
on public.organizers
for select
to authenticated
using (profile_id = auth.uid());

create policy "students can read own student role record"
on public.students
for select
to authenticated
using (profile_id = auth.uid());
