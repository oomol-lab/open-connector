update connections
set service = 'cloudflare'
where service = 'cloudflare_mcp';

update oauth_client_configs
set service = 'cloudflare'
where service = 'cloudflare_mcp';

update oauth_states
set value = json_set(value, '$.service', 'cloudflare')
where json_extract(value, '$.service') = 'cloudflare_mcp';

update runs
set
  service = 'cloudflare',
  action_id = replace(action_id, 'cloudflare_mcp.', 'cloudflare.'),
  value = replace(
    replace(value, 'cloudflare_mcp.', 'cloudflare.'),
    '"cloudflare_mcp"',
    '"cloudflare"'
  )
where service = 'cloudflare_mcp';

update runtime_tokens
set
  allowed_actions = replace(allowed_actions, 'cloudflare_mcp.', 'cloudflare.'),
  blocked_actions = replace(blocked_actions, 'cloudflare_mcp.', 'cloudflare.'),
  allowed_proxies = replace(allowed_proxies, '"cloudflare_mcp"', '"cloudflare"')
where
  allowed_actions like '%cloudflare_mcp.%'
  or blocked_actions like '%cloudflare_mcp.%'
  or allowed_proxies like '%"cloudflare_mcp"%';

update runtime_policy
set value = replace(
  replace(value, 'cloudflare_mcp.', 'cloudflare.'),
  '"cloudflare_mcp"',
  '"cloudflare"'
)
where value like '%cloudflare_mcp%';
