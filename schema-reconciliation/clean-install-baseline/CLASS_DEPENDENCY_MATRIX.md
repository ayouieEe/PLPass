# Class-capable clean-install dependency matrix

The curated historical cleanup intentionally removes the earlier classroom
attendance graph. The current PLPass repository instead requires a lighter
academic-class model alongside the canonical event-attendance model.

| Object | Required by | Existing in curated replay | Canonical definition source | Action |
| --- | --- | ---: | --- | --- |
| `departments`, `programs`, `sections`, `semesters` | generated types; class repository; foreign keys | Yes | foundation migration and current types | Retain |
| `profiles` and `organizers` | faculty/admin relationships; scoped policies | Yes | foundation and RLS migration | Retain; expand role checks for faculty/admin |
| `students` | class roster foreign key and student-scoped reads | Yes | foundation and current repository | Retain |
| `classes` | academic repository; generated types; class roster | No; dropped by event-only cleanup | current generated types and repository queries | Restore snapshot-style model |
| `class_rosters` | class roster repository and generated types | No | current generated types; excluded migration only for table shape | Restore |
| `faculty_profiles`, `admin_profiles` | user-management repository and generated types | No | current generated types; excluded migration only for table shape | Restore |
| `subjects`, `rooms`, `class_schedules`, `class_enrollments` | earlier class-attendance model only; not current generated types or repository queries | No | earlier foundation migration | Do not restore |
| `class_sessions` and class-linked attendance columns | abandoned class-attendance model | No | event-only cleanup | Do not restore |
| `event_sessions`, `attendance_records.event_session_id`, `verification_attempts.event_session_id` | live attendance, offline sync, facial attendance | Yes | verified canonical production model | Preserve unchanged |

## Selected class model

The restored `classes` table has normalized relationships to department,
program, section, semester, and faculty profile identity. `subject_code`,
`subject_title`, `room`, and `schedule_label` are intentional class-offering
snapshots: the current repository and generated types read them directly, and
there is no active subject, room, or schedule repository contract. A unique
offering index prevents duplicate offerings with the same program, section,
semester, subject code, and schedule label.

The rejected foundation model depends on `subjects`, `rooms`, and
`class_schedules`, all deliberately removed by the historical event-only
cleanup. Restoring it would create a competing `classes` model and reintroduce
unapproved class-attendance dependencies.

`class_rosters` is the approved membership model. `class_enrollments` is not
restored because it duplicates roster membership without a current application
contract. No compatibility columns are required.
