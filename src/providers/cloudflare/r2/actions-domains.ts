import type { ActionDefinition } from "../../../core/types.ts";

import { s } from "../../../core/json-schema.ts";
import { defineProviderAction } from "../../../core/provider-definition.ts";
import { bucketNameSchema, jurisdictionSchema, readPermissions, writePermissions } from "./schemas.ts";

const service = "cloudflare";

const minTlsSchema = s.stringEnum("The minimum TLS version accepted for incoming connections.", [
  "1.0",
  "1.1",
  "1.2",
  "1.3",
]);

const ciphersSchema = s.array("An allowlist of TLS ciphers in BoringSSL format.", s.string("A cipher name."));
const domainNameSchema = s.nonEmptyString("The custom domain name.");

const customDomainSchema = s.object(
  "A custom domain attached to an R2 bucket.",
  {
    domain: s.string("The custom domain name."),
    enabled: s.boolean("Whether the bucket is publicly accessible at this custom domain."),
    zoneId: s.optional(s.string("The Cloudflare zone ID the domain resides in.")),
    zoneName: s.optional(s.string("The Cloudflare zone name the domain resides in.")),
    minTLS: s.optional(minTlsSchema),
    ciphers: s.optional(ciphersSchema),
    status: s.optional(
      s.requiredObject("The provisioning status of the custom domain.", {
        ownership: s.string("The domain ownership status."),
        ssl: s.string("The SSL certificate status."),
      }),
    ),
  },
  { optional: ["zoneId", "zoneName", "minTLS", "ciphers", "status"] },
);

const updatedCustomDomainSchema = s.object(
  "A custom domain after an update. Fields the upstream response omits are left out.",
  {
    domain: s.string("The custom domain name."),
    enabled: s.optional(
      s.boolean(
        "Whether the bucket is publicly accessible at this custom domain. Omitted when the upstream response does not report it.",
      ),
    ),
    minTLS: s.optional(minTlsSchema),
    ciphers: s.optional(ciphersSchema),
  },
  { optional: ["enabled", "minTLS", "ciphers"] },
);

const managedDomainSchema = s.requiredObject("The r2.dev managed domain of a bucket.", {
  bucketId: s.string("The bucket ID."),
  domain: s.string("The r2.dev domain name of the bucket."),
  enabled: s.boolean("Whether the bucket is publicly accessible at the r2.dev domain."),
});

