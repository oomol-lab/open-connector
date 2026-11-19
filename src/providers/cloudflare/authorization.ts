import type { AuthType, OAuthAuthorizationOption } from "../../core/types.ts";

export const cloudflareTokenAuthTypes: AuthType[] = ["api_key", "oauth2"];
export const cloudflareAuthTypes: AuthType[] = [...cloudflareTokenAuthTypes, "custom_credential"];

const permissions: Array<readonly [string, string, string]> = [
  ["account-settings.read", "Read accounts", "List accounts and read account settings."],
  ["memberships.read", "Read memberships", "List accounts you belong to."],
  ["dns.read", "Read DNS", "Read DNS records."],
  ["dns.write", "Manage DNS", "Create, update, and delete DNS records."],
  ["zone.read", "Read zones", "Read domains and their nameservers."],
  ["zone.write", "Manage zones", "Create and manage domain zones."],
  ["zone-settings.read", "Read zone settings", "Inspect SSL and cache settings."],
  ["zone-dns-settings.read", "Read DNS settings", "Inspect zone DNS settings."],
  ["page.read", "Read Pages", "Inspect Pages projects and deployments."],
  ["page.write", "Manage Pages", "Create sites, deploy assets, and configure domains and environment variables."],
  ["workers-scripts.read", "Read Workers", "Read Worker code and settings."],
  ["workers-scripts.write", "Update Workers", "Deploy and configure existing Workers."],
  ["workers-scripts.admin", "Manage Workers", "Create and delete Workers as well as deploying code."],
  ["workers-ci.read", "Read builds", "Inspect Worker builds and logs."],
  ["workers-ci.write", "Manage builds", "Start and cancel Worker builds."],
  ["workers-kv-storage.read", "Read KV", "Read namespaces and stored values."],
  ["workers-kv-storage.write", "Manage KV", "Create namespaces and manage stored values."],
  ["workers-routes.read", "Read Worker routes", "Inspect routes and custom domains."],
  ["workers-routes.write", "Manage Worker routes", "Connect Workers to routes and custom domains."],
  ["workers-r2.read", "Read R2", "Read buckets, objects, and storage settings."],
  ["workers-r2.write", "Manage R2", "Manage buckets, objects, and storage settings."],
  ["queues.read", "Read Queues", "Inspect queues used by R2 event notifications."],
  ["queues.write", "Manage Queues", "Configure queues used by R2 event notifications."],
  ["email-routing-address.read", "Read email destinations", "List email forwarding destinations."],
  ["email-routing-rule.read", "Read email routing", "Inspect email forwarding rules."],
  ["email-routing-rule.write", "Manage email routing", "Create, update, and delete email forwarding rules."],
  ["browser-rendering.read", "Read Browser Run", "Read browser rendering resources."],
  ["browser-rendering.write", "Run browser rendering", "Render pages and extract structured content."],
];

export const cloudflareAuthorizationOptions: OAuthAuthorizationOption[] = permissions.map(
  ([id, label, description]) => ({
    id: id,
    label: label,
    description: description,
    risk: id.endsWith(".read") ? "standard" : "sensitive",
  }),
);

export const cloudflareDefaultScopes: string[] = ["offline_access", "account-settings.read", "zone.read", "dns.read"];
