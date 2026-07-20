create table runtime_policy (
  id integer primary key check (id = 1),
  value text not null,
  updated_at text not null
);
