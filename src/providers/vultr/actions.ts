import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "vultr";

const subscriptionReadPermission = "subscriptions_view";
const subscriptionWritePermission = "subscriptions";
const provisioningPermission = "provisioning";
const firewallPermission = "firewall";
const dnsPermission = "dns";

const instanceIdSchema = s.uuid("The Vultr instance ID.");
const cursorSchema = s.nonEmptyString("The next or previous cursor returned in pagination metadata.");
const perPageSchema = s.integer("Maximum number of items to return, from 1 to 500.", {
  minimum: 1,
  maximum: 500,
});
const paginationInputFields = {
  perPage: perPageSchema,
  cursor: cursorSchema,
};
const paginationMetaSchema = s.object(
  "Vultr cursor pagination metadata.",
  {
    total: s.nonNegativeInteger("Total number of matching resources."),
    links: s.object(
      "Cursors for adjacent result pages.",
      {
        next: s.string("Cursor for the next page. An empty string means there is no next page."),
        prev: s.string("Cursor for the previous page. An empty string means there is no previous page."),
      },
      { optional: ["next", "prev"] },
    ),
  },
  { optional: ["total", "links"] },
);

const accountSchema = s.looseObject("The Vultr account and billing profile.", {
  name: s.nonEmptyString("Account user name."),
  email: s.email("Account email address."),
  acls: s.stringArray("Vultr ACL permissions granted to the connected user."),
  balance: s.number("Current account balance."),
  pending_charges: s.number("Unbilled charges for the current month."),
  last_payment_date: s.string("Date of the last payment."),
  last_payment_amount: s.number("Amount of the last payment."),
});

const instanceSchema = s.looseObject("A Vultr VPS instance.", {
  id: instanceIdSchema,
  os: s.string("Installed operating system name."),
  os_id: s.integer("Installed operating system ID."),
  ram: s.nonNegativeInteger("Memory in MB."),
  disk: s.nonNegativeInteger("Disk capacity in GB."),
  main_ip: s.string("Main IPv4 address."),
  vcpu_count: s.nonNegativeInteger("Number of virtual CPUs."),
  region: s.string("Vultr region ID."),
  plan: s.string("Vultr plan ID."),
  date_created: s.string("Timestamp when the instance was created."),
  status: s.string("Current provisioning status."),
  power_status: s.stringEnum(["running", "stopped"], { description: "Current power state." }),
  server_status: s.string("Current server health state."),
  hostname: s.string("Instance hostname."),
  label: s.string("User-supplied instance label."),
  internal_ip: s.string("Private IP address when a VPC is attached."),
  firewall_group_id: s.string("Attached firewall group ID."),
  snapshot_id: s.string("Snapshot used to deploy this instance."),
  features: s.stringArray("Enabled instance features."),
  tags: s.stringArray("Tags applied to the instance."),
  default_password: s.string("Deployment password, available only briefly after creation."),
});

const regionSchema = s.looseObject("A Vultr deployment region.", {
  id: s.nonEmptyString("Unique region ID."),
  city: s.string("Region city."),
  country: s.string("Two-letter country code."),
  continent: s.string("Continent name."),
  options: s.stringArray("Product features available in the region."),
  connectivity: s.stringArray("Connectivity options available in the region."),
});

const planSchema = s.looseObject("A Vultr VPS plan.", {
  id: s.nonEmptyString("Unique plan ID."),
  name: s.string("Plan name."),
  vcpu_count: s.nonNegativeInteger("Number of virtual CPUs."),
  ram: s.nonNegativeInteger("Memory in MB."),
  disk: s.nonNegativeInteger("Disk capacity in GB."),
  disk_count: s.nonNegativeInteger("Number of included disks."),
  bandwidth: s.nonNegativeInteger("Monthly bandwidth quota in GB."),
  monthly_cost: s.number("Monthly price in US dollars."),
  hourly_cost: s.number("Hourly price in US dollars."),
  type: s.string("Vultr plan type."),
  locations: s.stringArray("Region IDs where the plan is available."),
  location_cost: s.record("Location-specific pricing keyed by region ID.", s.unknownObject("Regional pricing.")),
});

const operatingSystemSchema = s.looseObject("A Vultr operating system image.", {
  id: s.integer("Operating system ID."),
  name: s.string("Operating system name."),
  arch: s.string("CPU architecture."),
  family: s.string("Operating system family."),
});

