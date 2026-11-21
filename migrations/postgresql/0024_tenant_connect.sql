alter table runtime_tokens add column allow_connect integer not null default 0 check (allow_connect in (0, 1));
