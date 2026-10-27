create table trigger_source_applications (
  id text primary key,
  owner text not null,
  revision integer not null,
  value text not null
);
