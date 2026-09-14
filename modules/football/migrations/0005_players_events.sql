alter table players add column if not exists age int;
alter table players add column if not exists birth_date date;
alter table match_events add column if not exists source text;
create index if not exists match_events_match on match_events (match_id);
