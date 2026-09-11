begin;

alter table public.attendance_records
  add column if not exists late_reason text;

drop function if exists public.submit_late_reason(uuid, text);

create or replace function public.submit_late_reason(
  p_attendance_record_id uuid,
  p_late_reason_category text,
  p_late_reason text default null
)
returns public.attendance_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id uuid;
  v_record public.attendance_records;
begin
  v_student_id := private.current_student_id();

  if v_student_id is null then
    raise exception 'Authenticated student profile is required.'
      using errcode = '42501';
  end if;

  if p_late_reason_category not in (
    'Traffic / Commute',
    'Class or Academic Conflict',
    'Personal / Health',
    'Weather / Force Majeure',
    'Other'
  ) then
    raise exception 'Invalid late reason category.'
      using errcode = '22023';
  end if;

  update public.attendance_records
  set
    late_reason_category = p_late_reason_category,
    late_reason = p_late_reason,
    updated_at = now()
  where id = p_attendance_record_id
    and student_id = v_student_id
    and attendance_status = 'late'
  returning * into v_record;

  if not found then
    raise exception 'Late attendance record was not found for this student.'
      using errcode = 'P0002';
  end if;

  return v_record;
end;
$$;

revoke all on function public.submit_late_reason(uuid, text, text) from public, anon;
grant execute on function public.submit_late_reason(uuid, text, text) to authenticated;

commit;
