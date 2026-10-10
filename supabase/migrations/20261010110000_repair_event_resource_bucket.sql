-- The original event-resource migration is already in migration history, but
-- the production Storage bucket is missing. Restore only that idempotent
-- control-plane record; existing object policies remain unchanged.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-resources', 'event-resources', false, 26214400, null)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
