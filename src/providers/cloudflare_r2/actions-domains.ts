import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import {
  cloudflareR2BucketNameSchema,
  cloudflareR2JurisdictionSchema,
  cloudflareR2ReadPermissions,
  cloudflareR2WritePermissions,
} from "./schemas.ts";

const cloudflareR2MinTlsSchema = s.stringEnum("The minimum TLS version accepted for incoming connections.", [
  "1.0",
  "1.1",
  "1.2",
  "1.3",
]);

const cloudflareR2CiphersSchema = s.array(
  "An allowlist of TLS ciphers in BoringSSL format.",
  s.string("A cipher name."),
);

const cloudflareR2DomainNameSchema = s.nonEmptyString("The custom domain name.");

const cloudflareR2CustomDomainSchema = s.object(
  "A custom domain attached to an R2 bucket.",
  {
    domain: s.string("The custom domain name."),
    enabled: s.boolean("Whether the bucket is publicly accessible at this custom domain."),
    zoneId: s.optional(s.string("The Cloudflare zone ID the domain resides in.")),
    zoneName: s.optional(s.string("The Cloudflare zone name the domain resides in.")),
    minTLS: s.optional(cloudflareR2MinTlsSchema),
    ciphers: s.optional(cloudflareR2CiphersSchema),
    status: s.optional(
      s.requiredObject("The provisioning status of the custom domain.", {
        ownership: s.string("The domain ownership status."),
        ssl: s.string("The SSL certificate status."),
      }),
    ),
  },
  { optional: ["zoneId", "zoneName", "minTLS", "ciphers", "status"] },
);
const cloudflareR2UpdatedCustomDomainSchema = s.object(
  "A custom domain after an update. Fields the upstream response omits are left out.",
  {
    domain: s.string("The custom domain name."),
    enabled: s.optional(
      s.boolean(
        "Whether the bucket is publicly accessible at this custom domain. Omitted when the upstream response does not report it.",
      ),
    ),
    minTLS: s.optional(cloudflareR2MinTlsSchema),
    ciphers: s.optional(cloudflareR2CiphersSchema),
  },
  { optional: ["enabled", "minTLS", "ciphers"] },
);

const cloudflareR2ManagedDomainSchema = s.requiredObject("The r2.dev managed domain of a bucket.", {
  bucketId: s.string("The bucket ID."),
  domain: s.string("The r2.dev domain name of the bucket."),
  enabled: s.boolean("Whether the bucket is publicly accessible at the r2.dev domain."),
});

