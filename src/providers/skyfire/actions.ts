import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "skyfire";

const sellerSchema = s.object("The seller account that owns the service.", {
  id: s.nonEmptyString("The seller agent identifier."),
  name: s.nonEmptyString("The seller display name."),
});

const serviceSummarySchema = s.object("A Skyfire marketplace service summary.", {
  id: s.nonEmptyString("The Skyfire service identifier."),
  name: s.nonEmptyString("The human-readable service name."),
  description: s.nullableString("The service description published in the Skyfire marketplace."),
  tags: s.stringArray("The marketplace tags attached to the service."),
  type: s.nonEmptyString("The Skyfire service type."),
  price: s.nullableString("The service price as returned by Skyfire."),
  priceModel: s.nullableString("The service pricing model returned by Skyfire."),
  minimumTokenAmount: s.nullableString("The minimum token amount accepted by this service, when provided."),
  maxTokenTTLSeconds: s.nullableInteger("The maximum token lifetime in seconds allowed by this service."),
  humanIdentityRequirement: s.looseObject("The human identity requirements declared by the service.", {
    identityLevels: s.stringArray("The identity levels accepted by the service."),
    organization: s.stringArray("The organization identity fields accepted by the service."),
    individual: s.stringArray("The individual identity fields accepted by the service."),
  }),
  seller: sellerSchema,
  openApiSpecUrl: s.nullableString("The OpenAPI specification URL published for the service."),
  acceptedTokens: s.stringArray("The Skyfire token types accepted by the service."),
  createdAt: s.nonEmptyString("The ISO timestamp when the service was created."),
  updatedAt: s.nonEmptyString("The ISO timestamp when the service was last updated."),
});

const tokenTypeSchema = s.stringEnum("The Skyfire token type to create.", ["kya", "pay", "kya-pay"]);

const identityPermissionSchema = s.stringEnum("An identity field to include in a KYA or KYA-pay token.", [
  "name",
  "email",
  "phone",
  "country",
  "region",
  "city",
  "postalCode",
  "walletAddress",
  "organizationName",
  "organizationWebsite",
]);

const createTokenInputSchema = s.object(
  "Input parameters for creating a buyer token in Skyfire.",
  {
    type: tokenTypeSchema,
    buyerTag: s.nonEmptyString("The buyer's internal identifier for the transaction or token."),
    tokenAmount: s.nonEmptyString("The token amount to fund on a pay or kya-pay token."),
    sellerServiceId: s.nonEmptyString("The seller service ID to authorize against."),
    sellerDomainOrUrl: s.nonEmptyString("The seller domain or full URL when creating a domain-scoped token."),
    expiresAt: s.integer("The Unix timestamp in seconds when the token should expire."),
    identityPermissions: s.array(
      "The additional identity fields to include when creating a KYA or KYA-pay token.",
      identityPermissionSchema,
      { minItems: 1 },
    ),
  },
  { optional: ["buyerTag", "tokenAmount", "sellerServiceId", "sellerDomainOrUrl", "expiresAt", "identityPermissions"] },
);

const createTokenOutputSchema = s.object(
  "The normalized token creation result.",
  {
    token: s.nonEmptyString("The signed Skyfire JWT token."),
    raw: s.unknown("The raw Skyfire token creation response."),
  },
  { optional: ["raw"] },
);

export const skyfireActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_all_services",
    description: "List all approved and active services from the Skyfire marketplace directory.",
    inputSchema: s.object("No input is required for listing all Skyfire services.", {}),
    outputSchema: s.object("A list of approved Skyfire marketplace services.", {
      services: s.array("The services returned by the Skyfire directory.", serviceSummarySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_service",
    description: "Get one Skyfire marketplace service by its service ID.",
    inputSchema: s.object("Input parameters for reading one Skyfire service.", {
      serviceId: s.nonEmptyString("The Skyfire service ID to fetch."),
    }),
    outputSchema: s.object("The Skyfire service returned by the directory.", {
      service: serviceSummarySchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_services_by_agent",
    description: "List all approved and active Skyfire marketplace services owned by one seller agent.",
    inputSchema: s.object("Input parameters for listing a seller agent's Skyfire services.", {
      agentId: s.nonEmptyString("The seller agent ID whose services should be listed."),
    }),
    outputSchema: s.object("The Skyfire services owned by one seller agent.", {
      services: s.array("The services returned for the seller agent.", serviceSummarySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "create_token",
    description:
      "Create a buyer token in Skyfire for one seller service or seller domain, including funded pay and identity-carrying KYA variants.",
    inputSchema: createTokenInputSchema,
    outputSchema: createTokenOutputSchema,
  }),
];
