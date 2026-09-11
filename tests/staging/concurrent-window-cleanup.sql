-- Exact staging-only cleanup for STG-CONCURRENT-WINDOW.
do $$ declare ev uuid; d uuid; p uuid; sec uuid; cat uuid; begin
 select id into ev from public.events where event_code='STG-CONCURRENT-WINDOW'; select id into d from public.departments where department_code='STG-CW'; select id into p from public.programs where department_id=d and program_code='STG-CW'; select id into sec from public.sections where program_id=p and section_name='CW' and academic_year='2099-2100' and semester='Concurrent Window'; select id into cat from public.event_categories where category_name='Staging Concurrent Window';
 if ev is not null then delete from public.events where id=ev; end if;
 delete from auth.users where email in ('plpass-concurrent-organizer@staging.invalid','plpass-concurrent-student@staging.invalid');
 if cat is not null and not exists(select 1 from public.events where category_id=cat) then delete from public.event_categories where id=cat; end if;
 if sec is not null and not exists(select 1 from public.students where section_id=sec) then delete from public.sections where id=sec; end if;
 if p is not null and not exists(select 1 from public.students where program_id=p) then delete from public.programs where id=p; end if;
 if d is not null and not exists(select 1 from public.programs where department_id=d) then delete from public.departments where id=d; end if;
end $$;
