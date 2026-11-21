alter table connections add column scope text;
alter table runtime_tokens add column scope text;
alter table runs add column scope text;
create index runs_scope_started_at_id_idx on runs (scope, started_at desc, id desc);
create index connections_scope_service_name_idx on connections (scope, service, connection_name);
