import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "productlane" as const;

const identitySchema = s.looseRequiredObject("The authenticated Productlane API key identity.", {
  workspace_id: s.nonEmptyString("The Productlane workspace ID associated with the API key."),
  api_key_id: s.nonEmptyString("The unique ID of the Productlane API key."),
  scopes: s.stringArray("The scopes granted to the Productlane API key.", {
    itemDescription: "A granted Productlane API scope.",
  }),
  linear_team_ids: s.stringArray("The Linear team IDs selected for this workspace.", {
    itemDescription: "A selected Linear team ID.",
  }),
  default_linear_team_id: s.nullable(
    s.nonEmptyString("The default Linear team ID, or null when no default is configured."),
  ),
});

const companyOwnerSchema = s.looseRequiredObject("The Linear owner assigned to a company.", {
  id: s.nonEmptyString("The Linear user ID of the company owner."),
  name: s.nullable(s.string("The display name of the company owner.")),
  avatar_url: s.nullable(s.string("The avatar URL of the company owner.")),
});

const companySchema = s.looseRequiredObject("A Productlane company.", {
  id: s.nonEmptyString("The unique Productlane company ID."),
  name: s.string("The company name."),
  logo_url: s.nullable(s.string("The company logo URL.")),
  domains: s.stringArray("The domains associated with the company.", {
    itemDescription: "A company domain.",
  }),
  size: s.nullable(s.number("The company size.")),
  revenue: s.nullable(s.number("The company revenue.")),
  status_id: s.nullable(s.string("The linked Linear customer status ID.")),
  status_name: s.nullable(s.string("The linked Linear customer status name.")),
  tier_id: s.nullable(s.string("The linked Linear customer tier ID.")),
  tier_name: s.nullable(s.string("The linked Linear customer tier name.")),
  owner: s.nullable(companyOwnerSchema),
  external_ids: s.array("Caller-owned external IDs associated with the company.", s.string("An external company ID.")),
  created_at: s.string("The timestamp when the company was created."),
  updated_at: s.string("The timestamp when the company was last updated."),
});

const contactExternalIdsSchema = s.looseObject("External service IDs associated with the Productlane contact.", {
  intercom: s.string("The contact's Intercom ID."),
  front: s.string("The contact's Front ID."),
  zendesk: s.string("The contact's Zendesk ID."),
  hubspot: s.string("The contact's HubSpot ID."),
  plain: s.string("The contact's Plain ID."),
  productboard: s.string("The contact's Productboard ID."),
  slack_channel: s.string("The Slack channel ID associated with the contact."),
});

const contactSchema = s.looseRequiredObject("A Productlane contact.", {
  id: s.nonEmptyString("The unique Productlane contact ID."),
  email: s.string("The contact email address."),
  name: s.nullable(s.string("The contact name.")),
  image_url: s.nullable(s.string("The contact avatar URL.")),
  company_id: s.nullable(s.string("The Productlane company ID associated with the contact.")),
  is_subscribed: s.boolean("Whether the contact receives changelog and project or issue update emails."),
  external_ids: contactExternalIdsSchema,
  created_at: s.string("The timestamp when the contact was created."),
  updated_at: s.string("The timestamp when the contact was last updated."),
});

const pageSchema = s.looseRequiredObject("Productlane cursor pagination metadata.", {
  cursor: s.nullable(s.string("The opaque cursor for the next page, or null on the final page.")),
  has_more: s.boolean("Whether another page of results is available."),
  limit: s.integer("The effective number of rows requested per page."),
});

const companyListSchema = s.looseRequiredObject("A cursor-paginated list of companies.", {
  data: s.array("The companies in this page.", companySchema),
  page: pageSchema,
});

const contactListSchema = s.looseRequiredObject("A cursor-paginated list of contacts.", {
  data: s.array("The contacts in this page.", contactSchema),
  page: pageSchema,
});

const deleteResultSchema = s.looseRequiredObject("A Productlane soft-delete result.", {
  id: s.nonEmptyString("The ID of the deleted Productlane resource."),
  deleted: s.literal(true, { description: "Whether the resource was deleted." }),
});

const resourceIdInputSchema = (resource: string) =>
  s.requiredObject(`Request parameters identifying a Productlane ${resource}.`, {
    id: s.nonEmptyString(`The Productlane ${resource} ID.`),
  });

