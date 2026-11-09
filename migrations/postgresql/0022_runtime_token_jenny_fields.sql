alter table runtime_tokens add column expires_at text;
alter table runtime_tokens add column action_input_constraints text not null default '{}';
