-- trigger_source_applications.id is a content digest of caller-controlled
-- input (owner + app id), so the primary key becomes (tenant_id, id). A global
-- key would let one tenant's row silently absorb another tenant's insert.
create table trigger_source_applications_next (
  tenant_id text not null default 'local',
  id text not null,
  owner text not null,
  revision integer not null,
  value text not null,
  primary key (tenant_id, id)
);
insert into trigger_source_applications_next (tenant_id, id, owner, revision, value)
select tenant_id, id, owner, revision, value
from trigger_source_applications;
drop table trigger_source_applications;
alter table trigger_source_applications_next rename to trigger_source_applications;
