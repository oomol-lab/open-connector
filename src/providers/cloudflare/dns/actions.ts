import type { ActionDefinition } from "../../../core/types.ts";

import { s } from "../../../core/json-schema.ts";
import { defineProviderAction } from "../../../core/provider-definition.ts";
import { cloudflareTokenAuthTypes } from "../authorization.ts";

const service = "cloudflare";
const accountId = s.string("The account ID. Defaults to the connection account, or the only accessible account.");
const zoneId = s.nonEmptyString("The zone ID.");
const record = s.looseObject("The Cloudflare resource, including additional upstream fields.");
const resultOutput = { result: record };
const zoneReadScope = "zone.read";
const dnsReadScope = "dns.read";
const dnsWriteScope = "dns.write";
const zoneReadPermission = "Zone Read";
const dnsReadPermission = "DNS Read";
const dnsWritePermission = "DNS Write";

const dnsRecordTypes = [
  "A",
  "AAAA",
  "CAA",
  "CERT",
  "CNAME",
  "DNSKEY",
  "DS",
  "HTTPS",
  "LOC",
  "MX",
  "NAPTR",
  "NS",
  "OPENPGPKEY",
  "PTR",
  "SMIMEA",
  "SRV",
  "SSHFP",
  "SVCB",
  "TLSA",
  "TXT",
  "URI",
] as const;

const zoneIdSchema = s.nonEmptyString("The Cloudflare zone ID.");
const dnsRecordIdSchema = s.nonEmptyString("The Cloudflare DNS record ID.");
const dnsRecordTypeSchema = s.stringEnum([...dnsRecordTypes], { description: "The DNS record type." });
const looseObjectSchema = s.looseObject("A free-form object accepted by the Cloudflare API.");

const resultInfoSchema = s.object(
  "Cloudflare pagination metadata.",
  {
    page: s.integer("The current page number."),
    perPage: s.integer("The page size."),
    count: s.integer("The number of items in the current page."),
    totalCount: s.integer("The total number of matching items."),
    totalPages: s.integer("The total number of pages."),
  },
  { optional: ["page", "perPage", "count", "totalCount", "totalPages"] },
);

const zoneAccountSchema = s.object(
  "The Cloudflare account linked to a zone.",
  {
    id: s.string("The Cloudflare account ID."),
    name: s.string("The Cloudflare account name."),
    type: s.string("The Cloudflare account type."),
  },
  { optional: ["id", "name", "type"] },
);

const zoneSchema = s.object(
  "A Cloudflare zone summary.",
  {
    id: s.string("The zone ID."),
    name: s.string("The zone name."),
    status: s.string("The zone status."),
    type: s.string("The zone type."),
    paused: s.boolean("Whether the zone is paused."),
    createdOn: s.string("The zone creation timestamp."),
    modifiedOn: s.string("The last zone update timestamp."),
    nameServers: s.stringArray("The assigned name servers."),
    originalNameServers: s.stringArray("The original name servers reported by Cloudflare."),
    account: zoneAccountSchema,
    meta: looseObjectSchema,
  },
  {
    required: ["id", "name"],
    optional: [
      "status",
      "type",
      "paused",
      "createdOn",
      "modifiedOn",
      "nameServers",
      "originalNameServers",
      "account",
      "meta",
    ],
  },
);

const dnsRecordSchema = s.object(
  "A Cloudflare DNS record.",
  {
    id: s.string("The DNS record ID."),
    zoneId: s.string("The parent zone ID."),
    zoneName: s.string("The parent zone name."),
    type: s.string("The DNS record type."),
    name: s.string("The record name."),
    content: s.nullable(s.string("The record content.")),
    ttl: s.integer("The DNS TTL in seconds."),
    proxied: s.boolean("Whether Cloudflare proxying is enabled."),
    proxiable: s.boolean("Whether the record can be proxied."),
    priority: s.integer("The record priority."),
    comment: s.nullable(s.string("The record comment.")),
    tags: s.stringArray("The record tags."),
    createdOn: s.string("The record creation timestamp."),
    modifiedOn: s.string("The last record update timestamp."),
    commentModifiedOn: s.string("The comment update timestamp."),
    tagsModifiedOn: s.string("The tag update timestamp."),
    data: looseObjectSchema,
    meta: looseObjectSchema,
    settings: looseObjectSchema,
  },
  {
    required: ["id", "type", "name"],
    optional: [
      "zoneId",
      "zoneName",
      "content",
      "ttl",
      "proxied",
      "proxiable",
      "priority",
      "comment",
      "tags",
      "createdOn",
      "modifiedOn",
      "commentModifiedOn",
      "tagsModifiedOn",
      "data",
      "meta",
      "settings",
    ],
  },
);