export const cloudflareR2DomainActions: ActionDefinition[] = [
  defineProviderAction("cloudflare_r2", {
    name: "list_custom_domains",
    operationType: "read",
    description: "List the custom domains attached to an R2 bucket.",
    requiredScopes: ["workers-r2.read"],
    providerPermissions: [...cloudflareR2ReadPermissions],
    inputSchema: s.object(
      "Input for listing custom domains.",
      {
        bucketName: cloudflareR2BucketNameSchema,
        jurisdiction: s.optional(cloudflareR2JurisdictionSchema),
      },
      { optional: ["jurisdiction"] },
    ),
    outputSchema: s.requiredObject("The custom domains attached to the bucket.", {
      domains: s.array("The attached custom domains.", cloudflareR2CustomDomainSchema),
    }),
  }),
  defineProviderAction("cloudflare_r2", {
    name: "get_custom_domain",
    operationType: "read",
    description: "Get the settings of one custom domain attached to an R2 bucket.",
    requiredScopes: ["workers-r2.read"],
    providerPermissions: [...cloudflareR2ReadPermissions],
    inputSchema: s.object(
      "Input for reading one custom domain.",
      {
        bucketName: cloudflareR2BucketNameSchema,
        domain: cloudflareR2DomainNameSchema,
        jurisdiction: s.optional(cloudflareR2JurisdictionSchema),
      },
      { optional: ["jurisdiction"] },
    ),
    outputSchema: s.requiredObject("The custom domain settings.", {
      domain: cloudflareR2CustomDomainSchema,
    }),
  }),
  defineProviderAction("cloudflare_r2", {
    name: "add_custom_domain",
    operationType: "write",
    description: "Attach a custom domain from a Cloudflare zone to an R2 bucket.",
    requiredScopes: ["workers-r2.write"],
    providerPermissions: [...cloudflareR2WritePermissions],
    inputSchema: s.object(
      "Input for attaching a custom domain.",
      {
        bucketName: cloudflareR2BucketNameSchema,
        domain: cloudflareR2DomainNameSchema,
        zoneId: s.nonEmptyString("The Cloudflare zone ID that owns the domain."),
        enabled: s.optional(
          s.boolean("Whether to enable public bucket access at the custom domain. Defaults to true."),
        ),
        minTLS: s.optional(cloudflareR2MinTlsSchema),
        ciphers: s.optional(cloudflareR2CiphersSchema),
        jurisdiction: s.optional(cloudflareR2JurisdictionSchema),
      },
      { optional: ["enabled", "minTLS", "ciphers", "jurisdiction"] },
    ),
    outputSchema: s.requiredObject("The attached custom domain.", {
      domain: cloudflareR2CustomDomainSchema,
    }),
  }),
  defineProviderAction("cloudflare_r2", {
    name: "update_custom_domain",
    operationType: "write",
    description: "Update the public access, TLS version, or cipher settings of a custom domain.",
    requiredScopes: ["workers-r2.write"],
    providerPermissions: [...cloudflareR2WritePermissions],
    inputSchema: s.object(
      "Input for updating one custom domain.",
      {
        bucketName: cloudflareR2BucketNameSchema,
        domain: cloudflareR2DomainNameSchema,
        enabled: s.optional(s.boolean("Whether to enable public bucket access at the custom domain.")),
        minTLS: s.optional(cloudflareR2MinTlsSchema),
        ciphers: s.optional(cloudflareR2CiphersSchema),
        jurisdiction: s.optional(cloudflareR2JurisdictionSchema),
      },
      { optional: ["enabled", "minTLS", "ciphers", "jurisdiction"] },
    ),
    outputSchema: s.requiredObject("The updated custom domain.", {
      domain: cloudflareR2UpdatedCustomDomainSchema,
    }),
  }),
  defineProviderAction("cloudflare_r2", {
    name: "delete_custom_domain",
    operationType: "destructive",
    description: "Detach a custom domain from an R2 bucket.",
    requiredScopes: ["workers-r2.write"],
    providerPermissions: [...cloudflareR2WritePermissions],
    inputSchema: s.object(
      "Input for detaching one custom domain.",
      {
        bucketName: cloudflareR2BucketNameSchema,
        domain: cloudflareR2DomainNameSchema,
        jurisdiction: s.optional(cloudflareR2JurisdictionSchema),
      },
      { optional: ["jurisdiction"] },
    ),
    outputSchema: s.requiredObject("The detached custom domain.", {
      domain: s.string("The detached custom domain name."),
      deleted: s.boolean("Whether the detach request succeeded."),
    }),
  }),
  defineProviderAction("cloudflare_r2", {
    name: "get_managed_domain",
    operationType: "read",
    description: "Get the r2.dev managed domain and its public access state for an R2 bucket.",
    requiredScopes: ["workers-r2.read"],
    providerPermissions: [...cloudflareR2ReadPermissions],
    inputSchema: s.object(
      "Input for reading the managed domain.",
      {
        bucketName: cloudflareR2BucketNameSchema,
        jurisdiction: s.optional(cloudflareR2JurisdictionSchema),
      },
      { optional: ["jurisdiction"] },
    ),
    outputSchema: cloudflareR2ManagedDomainSchema,
  }),
  defineProviderAction("cloudflare_r2", {
    name: "update_managed_domain",
    operationType: "destructive",
    description: "Enable or disable public access to an R2 bucket through its r2.dev domain.",
    requiredScopes: ["workers-r2.write"],
    providerPermissions: [...cloudflareR2WritePermissions],
    inputSchema: s.object(
      "Input for updating the managed domain.",
      {
        bucketName: cloudflareR2BucketNameSchema,
        enabled: s.boolean("Whether to enable public bucket access at the r2.dev domain."),
        jurisdiction: s.optional(cloudflareR2JurisdictionSchema),
      },
      { optional: ["jurisdiction"] },
    ),
    outputSchema: cloudflareR2ManagedDomainSchema,
  }),
];
