-- Live face matching runs only in the trusted PLPass API.  The table remains
-- inaccessible to browser roles; the current Supabase secret key maps to
-- service_role and needs this explicit table grant before BYPASSRLS applies.
grant select on table public.student_face_embeddings to service_role;
