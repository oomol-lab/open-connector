alter table runs add column service text;

update runs
set service = case
  when instr(action_id, '.') > 0 then substr(action_id, 1, instr(action_id, '.') - 1)
  else action_id
end
where service is null;

create index if not exists runs_service_started_at_id_idx on runs (service, started_at desc, id desc);