const snapshotSchema = s.looseObject("A Vultr instance snapshot.", {
  id: s.uuid("Snapshot ID."),
  date_created: s.string("Timestamp when the snapshot was created."),
  description: s.string("User-supplied snapshot description."),
  size: s.nonNegativeInteger("Snapshot size in bytes."),
  compressed_size: s.nonNegativeInteger("Compressed snapshot size in bytes."),
  status: s.stringEnum(["pending", "complete", "deleted"], { description: "Snapshot status." }),
  os_id: s.integer("Operating system ID associated with the snapshot."),
  app_id: s.integer("Application ID associated with the snapshot."),
});

const firewallGroupSchema = s.looseObject("A Vultr firewall group.", {
  id: s.uuid("Firewall group ID."),
  description: s.string("User-supplied firewall group description."),
  date_created: s.string("Timestamp when the firewall group was created."),
  date_modified: s.string("Timestamp when the firewall group was last modified."),
  instance_count: s.nonNegativeInteger("Number of attached instances."),
  rule_count: s.nonNegativeInteger("Number of firewall rules."),
  max_rule_count: s.nonNegativeInteger("Maximum allowed firewall rules."),
});

const domainSchema = s.looseObject("A Vultr DNS domain.", {
  domain: s.nonEmptyString("Registered domain name."),
  date_created: s.string("Timestamp when the DNS domain was created."),
  dns_sec: s.stringEnum(["enabled", "disabled"], { description: "DNSSEC status." }),
});

const dnsRecordSchema = s.looseObject("A Vultr DNS record.", {
  id: s.uuid("DNS record ID."),
  type: s.stringEnum(["A", "AAAA", "CNAME", "NS", "MX", "SRV", "TXT", "CAA", "SSHFP"], {
    description: "DNS record type.",
  }),
  name: s.string("Record hostname."),
  data: s.string("Record data."),
  priority: s.nonNegativeInteger("Record priority when applicable."),
  ttl: s.nonNegativeInteger("Time to live in seconds."),
});

const createInstanceFields = {
  region: s.nonEmptyString("Region ID where the instance will be deployed."),
  plan: s.nonEmptyString("VPS plan ID for the instance."),
  osId: s.integer("Operating system ID used to deploy the instance."),
  isoId: s.nonEmptyString("ISO ID used to deploy the instance."),
  snapshotId: s.nonEmptyString("Snapshot ID used to deploy the instance."),
  appId: s.integer("Marketplace application ID used to deploy the instance."),
  imageId: s.nonEmptyString("Marketplace application image ID used to deploy the instance."),
  label: s.nonEmptyString("User-supplied instance label."),
  hostname: s.nonEmptyString("Hostname assigned during deployment."),
  enableIpv6: s.boolean("Whether to enable IPv6."),
  disablePublicIpv4: s.boolean("Whether to omit public IPv4 when IPv6 is enabled."),
  backups: s.stringEnum(["enabled", "disabled"], { description: "Automatic backup setting." }),
  ddosProtection: s.boolean("Whether to enable paid DDoS protection."),
  activationEmail: s.boolean("Whether Vultr should email after deployment."),
  firewallGroupId: s.nonEmptyString("Firewall group ID to attach."),
  sshKeyIds: s.stringArray("SSH key IDs to install.", { minItems: 1, itemDescription: "A Vultr SSH key ID." }),
  vpcIds: s.stringArray("VPC IDs to attach.", { minItems: 1, itemDescription: "A Vultr VPC ID." }),
  tags: s.stringArray("Tags to apply to the instance.", { minItems: 1, itemDescription: "An instance tag." }),
  userData: s.nonEmptyString("Base64-encoded user data attached to the instance."),
  userScheme: s.stringEnum(["root", "limited"], { description: "Linux login user scheme." }),
};
const deploymentSourceFields = ["osId", "isoId", "snapshotId", "appId", "imageId"];
const createInstanceOptionalFields = Object.keys(createInstanceFields).filter(
  (field) => field !== "region" && field !== "plan",
);
const createInstanceInputSchema = s.oneOf(
  deploymentSourceFields.map((sourceField) =>
    s.object(createInstanceFields, {
      required: ["region", "plan", sourceField],
      optional: createInstanceOptionalFields.filter((field) => field !== sourceField),
    }),
  ),
  {
    description:
      "Vultr instance deployment settings. Supply region, plan, and exactly one deployment source: osId, isoId, snapshotId, appId, or imageId.",
  },
);

