begin;

-- Older expiry runs changed only task_status. Bring those historical rows to
-- the same absent/finalized contract used by the current expiry function.
update public.attendance_records ar
set attendance_status = 'absent',
    finalized_at = coalesce(ar.finalized_at, now()),
    remarks = case
      when ar.attendance_status <> 'absent'
        then concat_ws(E'\n', ar.remarks, 'Attendance changed to absent: required feedback was not submitted within 24 hours.')
      else ar.remarks
    end,
    updated_at = now()
from public.event_feedback_tasks task
where task.attendance_record_id = ar.id
  and task.task_status = 'expired'
  and (ar.finalized_at is null or ar.attendance_status <> 'absent');

commit;
