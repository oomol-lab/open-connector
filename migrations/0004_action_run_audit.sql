alter table runs add column caller text;
update runs set caller = coalesce(json_extract(value, '$.caller'), 'http');

create index runs_action_id_started_at_id_idx on runs (action_id, started_at desc, id desc);
create index runs_caller_started_at_id_idx on runs (caller, started_at desc, id desc);
create index runs_ok_started_at_id_idx on runs (ok, started_at desc, id desc);