const updateInstanceFields = {
  label: s.nonEmptyString("New user-supplied instance label."),
  plan: s.nonEmptyString("Plan ID to upgrade the instance to."),
  backups: s.stringEnum(["enabled", "disabled"], { description: "Automatic backup setting." }),
  firewallGroupId: s.nonEmptyString("Firewall group ID to attach."),
  enableIpv6: s.boolean("Whether to enable IPv6."),
  ddosProtection: s.boolean("Whether to enable paid DDoS protection."),
  tags: s.stringArray("Replacement tags for the instance.", { itemDescription: "An instance tag." }),
};
const updateInstanceInputSchema: JsonSchema = {
  ...s.object(
    "Fields to update on an existing Vultr instance.",
    { instanceId: instanceIdSchema, ...updateInstanceFields },
    { required: ["instanceId"], optional: Object.keys(updateInstanceFields) },
  ),
  anyOf: Object.keys(updateInstanceFields).map((field) => ({ required: [field] })),
};

export const vultrActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account",
    description: "Retrieve the connected Vultr account profile, ACL permissions, balance, and billing summary.",
    inputSchema: s.object({}, { description: "No input is required." }),
    outputSchema: s.actionOutput({ account: accountSchema }, "The connected Vultr account."),
  }),
  defineProviderAction(service, {
    name: "list_instances",
    description: "List Vultr VPS instances with cursor pagination and common instance filters.",
    requiredScopes: [subscriptionReadPermission],
    inputSchema: s.object(
      "Filters and pagination for Vultr instances.",
      {
        ...paginationInputFields,
        label: s.nonEmptyString("Only return instances with this label."),
        mainIp: s.nonEmptyString("Only return the instance with this main IP address."),
        region: s.nonEmptyString("Only return instances in this region ID."),
        firewallGroupId: s.nonEmptyString("Only return instances attached to this firewall group ID."),
        hostname: s.nonEmptyString("Only return instances with this hostname."),
        showPendingCharges: s.boolean("Whether to include pending charges for each instance."),
      },
      {
        optional: [
          "perPage",
          "cursor",
          "label",
          "mainIp",
          "region",
          "firewallGroupId",
          "hostname",
          "showPendingCharges",
        ],
      },
    ),
    outputSchema: listOutputSchema("instances", "Vultr instances in this page.", instanceSchema),
    followUpActions: ["vultr.get_instance"],
  }),
  defineProviderAction(service, {
    name: "get_instance",
    description: "Retrieve one Vultr VPS instance by ID.",
    requiredScopes: [subscriptionReadPermission],
    inputSchema: s.actionInput({ instanceId: instanceIdSchema }, ["instanceId"], "The Vultr instance to retrieve."),
    outputSchema: s.actionOutput({ instance: instanceSchema }, "The requested Vultr instance."),
    followUpActions: ["vultr.update_instance", "vultr.manage_instance_power", "vultr.delete_instance"],
  }),
  defineProviderAction(service, {
    name: "create_instance",
    description: "Create a Vultr VPS instance from an OS, ISO, snapshot, application, or application image.",
    requiredScopes: [provisioningPermission],
    inputSchema: createInstanceInputSchema,
    outputSchema: s.actionOutput({ instance: instanceSchema }, "The newly created Vultr instance."),
    followUpActions: ["vultr.get_instance", "vultr.manage_instance_power"],
    asyncLifecycle: {
      startActionId: "vultr.create_instance",
      statusActionId: "vultr.get_instance",
    },
  }),
  defineProviderAction(service, {
    name: "update_instance",
    description: "Update common settings on a Vultr VPS instance without reinstalling it.",
    requiredScopes: [subscriptionWritePermission],
    inputSchema: updateInstanceInputSchema,
    outputSchema: s.actionOutput({ instance: instanceSchema }, "The updated Vultr instance."),
    followUpActions: ["vultr.get_instance"],
  }),
  defineProviderAction(service, {
    name: "delete_instance",
    description: "Permanently delete a Vultr VPS instance.",
    requiredScopes: [subscriptionWritePermission],
    inputSchema: s.actionInput({ instanceId: instanceIdSchema }, ["instanceId"], "The Vultr instance to delete."),
    outputSchema: s.actionOutput(
      {
        deleted: s.literal(true, { description: "Whether Vultr accepted the deletion." }),
        instanceId: instanceIdSchema,
      },
      "Confirmation that a Vultr instance was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "manage_instance_power",
    description: "Start, reboot, or halt a Vultr VPS instance.",
    requiredScopes: [subscriptionWritePermission],
    inputSchema: s.actionInput(
      {
        instanceId: instanceIdSchema,
        operation: s.stringEnum(["start", "reboot", "halt"], {
          description: "Power operation to perform on the instance.",
        }),
      },
      ["instanceId", "operation"],
      "A Vultr instance power operation.",
    ),
    outputSchema: s.actionOutput(
      {
        accepted: s.literal(true, { description: "Whether Vultr accepted the power operation." }),
        instanceId: instanceIdSchema,
        operation: s.stringEnum(["start", "reboot", "halt"], {
          description: "Accepted power operation.",
        }),
      },
      "Acknowledgement for a Vultr instance power operation.",
    ),
    followUpActions: ["vultr.get_instance"],
  }),
  defineProviderAction(service, {
    name: "list_regions",
    description: "List Vultr deployment regions and the product features available in each region.",
    inputSchema: paginationInputSchema("Pagination for Vultr regions."),
    outputSchema: listOutputSchema("regions", "Vultr regions in this page.", regionSchema),
    followUpActions: ["vultr.list_plans", "vultr.create_instance"],
  }),
  defineProviderAction(service, {
    name: "list_plans",
    description: "List Vultr VPS plans with optional plan-type and Windows compatibility filters.",
    inputSchema: s.object(
      "Filters and pagination for Vultr plans.",
      {
        ...paginationInputFields,
        type: s.stringEnum(["all", "vc2", "vdc", "vhf", "vhp", "voc", "voc-g", "voc-c", "voc-m", "voc-s", "vcg"], {
          description: "Vultr plan type to return.",
        }),
        operatingSystem: s.literal("windows", { description: "Return only plans that support Windows." }),
      },
      { optional: ["perPage", "cursor", "type", "operatingSystem"] },
    ),
    outputSchema: listOutputSchema("plans", "Vultr plans in this page.", planSchema),
    followUpActions: ["vultr.list_regions", "vultr.create_instance"],
  }),
  defineProviderAction(service, {
    name: "list_operating_systems",
    description: "List operating system images available for Vultr instance deployment.",
    inputSchema: paginationInputSchema("Pagination for Vultr operating systems."),
    outputSchema: listOutputSchema("operatingSystems", "Vultr operating systems in this page.", operatingSystemSchema),
    followUpActions: ["vultr.create_instance"],
  }),
  defineProviderAction(service, {
    name: "list_snapshots",
    description: "List snapshots in the connected Vultr account, optionally filtered by description.",
    requiredScopes: [subscriptionReadPermission],
    inputSchema: s.object(
      "Filters and pagination for Vultr snapshots.",
      {
        ...paginationInputFields,
        description: s.nonEmptyString("Only return snapshots matching this description filter."),
      },
      { optional: ["perPage", "cursor", "description"] },
    ),
    outputSchema: listOutputSchema("snapshots", "Vultr snapshots in this page.", snapshotSchema),
    followUpActions: ["vultr.create_instance"],
  }),
  defineProviderAction(service, {
    name: "list_firewall_groups",
    description: "List firewall groups in the connected Vultr account.",
    requiredScopes: [firewallPermission],
    inputSchema: paginationInputSchema("Pagination for Vultr firewall groups."),
    outputSchema: listOutputSchema("firewallGroups", "Vultr firewall groups in this page.", firewallGroupSchema),
  }),
  defineProviderAction(service, {
    name: "list_domains",
    description: "List DNS domains in the connected Vultr account.",
    requiredScopes: [dnsPermission],
    inputSchema: paginationInputSchema("Pagination for Vultr DNS domains."),
    outputSchema: listOutputSchema("domains", "Vultr DNS domains in this page.", domainSchema),
    followUpActions: ["vultr.list_domain_records"],
  }),
  defineProviderAction(service, {
    name: "list_domain_records",
    description: "List DNS records for one domain in the connected Vultr account.",
    requiredScopes: [dnsPermission],
    inputSchema: s.object(
      "Domain and pagination for Vultr DNS records.",
      {
        domain: s.nonEmptyString("Registered domain name whose DNS records should be listed."),
        ...paginationInputFields,
      },
      { required: ["domain"], optional: ["perPage", "cursor"] },
    ),
    outputSchema: listOutputSchema("records", "Vultr DNS records in this page.", dnsRecordSchema),
  }),
];

function paginationInputSchema(description: string): JsonSchema {
  return s.object(description, paginationInputFields, { optional: ["perPage", "cursor"] });
}

function listOutputSchema(key: string, description: string, itemSchema: JsonSchema): JsonSchema {
  return s.object(
    `A cursor-paginated Vultr ${key} response.`,
    {
      [key]: s.array(description, itemSchema),
      meta: paginationMetaSchema,
    },
    { required: [key], optional: ["meta"] },
  );
}
