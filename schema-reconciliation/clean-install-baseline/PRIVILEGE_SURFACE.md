# Restored class-model privilege surface

The local PostgreSQL 17 default ACL assigned `TRUNCATE`, `REFERENCES`,
`TRIGGER`, and `MAINTAIN` directly to `authenticated` when the restored tables
were created. These were genuine direct and effective table privileges, not
RLS metadata or inherited role membership.

The reconciliation migration now revokes all table privileges from `PUBLIC`,
`anon`, and `authenticated` before explicit grants. It does not alter owner or
`service_role` privileges.

| Table | `authenticated` direct privileges | Row access |
| --- | --- | --- |
| `classes` | `SELECT` | active-user read policy |
| `class_rosters` | `SELECT`, `INSERT`, `DELETE` | class-manager write policy; manager, assigned-faculty, or enrolled-student read policy |
| `faculty_profiles` | `SELECT` | manager or self |
| `admin_profiles` | `SELECT` | manager or self |

No public-facing role retains `TRUNCATE`, `TRIGGER`, `REFERENCES`, or
`MAINTAIN` on these tables. The reconciliation migration applies the same
narrow revocation to the full canonical public-table inventory while retaining
the historical track's existing DML grants and RLS policies. It also removes
these privileges from future postgres-owned tables created by this inactive
clean-install track.