const companyMutationProperties = {
  name: s.nonEmptyString("The company name.", { maxLength: 255 }),
  logo_url: s.nullable(s.url("The company logo URL.")),
  domains: s.array(
    "The complete set of domains associated with the company.",
    s.nonEmptyString("A company domain.", {
      maxLength: 63,
      pattern: "[0-9a-z-]+\\.(?:(?:co|or|gv|ac|com)\\.)?[a-z]{2,7}$",
    }),
  ),
  external_ids: s.array(
    "The complete set of caller-owned external IDs associated with the company.",
    s.string("An external company ID."),
  ),
  status_id: s.nullable(
    s.nonEmptyString(
      "The Linear customer status ID, or null to clear it. Use the official linear-options endpoint through proxy to discover valid IDs.",
    ),
  ),
  tier_id: s.nullable(
    s.nonEmptyString(
      "The Linear customer tier ID, or null to clear it. Use the official linear-options endpoint through proxy to discover valid IDs.",
    ),
  ),
  owner_id: s.nullable(
    s.nonEmptyString(
      "The Linear user ID of the company owner, or null to clear it. Use the official linear-options endpoint through proxy to discover valid IDs.",
    ),
  ),
} as const;

const createCompanyInputSchema = s.object(
  "Request parameters for creating a Productlane company.",
  {
    ...companyMutationProperties,
    size: s.nonNegativeInteger("The company size."),
    revenue: s.nonNegativeInteger("The company revenue."),
  },
  {
    optional: ["logo_url", "domains", "size", "revenue", "external_ids", "status_id", "tier_id", "owner_id"],
  },
);

const updateCompanyInputSchema = s.object(
  "Request parameters for updating a Productlane company.",
  {
    id: s.nonEmptyString("The Productlane company ID."),
    ...companyMutationProperties,
    size: s.nullable(s.nonNegativeInteger("The company size, or null to clear it.")),
    revenue: s.nullable(s.nonNegativeInteger("The company revenue, or null to clear it.")),
  },
  {
    optional: ["name", "logo_url", "domains", "size", "revenue", "external_ids", "status_id", "tier_id", "owner_id"],
  },
);

const listCompaniesInputSchema = s.object(
  "Filters and pagination parameters for listing Productlane companies.",
  {
    limit: s.integer("The number of companies to return, from 1 through 200.", {
      minimum: 1,
      maximum: 200,
    }),
    cursor: s.nonEmptyString("The opaque cursor returned by the previous page."),
    external_id: s.string("An external ID that must appear in the company's external_ids array."),
    domain: s.nonEmptyString("A domain that must appear in the company's domains array."),
    name_contains: s.nonEmptyString("A case-insensitive company name substring.", {
      maxLength: 255,
    }),
    status_id: s.nonEmptyString("The Linear customer status ID to match."),
    tier_id: s.nonEmptyString("The Linear customer tier ID to match."),
    size_gte: s.nonNegativeInteger("The minimum company size."),
    size_lte: s.nonNegativeInteger("The maximum company size."),
    revenue_gte: s.nonNegativeInteger("The minimum company revenue."),
    revenue_lte: s.nonNegativeInteger("The maximum company revenue."),
    created_after: s.dateTime("Return companies created after this timestamp."),
    created_before: s.dateTime("Return companies created before this timestamp."),
    updated_after: s.dateTime("Return companies updated after this timestamp."),
    updated_before: s.dateTime("Return companies updated before this timestamp."),
  },
  {
    optional: [
      "limit",
      "cursor",
      "external_id",
      "domain",
      "name_contains",
      "status_id",
      "tier_id",
      "size_gte",
      "size_lte",
      "revenue_gte",
      "revenue_lte",
      "created_after",
      "created_before",
      "updated_after",
      "updated_before",
    ],
  },
);

const contactCompanySelectorProperties = {
  company_id: s.nonEmptyString(
    "The Productlane company ID to associate. Mutually exclusive with company_name and company_external_id.",
    { maxLength: 255 },
  ),
  company_name: s.nonEmptyString(
    "An exact company name to resolve. Mutually exclusive with company_id and company_external_id.",
    { maxLength: 255 },
  ),
  company_external_id: s.nonEmptyString(
    "An external company ID to resolve. Mutually exclusive with company_id and company_name.",
    { maxLength: 255 },
  ),
} as const;

function requireAtMostOneCompanySelector<TSchema extends Record<string, unknown>>(schema: TSchema) {
  return schema;
}

const createContactInputSchema = requireAtMostOneCompanySelector(
  s.object(
    "Request parameters for creating a Productlane contact.",
    {
      email: s.email("The contact email address.", { maxLength: 254 }),
      name: s.nonEmptyString("The contact name.", { maxLength: 255 }),
      image_url: s.nullable(s.url("The contact avatar URL. Omit it to let Productlane resolve Gravatar.")),
      is_subscribed: s.boolean(
        "Whether the contact receives changelog and project or issue update emails. Productlane defaults this to true.",
      ),
      ...contactCompanySelectorProperties,
    },
    {
      optional: ["name", "image_url", "is_subscribed", "company_id", "company_name", "company_external_id"],
    },
  ),
);

