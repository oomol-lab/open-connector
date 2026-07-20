alter table runtime_tokens add column allowed_actions text not null default '[]';
alter table runtime_tokens add column blocked_actions text not null default '[]';
