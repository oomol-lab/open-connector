-- The FFXLab fork already used migration numbers 0009-0011 for runtime-token
-- connection aliases, expiry, and input constraints. Keep those migrations
-- stable and add the upstream columns that were introduced under the same
-- numbers after the fork diverged.
alter table runtime_tokens add column allowed_proxies text not null default '[]';
alter table connections add column revision text not null default '';
