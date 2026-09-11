# Historical migration audit boundary

The executable historical files remain byte-for-byte unchanged in
`supabase/migrations/` during this phase. This directory stores only audit
documentation and must never contain copied executable migration SQL.

Before a future rebaseline, create a reviewed file-hash manifest for the
historical chain and archive it outside any active Supabase project root. The
current broken rename remains evidence of the replay defect, not a candidate
for deployment.