const paginationFields = {
  page: s.positiveInteger("The result page number."),
  perPage: s.positiveInteger("The page size."),
};

const dnsRecordMutationFields = {
  type: dnsRecordTypeSchema,
  name: s.nonEmptyString("The DNS record name."),
  content: s.string("The DNS record content."),
  data: looseObjectSchema,
  ttl: s.positiveInteger("The DNS TTL in seconds. Use 1 for automatic TTL."),
  proxied: s.boolean("Whether Cloudflare proxying should be enabled."),
  priority: s.integer("The DNS record priority."),
  comment: s.string("The DNS record comment."),
  tags: s.stringArray("The DNS record tags."),
  settings: looseObjectSchema,
};

const createDnsRecordInputSchema = s.object(
  "The input payload for this action.",
  {
    zoneId: zoneIdSchema,
    ...dnsRecordMutationFields,
  },
  {
    required: ["zoneId", "type", "name"],
    optional: ["content", "data", "ttl", "proxied", "priority", "comment", "tags", "settings"],
    anyOf: [{ required: ["content"] }, { required: ["data"] }],
  },
);

const updateDnsRecordInputSchema = s.object(
  "The input payload for this action.",
  {
    zoneId: zoneIdSchema,
    dnsRecordId: dnsRecordIdSchema,
    ...dnsRecordMutationFields,
  },
  {
    required: ["zoneId", "dnsRecordId"],
    optional: ["type", "name", "content", "data", "ttl", "proxied", "priority", "comment", "tags", "settings"],
    anyOf: Object.keys(dnsRecordMutationFields).map((field) => ({ required: [field] })),
  },
);

