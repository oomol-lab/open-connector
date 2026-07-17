create table connections_next (
  id text not null unique,
  service text not null,
  connection_name text not null,
  value text not null,
  updated_at text not null,
  primary key (service, connection_name)
);

insert into connections_next (id, service, connection_name, value, updated_at)
select
  lower(hex(randomblob(4))) || '-' ||
  lower(hex(randomblob(2))) || '-4' ||
  substr(lower(hex(randomblob(2))), 2) || '-' ||
  substr('89ab', (random() & 3) + 1, 1) ||
  substr(lower(hex(randomblob(2))), 2) || '-' ||
  lower(hex(randomblob(6))),
  service,
  connection_name,
  value,
  updated_at
from connections;

update runs
set value = json_set(
  value,
  '$.connectionId',
  (
    select id
    from connections_next
    where json_extract(runs.value, '$.connectionId') = service || ':' || connection_name
  )
)
where exists (
  select 1
  from connections_next
  where json_extract(runs.value, '$.connectionId') = service || ':' || connection_name
);

drop table connections;
alter table connections_next rename to connections;
