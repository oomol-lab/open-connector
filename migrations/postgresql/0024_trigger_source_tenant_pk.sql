alter table trigger_source_applications
  drop constraint trigger_source_applications_pkey,
  add primary key (tenant_id, id);
