import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "digital_ocean";

const noInputSchema = s.object({}, { description: "No input is required." });
const rawObjectSchema = s.looseObject({}, { description: "A raw DigitalOcean object." });
const pageField = s.positiveInteger("Page number to return.");
const perPageField = s.integer("Maximum number of results to return per page.", { minimum: 1, maximum: 200 });
const dropletIdField = s.positiveInteger("Numeric identifier of the Droplet.");
const tagNameField = s.string("Only return resources assigned to this exact tag.", { minLength: 1 });
const paginationInputSchema = s.object(
  {
    page: pageField,
    perPage: perPageField,
  },
  { optional: ["page", "perPage"], description: "Pagination parameters for a DigitalOcean list request." },
);
const linksSchema = s.looseObject({}, { description: "Pagination links returned by DigitalOcean, when present." });
const metaSchema = s.looseObject({}, { description: "Pagination metadata returned by DigitalOcean, when present." });
const accountSchema = s.looseObject(
  {
    uuid: s.string("Unique identifier of the account."),
    email: s.email("Email address of the current account."),
    name: s.string("Display name of the current account, when present."),
    status: s.stringEnum(["active", "warning", "locked"], { description: "Current account status." }),
  },
  { description: "DigitalOcean account." },
);
const dropletSchema = s.looseObject(
  {
    id: s.integer("Numeric identifier of the Droplet."),
    name: s.string("Droplet name."),
    status: s.string("Current Droplet status."),
    created_at: s.dateTime("Timestamp when the Droplet was created."),
  },
  { description: "DigitalOcean Droplet." },
);
const actionSchema = s.looseObject(
  {
    id: s.integer("Numeric identifier of the Droplet action."),
    status: s.string("Current action status."),
    type: s.string("Action type accepted by the Droplet actions API."),
  },
  { description: "DigitalOcean Droplet action." },
);

export const digitalOceanActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account",
    description: "Retrieve the current DigitalOcean account profile and team context for the connected token.",
    requiredScopes: ["account:read"],
    inputSchema: noInputSchema,
    outputSchema: s.requiredObject("Current DigitalOcean account.", { account: accountSchema }),
  }),
  defineProviderAction(service, {
    name: "list_droplets",
    description: "List DigitalOcean Droplets with pagination and optional filtering by tag, name, or droplet type.",
    requiredScopes: ["droplet:read"],
    inputSchema: s.object(
      "Input for listing DigitalOcean Droplets.",
      {
        page: pageField,
        perPage: perPageField,
        tagName: tagNameField,
        name: s.string("Only return Droplets whose name exactly matches this value, case-insensitively.", {
          minLength: 1,
        }),
        type: s.stringEnum(["droplets", "gpus"], { description: "Return standard Droplets or only GPU Droplets." }),
      },
      { optional: ["page", "perPage", "tagName", "name", "type"] },
    ),
    outputSchema: s.object(
      "Paginated DigitalOcean Droplet list.",
      {
        droplets: s.array("Droplets returned for the current page.", dropletSchema),
        links: linksSchema,
        meta: metaSchema,
      },
      { required: ["droplets"], optional: ["links", "meta"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_droplet",
    description: "Retrieve one DigitalOcean Droplet by numeric droplet ID.",
    requiredScopes: ["droplet:read"],
    inputSchema: s.requiredObject("Input for retrieving a DigitalOcean Droplet.", { dropletId: dropletIdField }),
    outputSchema: s.requiredObject("Single DigitalOcean Droplet.", { droplet: dropletSchema }),
  }),
  defineProviderAction(service, {
    name: "manage_droplet_lifecycle",
    description: "Initiate a basic DigitalOcean Droplet lifecycle action such as reboot, shutdown, or power cycle.",
    requiredScopes: ["droplet:update"],
    inputSchema: s.requiredObject("Input for initiating a DigitalOcean Droplet lifecycle action.", {
      dropletId: dropletIdField,
      type: s.stringEnum(["reboot", "power_cycle", "shutdown", "power_on", "power_off"], {
        description: "Lifecycle action to initiate for the Droplet.",
      }),
    }),
    outputSchema: s.requiredObject("DigitalOcean Droplet action acknowledgement.", { action: actionSchema }),
  }),
  defineProviderAction(service, {
    name: "list_apps",
    description: "List DigitalOcean App Platform apps with pagination and optional project enrichment.",
    requiredScopes: ["app:read"],
    inputSchema: s.object(
      "Input for listing DigitalOcean apps.",
      { page: pageField, perPage: perPageField, withProjects: s.boolean("Include project IDs.") },
      { optional: ["page", "perPage", "withProjects"] },
    ),
    outputSchema: listOutputSchema("apps", "Apps returned for the current page."),
  }),
  defineProviderAction(service, {
    name: "list_databases",
    description: "List DigitalOcean managed database clusters, optionally filtered by tag.",
    requiredScopes: ["database:read"],
    inputSchema: s.object({ tagName: tagNameField }, { optional: ["tagName"], description: "Database list filters." }),
    outputSchema: s.requiredObject("DigitalOcean database cluster list.", {
      databases: s.array("Database clusters returned by DigitalOcean.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_firewalls",
    description: "List DigitalOcean cloud firewalls with pagination.",
    requiredScopes: ["firewall:read"],
    inputSchema: paginationInputSchema,
    outputSchema: listOutputSchema("firewalls", "Firewalls returned for the current page."),
  }),
  defineProviderAction(service, {
    name: "list_load_balancers",
    description: "List DigitalOcean load balancers with pagination.",
    requiredScopes: ["load_balancer:read"],
    inputSchema: paginationInputSchema,
    outputSchema: listOutputSchema("loadBalancers", "Load balancers returned for the current page."),
  }),
  defineProviderAction(service, {
    name: "list_domains",
    description: "List DigitalOcean DNS domains with pagination.",
    requiredScopes: ["domain:read"],
    inputSchema: paginationInputSchema,
    outputSchema: listOutputSchema("domains", "Domains returned for the current page."),
  }),
  defineProviderAction(service, {
    name: "list_domain_records",
    description: "List DNS records for one DigitalOcean domain, optionally filtered by record name or type.",
    requiredScopes: ["domain:read"],
    inputSchema: s.object(
      "Input for listing DigitalOcean domain records.",
      {
        domainName: s.string("The exact domain name whose DNS records should be listed.", { minLength: 1 }),
        page: pageField,
        perPage: perPageField,
        name: s.string("Only return records whose fully qualified name exactly matches this value.", { minLength: 1 }),
        type: s.stringEnum(["A", "AAAA", "CAA", "CNAME", "MX", "NS", "TXT", "SRV", "SOA"], {
          description: "Only return DNS records of this record type.",
        }),
      },
      { required: ["domainName"], optional: ["page", "perPage", "name", "type"] },
    ),
    outputSchema: listOutputSchema("domainRecords", "Domain records returned for the current page."),
  }),
  defineProviderAction(service, {
    name: "list_vpcs",
    description: "List DigitalOcean VPC networks with pagination.",
    requiredScopes: ["vpc:read"],
    inputSchema: paginationInputSchema,
    outputSchema: listOutputSchema("vpcs", "VPC networks returned for the current page."),
  }),
];

function listOutputSchema(key: string, description: string) {
  return s.object(
    `Paginated DigitalOcean ${key} list.`,
    {
      [key]: s.array(description, rawObjectSchema),
      links: linksSchema,
      meta: metaSchema,
    },
    { required: [key], optional: ["links", "meta"] },
  );
}
