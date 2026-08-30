begin;

insert into public.event_categories (category_name)
values
	('Assembly'),
	('Seminar'),
	('Workshop'),
	('Orientation'),
	('Training'),
	('Athletic Event'),
	('Ceremony'),
	('Rehearsal/Practice'),
	('Cultural Program'),
	('Election Activity')
on conflict (lower(category_name)) do nothing;

commit;
