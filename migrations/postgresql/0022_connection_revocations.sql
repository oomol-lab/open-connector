create table connection_revocations (
  generation text not null,
  authorization_key text not null,
  primary key (generation, authorization_key)
);