export const actions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_custom_domains",
    operationType: "read",
    description: "List the custom domains attached to an R2 bucket.",
    requiredScopes: ["workers-r2.read"],
    providerPermissions: [...readPermissions],
    inputSchema: s.object(
      "Input for listing custom domains.",
      {
        accountId: s.optional(s.string("The Cloudflare account ID. Defaults to the connection account.")),
        bucketName: bucketNameSchema,
        jurisdiction: s.optional(jurisdictionSchema),
      },
      { optional: ["jurisdiction"] },
    ),
    outputSchema: s.requiredObject("The custom domains attached to the bucket.", {
      domains: s.array("The attached custom domains.", customDomainSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_custom_domain",
    operationType: "read",
    description: "Get the settings of one custom domain attached to an R2 bucket.",
    requiredScopes: ["workers-r2.read"],
    providerPermissions: [...readPermissions],
    inputSchema: s.object(
      "Input for reading one custom domain.",
      {
        accountId: s.optional(s.string("The Cloudflare account ID. Defaults to the connection account.")),
        bucketName: bucketNameSchema,
        domain: domainNameSchema,
        jurisdiction: s.optional(jurisdictionSchema),
      },
      { optional: ["jurisdiction"] },
    ),
    outputSchema: s.requiredObject("The custom domain settings.", {
      domain: customDomainSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "add_custom_domain",
    operationType: "write",
    description: "Attach a custom domain from a Cloudflare zone to an R2 bucket.",
    requiredScopes: ["workers-r2.write"],
    providerPermissions: [...writePermissions],
    inputSchema: s.object(
      "Input for attaching a custom domain.",
      {
        accountId: s.optional(s.string("The Cloudflare account ID. Defaults to the connection account.")),
        bucketName: bucketNameSchema,
        domain: domainNameSchema,
        zoneId: s.nonEmptyString("The Cloudflare zone ID that owns the domain."),
        enabled: s.optional(
          s.boolean("Whether to enable public bucket access at the custom domain. Defaults to true."),
        ),
        minTLS: s.optional(minTlsSchema),
        ciphers: s.optional(ciphersSchema),
        jurisdiction: s.optional(jurisdictionSchema),
      },
      { optional: ["enabled", "minTLS", "ciphers", "jurisdiction"] },
    ),
    outputSchema: s.requiredObject("The attached custom domain.", {
      domain: customDomainSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_custom_domain",
    operationType: "write",
    description: "Update the public access, TLS version, or cipher settings of a custom domain.",
    requiredScopes: ["workers-r2.write"],
    providerPermissions: [...writePermissions],
    inputSchema: s.object(
      "Input for updating one custom domain.",
      {
        accountId: s.optional(s.string("The Cloudflare account ID. Defaults to the connection account.")),
        bucketName: bucketNameSchema,
        domain: domainNameSchema,
        enabled: s.optional(s.boolean("Whether to enable public bucket access at the custom domain.")),
        minTLS: s.optional(minTlsSchema),
        ciphers: s.optional(ciphersSchema),
        jurisdiction: s.optional(jurisdictionSchema),
      },
      { optional: ["enabled", "minTLS", "ciphers", "jurisdiction"] },
    ),
    outputSchema: s.requiredObject("The updated custom domain.", {
      domain: updatedCustomDomainSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_custom_domain",
    operationType: "destructive",
    description: "Detach a custom domain from an R2 bucket.",
    requiredScopes: ["workers-r2.write"],
    providerPermissions: [...writePermissions],
    inputSchema: s.object(
      "Input for detaching one custom domain.",
      {
        accountId: s.optional(s.string("The Cloudflare account ID. Defaults to the connection account.")),
        bucketName: bucketNameSchema,
        domain: domainNameSchema,
        jurisdiction: s.optional(jurisdictionSchema),
      },
      { optional: ["jurisdiction"] },
    ),
    outputSchema: s.requiredObject("The detached custom domain.", {
      domain: s.string("The detached custom domain name."),
      deleted: s.boolean("Whether the detach request succeeded."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_managed_domain",
    operationType: "read",
    description: "Get the r2.dev managed domain and its public access state for an R2 bucket.",
    requiredScopes: ["workers-r2.read"],
    providerPermissions: [...readPermissions],
    inputSchema: s.object(
      "Input for reading the managed domain.",
      {
        accountId: s.optional(s.string("The Cloudflare account ID. Defaults to the connection account.")),
        bucketName: bucketNameSchema,
        jurisdiction: s.optional(jurisdictionSchema),
      },
      { optional: ["jurisdiction"] },
    ),
    outputSchema: managedDomainSchema,
  }),
  defineProviderAction(service, {
    name: "update_managed_domain",
    operationType: "destructive",
    description: "Enable or disable public access to an R2 bucket through its r2.dev domain.",
    requiredScopes: ["workers-r2.write"],
    providerPermissions: [...writePermissions],
    inputSchema: s.object(
      "Input for updating the managed domain.",
      {
        accountId: s.optional(s.string("The Cloudflare account ID. Defaults to the connection account.")),
        bucketName: bucketNameSchema,
        enabled: s.boolean("Whether to enable public bucket access at the r2.dev domain."),
        jurisdiction: s.optional(jurisdictionSchema),
      },
      { optional: ["jurisdiction"] },
    ),
    outputSchema: managedDomainSchema,
  }),
];
