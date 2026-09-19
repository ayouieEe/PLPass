-- Read-only incident checks for PLPass Current.
-- These do not configure alerts, terminate sessions, or mutate schema.

-- 1) Aborted transactions: review rows older than 30 seconds first.
select
  now() as observed_at,
  pid,
  usename,
  application_name,
  client_addr,
  state,
  xact_start,
  query_start,
  now() - coalesce(xact_start, query_start) as age,
  wait_event_type,
  wait_event,
  left(query, 500) as query
from pg_stat_activity
where state = 'idle in transaction (aborted)'
order by age desc nulls last;

-- 2) CPU-pressure proxy: take two snapshots several minutes apart and
-- compare calls/total_exec_time/shared blocks for the same queryid.
-- The dashboard CPU graph remains the authoritative CPU measurement.
select
  now() as observed_at,
  queryid,
  calls,
  round(total_exec_time::numeric, 2) as total_exec_ms,
  shared_blks_hit,
  shared_blks_read,
  rows,
  left(query, 500) as query
from pg_stat_statements
where calls > 0
order by total_exec_time desc
limit 25;

