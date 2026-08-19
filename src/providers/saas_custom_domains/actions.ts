import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "saas_custom_domains";

const accountUuidSchema = s.nonEmptyString("SaaS Custom Domains account UUID.");
const upstreamUuidSchema = s.nonEmptyString("SaaS Custom Domains upstream UUID.");
const customDomainUuidSchema = s.nonEmptyString("SaaS Custom Domains custom domain UUID.");
const hostSchema = s.nonEmptyString("Host name accepted by SaaS Custom Domains.");
const pageSchema = s.integer("Page number to retrieve. Pages start at 1.", { minimum: 1 });
const perPageSchema = s.integer("Number of items to retrieve per page.", { minimum: 1 });

const paginationInputFields = {
  page: pageSchema,
  per_page: perPageSchema,
};

const paginationOutputSchema = s.looseObject("Pagination metadata returned by SaaS Custom Domains.", {
  page: s.integer("Returned page number."),
  count: s.integer("Total number of items in the collection."),
});

const accountSchema = s.looseRequiredObject("One SaaS Custom Domains account.", {
  uuid: s.nonEmptyString("Unique identifier for the account."),
  name: s.string("Name of the account."),
  personal: s.boolean("Whether the account is personal."),
  owner_uuid: s.string("Unique identifier for the account owner."),
  created_at: s.string("Timestamp when the account was created."),
  updated_at: s.string("Timestamp when the account was last updated."),
});

const upstreamSchema = s.looseRequiredObject("One SaaS Custom Domains upstream.", {
  uuid: s.nonEmptyString("Unique identifier for the upstream."),
  host: s.string("Host of the upstream web application."),
  port: s.integer("Port on which the upstream application listens."),
  tls: s.boolean("Whether the upstream expects TLS traffic."),
  auth_token: s.string("Auth token used when forwarding requests to the upstream."),
  bubble_io: s.boolean("Whether the upstream is a Bubble.io app."),
  compression_enabled: s.boolean("Whether automatic response compression is enabled."),
  geocoding_enabled: s.boolean("Whether geocoding headers are enabled."),
  created_at: s.string("Timestamp when the upstream was created."),
  updated_at: s.string("Timestamp when the upstream was last updated."),
});

const customDomainSchema = s.looseRequiredObject("One SaaS Custom Domains custom domain.", {
  uuid: s.nonEmptyString("Unique identifier for the custom domain."),
  host: s.string("Host of the custom domain."),
  prepend_path: s.nullableString("Path prefix forwarded to the upstream."),
  bubble_target_path: s.nullableString("Bubble.io target path for the custom domain."),
  meta_title: s.nullableString("Browser and search preview title for the custom domain."),
  meta_description: s.nullableString("Search result and social preview description for the custom domain."),
  meta_favicon_url: s.nullableString("Favicon URL configured for the custom domain."),
  meta_image_url: s.nullableString("Open Graph image URL configured for the custom domain."),
  created_at: s.string("Timestamp when the custom domain was created."),
  updated_at: s.string("Timestamp when the custom domain was last updated."),
  last_dns_check_at: s.nullableString("Timestamp when DNS records were last checked."),
  status: s.string("DNS record status for the custom domain."),
  tls_certificate_issued: s.boolean("Whether a TLS certificate has been issued."),
  acme_challenge_dns_record_status: s.nullableString("Status of the ACME challenge DNS record."),
  challenge_type: s.string("Certificate challenge type for the custom domain."),
  redirect_to_www: s.boolean("Whether the custom domain redirects to the www subdomain."),
  instructions_recipient: s.nullableString("Email address where DNS instructions were sent."),
  instructions_email_sent_at: s.nullableString("Timestamp when DNS instructions were sent."),
  upstream_uuid: s.string("UUID of the upstream that owns the custom domain."),
  delegated_domain_control_validation_record_hostname: s.nullableString("Hostname of the ACME challenge DNS record."),
  delegated_domain_control_validation_record_value: s.nullableString("Value of the ACME challenge DNS record."),
});

const upstreamScopedInputFields = {
  account_uuid: accountUuidSchema,
  upstream_uuid: upstreamUuidSchema,
};

const customDomainScopedInputSchema = s.object("Input parameters for a custom-domain-scoped request.", {
  ...upstreamScopedInputFields,
  domain_uuid: customDomainUuidSchema,
});

