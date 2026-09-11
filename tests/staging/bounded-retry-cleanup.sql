-- Exact staging-only cleanup for STG-BOUNDED-RETRY.
do $$ declare ev uuid; d uuid; p uuid; sec uuid; cat uuid; begin
 select id into ev from public.events where event_code='STG-BOUNDED-RETRY'; select id into d from public.departments where department_code='STG-BR'; select id into p from public.programs where department_id=d and program_code='STG-BR'; select id into sec from public.sections where program_id=p and section_name='BR' and academic_year='2099-2100' and semester='Bounded Retry'; select id into cat from public.event_categories where category_name='Staging Bounded Retry';
 if ev is not null then delete from public.events where id=ev; end if;
 delete from auth.users where email in ('plpass-bounded-retry-organizer@staging.invalid','plpass-bounded-retry-student@staging.invalid');
 if cat is not null and not exists(select 1 from public.events where category_id=cat) then delete from public.event_categories where id=cat; end if;
 if sec is not null and not exists(select 1 from public.students where section_id=sec) then delete from public.sections where id=sec; end if;
 if p is not null and not exists(select 1 from public.students where program_id=p) then delete from public.programs where id=p; end if;
 if d is not null and not exists(select 1 from public.programs where department_id=d) then delete from public.departments where id=d; end if;
end $$;
