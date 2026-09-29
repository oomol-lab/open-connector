alter table managed_project add column cleanup_paused integer not null default 0;
alter table saas_cleanup add column service text;
alter table saas_cleanup add column request_expires_at text;

update saas_cleanup set
  service = (select service from connection_requests where 'request:' || id = saas_cleanup.id),
  request_expires_at = (select expires_at from connection_requests where 'request:' || id = saas_cleanup.id)
where remote_request_id is not null;