export const saasCustomDomainsActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_accounts",
    description: "List SaaS Custom Domains accounts available to the API token.",
    inputSchema: s.object("Input parameters for listing SaaS Custom Domains accounts.", {}),
    outputSchema: s.object("Output payload for SaaS Custom Domains account listing.", {
      accounts: s.array("Accounts returned by SaaS Custom Domains.", accountSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_upstreams",
    description: "List upstreams for a SaaS Custom Domains account.",
    inputSchema: s.object(
      "Input parameters for listing SaaS Custom Domains upstreams.",
      {
        account_uuid: accountUuidSchema,
        host: hostSchema,
        ...paginationInputFields,
      },
      { optional: ["host", "page", "per_page"] },
    ),
    outputSchema: s.object("Output payload for SaaS Custom Domains upstream listing.", {
      upstreams: s.array("Upstreams returned by SaaS Custom Domains.", upstreamSchema),
      pagination: paginationOutputSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_upstream",
    description: "Create an upstream for a SaaS Custom Domains account.",
    inputSchema: s.object(
      "Input parameters for creating a SaaS Custom Domains upstream.",
      {
        account_uuid: accountUuidSchema,
        host: hostSchema,
        tls: s.boolean("Whether the upstream uses TLS."),
        port: s.integer("Port on which the upstream application listens.", { minimum: 1 }),
        bubble_io: s.boolean("Whether the upstream is a Bubble.io app."),
        compression_enabled: s.boolean("Whether automatic response compression is enabled."),
        geocoding_enabled: s.boolean("Whether geocoding headers are enabled."),
        auth_token: s.nonEmptyString("Auth token to use when forwarding requests to the upstream."),
      },
      {
        optional: ["tls", "port", "bubble_io", "compression_enabled", "geocoding_enabled", "auth_token"],
      },
    ),
    outputSchema: s.object("Output payload for a created SaaS Custom Domains upstream.", {
      upstream: upstreamSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_upstream",
    description: "Retrieve one SaaS Custom Domains upstream by UUID.",
    inputSchema: s.object("Input parameters for retrieving a SaaS Custom Domains upstream.", {
      ...upstreamScopedInputFields,
    }),
    outputSchema: s.object("Output payload for one SaaS Custom Domains upstream.", {
      upstream: upstreamSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_upstream",
    description: "Delete one SaaS Custom Domains upstream and its custom domains.",
    inputSchema: s.object("Input parameters for deleting a SaaS Custom Domains upstream.", {
      ...upstreamScopedInputFields,
    }),
    outputSchema: s.object("Output payload for a deleted SaaS Custom Domains upstream.", {
      message: s.string("Deletion message returned by SaaS Custom Domains."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_custom_domains",
    description: "List custom domains for a SaaS Custom Domains upstream.",
    inputSchema: s.object(
      "Input parameters for listing SaaS Custom Domains custom domains.",
      {
        ...upstreamScopedInputFields,
        host: hostSchema,
        ...paginationInputFields,
      },
      { optional: ["host", "page", "per_page"] },
    ),
    outputSchema: s.object("Output payload for SaaS Custom Domains custom domain listing.", {
      custom_domains: s.array("Custom domains returned by SaaS Custom Domains.", customDomainSchema),
      pagination: paginationOutputSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_custom_domain",
    description: "Create a custom domain for a SaaS Custom Domains upstream.",
    inputSchema: s.object(
      "Input parameters for creating a SaaS Custom Domains custom domain.",
      {
        ...upstreamScopedInputFields,
        host: hostSchema,
        instructions_recipient: s.email("Email address where DNS instructions should be sent."),
        prepend_path: s.nonEmptyString("Path prefix forwarded to the upstream."),
        challenge_type: s.stringEnum("Certificate challenge type.", ["http01", "dns01"]),
        redirect_to_www: s.boolean("Whether to redirect traffic to the www subdomain."),
      },
      { optional: ["instructions_recipient", "prepend_path", "challenge_type", "redirect_to_www"] },
    ),
    outputSchema: s.object("Output payload for a created SaaS Custom Domains custom domain.", {
      custom_domain: customDomainSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_custom_domain",
    description: "Retrieve one SaaS Custom Domains custom domain by UUID.",
    inputSchema: customDomainScopedInputSchema,
    outputSchema: s.object("Output payload for one SaaS Custom Domains custom domain.", {
      custom_domain: customDomainSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_custom_domain",
    description: "Delete one SaaS Custom Domains custom domain.",
    inputSchema: customDomainScopedInputSchema,
    outputSchema: s.object("Output payload for a deleted SaaS Custom Domains custom domain.", {
      message: s.string("Deletion message returned by SaaS Custom Domains."),
    }),
  }),
  defineProviderAction(service, {
    name: "verify_custom_domain_dns_records",
    description: "Trigger DNS record verification for one SaaS Custom Domains custom domain.",
    inputSchema: customDomainScopedInputSchema,
    outputSchema: s.object("Output payload for SaaS Custom Domains DNS record verification.", {
      message: s.string("Verification message returned by SaaS Custom Domains."),
      dns_status: s.string("DNS verification status returned by SaaS Custom Domains."),
      host: s.string("Custom domain host that was verified."),
    }),
  }),
  defineProviderAction(service, {
    name: "purge_custom_domain_http_cache",
    description: "Initiate an HTTP cache purge for one SaaS Custom Domains custom domain.",
    inputSchema: customDomainScopedInputSchema,
    outputSchema: s.object("Output payload for a SaaS Custom Domains HTTP cache purge.", {
      message: s.string("Cache purge message returned by SaaS Custom Domains."),
    }),
  }),
];