export const actions: ActionDefinition[] = [
  defineProviderAction(service, {
    authTypes: cloudflareTokenAuthTypes,
    name: "list_zones",
    operationType: "read",
    description: "List the Cloudflare zones visible to the current API token.",
    requiredScopes: [zoneReadScope],
    providerPermissions: [zoneReadPermission],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        ...paginationFields,
        name: s.string("Filter zones by exact zone name."),
        status: s.string("Filter zones by zone status."),
        accountId: s.string("Filter zones by Cloudflare account ID."),
        match: s.stringEnum("Whether all or any query filters must match.", ["all", "any"]),
        order: s.string("The field to order by."),
        direction: s.stringEnum("The sort direction.", ["asc", "desc"]),
      },
      { optional: ["page", "perPage", "name", "status", "accountId", "match", "order", "direction"] },
    ),
    outputSchema: s.object(
      "The output payload for this action.",
      {
        zones: s.array("The list of matching zones.", zoneSchema),
        resultInfo: resultInfoSchema,
      },
      { optional: ["resultInfo"] },
    ),
  }),
  defineProviderAction(service, {
    authTypes: cloudflareTokenAuthTypes,
    name: "get_zone",
    operationType: "read",
    description: "Get one Cloudflare zone by zone ID.",
    requiredScopes: [zoneReadScope],
    providerPermissions: [zoneReadPermission],
    inputSchema: s.object("The input payload for this action.", { zoneId: zoneIdSchema }, { required: ["zoneId"] }),
    outputSchema: s.object("The output payload for this action.", { zone: zoneSchema }),
  }),
  defineProviderAction(service, {
    authTypes: cloudflareTokenAuthTypes,
    name: "list_dns_records",
    operationType: "read",
    description: "List DNS records inside one Cloudflare zone.",
    requiredScopes: [zoneReadScope, dnsReadScope],
    providerPermissions: [dnsReadPermission],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        zoneId: zoneIdSchema,
        ...paginationFields,
        type: dnsRecordTypeSchema,
        name: s.string("Filter by record name."),
        content: s.string("Filter by record content."),
        proxied: s.boolean("Filter by proxy status."),
        match: s.stringEnum("Whether all or any query filters must match.", ["all", "any"]),
        order: s.string("The field to order by."),
        direction: s.stringEnum("The sort direction.", ["asc", "desc"]),
      },
      {
        required: ["zoneId"],
        optional: ["page", "perPage", "type", "name", "content", "proxied", "match", "order", "direction"],
      },
    ),
    outputSchema: s.object(
      "The output payload for this action.",
      {
        records: s.array("The list of DNS records.", dnsRecordSchema),
        resultInfo: resultInfoSchema,
      },
      { optional: ["resultInfo"] },
    ),
  }),
  defineProviderAction(service, {
    authTypes: cloudflareTokenAuthTypes,
    name: "get_dns_record",
    operationType: "read",
    description: "Get one DNS record from a Cloudflare zone.",
    requiredScopes: [zoneReadScope, dnsReadScope],
    providerPermissions: [dnsReadPermission],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        zoneId: zoneIdSchema,
        dnsRecordId: dnsRecordIdSchema,
      },
      { required: ["zoneId", "dnsRecordId"] },
    ),
    outputSchema: s.object("The output payload for this action.", { record: dnsRecordSchema }),
  }),
  defineProviderAction(service, {
    authTypes: cloudflareTokenAuthTypes,
    name: "create_dns_record",
    operationType: "write",
    description: "Create a DNS record inside a Cloudflare zone.",
    requiredScopes: [zoneReadScope, dnsReadScope, dnsWriteScope],
    providerPermissions: [dnsWritePermission],
    inputSchema: createDnsRecordInputSchema,
    outputSchema: s.object("The output payload for this action.", { record: dnsRecordSchema }),
  }),
  defineProviderAction(service, {
    authTypes: cloudflareTokenAuthTypes,
    name: "update_dns_record",
    operationType: "write",
    description: "Patch one DNS record inside a Cloudflare zone.",
    requiredScopes: [zoneReadScope, dnsReadScope, dnsWriteScope],
    providerPermissions: [dnsWritePermission],
    inputSchema: updateDnsRecordInputSchema,
    outputSchema: s.object("The output payload for this action.", { record: dnsRecordSchema }),
  }),
  defineProviderAction(service, {
    authTypes: cloudflareTokenAuthTypes,
    name: "delete_dns_record",
    operationType: "destructive",
    description: "Delete one DNS record from a Cloudflare zone.",
    requiredScopes: [zoneReadScope, dnsReadScope, dnsWriteScope],
    providerPermissions: [dnsWritePermission],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        zoneId: zoneIdSchema,
        dnsRecordId: dnsRecordIdSchema,
      },
      { required: ["zoneId", "dnsRecordId"] },
    ),
    outputSchema: s.object("The output payload for this action.", {
      id: s.string("The deleted DNS record ID."),
      deleted: s.boolean("Whether the delete request succeeded."),
    }),
  }),
  defineProviderAction(service, {
    authTypes: cloudflareTokenAuthTypes,
    name: "create_zone",
    description:
      "Create a Cloudflare zone and return its assigned nameservers. Full setups require a separate registrar nameserver update; partial setups use Cloudflare zone verification.",
    operationType: "write",
    requiredScopes: ["zone.write"],
    providerPermissions: ["Zone Write"],
    inputSchema: s.object(
      "The action parameters.",
      {
        accountId,
        name: s.nonEmptyString("The domain name."),
        type: s.stringEnum(["full", "partial", "secondary", "internal"], { description: "The zone setup type." }),
        jumpStart: s.boolean("Whether Cloudflare should attempt to scan existing DNS records."),
      },
      { optional: ["accountId", "type", "jumpStart"] },
    ),
    outputSchema: s.requiredObject("The action result.", resultOutput),
  }),
  defineProviderAction(service, {
    authTypes: cloudflareTokenAuthTypes,
    name: "get_zone_setting",
    description: "Read one Cloudflare zone setting, such as SSL mode or cache configuration.",
    operationType: "read",
    requiredScopes: ["zone-settings.read"],
    providerPermissions: ["Zone Settings Read"],
    inputSchema: s.object(
      "The action parameters.",
      { zoneId, settingId: s.nonEmptyString("The official zone setting identifier, such as ssl.") },
      { optional: [] },
    ),
    outputSchema: s.requiredObject("The action result.", resultOutput),
  }),
  defineProviderAction(service, {
    authTypes: cloudflareTokenAuthTypes,
    name: "get_zone_dns_settings",
    description: "Read the DNS settings of a Cloudflare zone.",
    operationType: "read",
    requiredScopes: ["zone-dns-settings.read"],
    providerPermissions: ["Zone DNS Settings Read"],
    inputSchema: s.object(
      "The action parameters.",
      {
        zoneId,
      },
      { optional: [] },
    ),
    outputSchema: s.requiredObject("The action result.", resultOutput),
  }),
];