const updateContactInputSchema = requireAtMostOneCompanySelector(
  s.object(
    "Request parameters for updating a Productlane contact.",
    {
      id: s.nonEmptyString("The Productlane contact ID."),
      email: s.email("The replacement contact email address.", { maxLength: 254 }),
      name: s.nonEmptyString("The replacement contact name.", { maxLength: 255 }),
      image_url: s.nullable(s.url("The replacement avatar URL, or null to clear it.")),
      is_subscribed: s.boolean("Whether the contact receives changelog and project or issue update emails."),
      ...contactCompanySelectorProperties,
    },
    {
      optional: ["email", "name", "image_url", "is_subscribed", "company_id", "company_name", "company_external_id"],
    },
  ),
);

const listContactsInputSchema = s.object(
  "Filters and pagination parameters for listing Productlane contacts.",
  {
    limit: s.integer("The number of contacts to return, from 1 through 200.", {
      minimum: 1,
      maximum: 200,
    }),
    cursor: s.nonEmptyString("The opaque cursor returned by the previous page."),
    email: s.nonEmptyString("A case-insensitive email substring to match."),
    name_contains: s.nonEmptyString("A case-insensitive contact name substring.", {
      maxLength: 255,
    }),
    company_id: s.nonEmptyString("The Productlane company ID to match."),
    created_after: s.dateTime("Return contacts created after this timestamp."),
    created_before: s.dateTime("Return contacts created before this timestamp."),
    updated_after: s.dateTime("Return contacts updated after this timestamp."),
    updated_before: s.dateTime("Return contacts updated before this timestamp."),
  },
  {
    optional: [
      "limit",
      "cursor",
      "email",
      "name_contains",
      "company_id",
      "created_after",
      "created_before",
      "updated_after",
      "updated_before",
    ],
  },
);

export const productlaneActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_authenticated_identity",
    operationType: "read",
    description: "Get the authenticated Productlane API key identity, granted scopes, and Linear team selection.",
    inputSchema: s.requiredObject("This Productlane action does not require any input.", {}),
    outputSchema: identitySchema,
  }),
  defineProviderAction(service, {
    name: "list_companies",
    operationType: "read",
    description: "List Productlane companies with cursor pagination and documented filters.",
    inputSchema: listCompaniesInputSchema,
    outputSchema: companyListSchema,
  }),
  defineProviderAction(service, {
    name: "create_company",
    operationType: "write",
    description: "Create a company in the connected Productlane workspace.",
    inputSchema: createCompanyInputSchema,
    outputSchema: companySchema,
  }),
  defineProviderAction(service, {
    name: "get_company",
    operationType: "read",
    description: "Get a Productlane company by ID.",
    inputSchema: resourceIdInputSchema("company"),
    outputSchema: companySchema,
  }),
  defineProviderAction(service, {
    name: "update_company",
    operationType: "write",
    description: "Update a Productlane company by ID.",
    inputSchema: updateCompanyInputSchema,
    outputSchema: companySchema,
  }),
  defineProviderAction(service, {
    name: "delete_company",
    operationType: "destructive",
    description: "Soft-delete a Productlane company by ID.",
    inputSchema: resourceIdInputSchema("company"),
    outputSchema: deleteResultSchema,
  }),
  defineProviderAction(service, {
    name: "list_contacts",
    operationType: "read",
    description: "List Productlane contacts with cursor pagination and documented filters.",
    inputSchema: listContactsInputSchema,
    outputSchema: contactListSchema,
  }),
  defineProviderAction(service, {
    name: "create_contact",
    operationType: "write",
    description: "Create a contact in the connected Productlane workspace.",
    inputSchema: createContactInputSchema,
    outputSchema: contactSchema,
  }),
  defineProviderAction(service, {
    name: "get_contact",
    operationType: "read",
    description: "Get a Productlane contact by ID.",
    inputSchema: resourceIdInputSchema("contact"),
    outputSchema: contactSchema,
  }),
  defineProviderAction(service, {
    name: "update_contact",
    operationType: "write",
    description: "Update a Productlane contact by ID.",
    inputSchema: updateContactInputSchema,
    outputSchema: contactSchema,
  }),
  defineProviderAction(service, {
    name: "delete_contact",
    operationType: "destructive",
    description: "Soft-delete a Productlane contact by ID.",
    inputSchema: resourceIdInputSchema("contact"),
    outputSchema: deleteResultSchema,
  }),
];

export type ProductlaneActionName =
  | "get_authenticated_identity"
  | "list_companies"
  | "create_company"
  | "get_company"
  | "update_company"
  | "delete_company"
  | "list_contacts"
  | "create_contact"
  | "get_contact"
  | "update_contact"
  | "delete_contact";
