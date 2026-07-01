import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "adyen";
const accountReadScope = "Management API—Account read";

const idSchema = s.string("An Adyen resource identifier.", { minLength: 1, maxLength: 100 });
const pageNumberSchema = s.integer("The page number to fetch from Adyen.", { minimum: 1 });
const pageSizeSchema = s.integer("The number of items to include on one page.", {
  minimum: 1,
  maximum: 100,
});

const paginationInputSchema = s.object(
  "Pagination parameters for an Adyen list request.",
  {
    pageNumber: pageNumberSchema,
    pageSize: pageSizeSchema,
  },
  { optional: ["pageNumber", "pageSize"] },
);

const rawObjectSchema = s.looseObject({}, { description: "The raw object returned by Adyen." });

const paginationSchema = s.object(
  "Pagination metadata returned by Adyen.",
  {
    itemsTotal: s.nullable(s.integer("The total number of items when returned by Adyen.")),
    pagesTotal: s.nullable(s.integer("The total number of pages when returned by Adyen.")),
    links: s.nullable(s.looseObject({}, { description: "Pagination links returned by Adyen." })),
  },
  { required: ["itemsTotal", "pagesTotal", "links"] },
);

const companySchema = s.object(
  "A normalized Adyen company account.",
  {
    id: s.nullable(s.string("The unique identifier of the company account.")),
    name: s.nullable(s.string("The legal or trading name of the company.")),
    status: s.nullable(s.string("The status of the company account.")),
    reference: s.nullable(s.string("Your reference for the company account.")),
    description: s.nullable(s.string("Your description for the company account.")),
    raw: rawObjectSchema,
  },
  { required: ["id", "name", "status", "reference", "description", "raw"] },
);

const merchantSchema = s.object(
  "A normalized Adyen merchant account.",
  {
    id: s.nullable(s.string("The unique identifier of the merchant account.")),
    name: s.nullable(s.string("The merchant account name when returned by Adyen.")),
    status: s.nullable(s.string("The status of the merchant account.")),
    reference: s.nullable(s.string("Your reference for the merchant account.")),
    companyId: s.nullable(s.string("The company account identifier linked to the merchant.")),
    raw: rawObjectSchema,
  },
  { required: ["id", "name", "status", "reference", "companyId", "raw"] },
);

const credentialSchema = s.object(
  "A normalized Adyen API credential.",
  {
    id: s.nullable(s.string("The unique identifier of the API credential.")),
    username: s.nullable(s.string("The API credential username.")),
    active: s.nullable(s.boolean("Whether the API credential is enabled.")),
    companyName: s.nullable(s.string("The company name linked to the API credential.")),
    description: s.nullable(s.string("The API credential description.")),
    roles: s.array("Roles assigned to the API credential.", s.string("An Adyen role name.")),
    raw: rawObjectSchema,
  },
  { required: ["id", "username", "active", "companyName", "description", "roles", "raw"] },
);

export const adyenActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_api_credential",
    description: "Retrieve details for the Adyen API credential used by this connection.",
    inputSchema: s.object({}, { description: "Input parameters for retrieving the current Adyen API credential." }),
    outputSchema: s.object(
      "The normalized Adyen API credential response.",
      {
        credential: credentialSchema,
      },
      { required: ["credential"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_companies",
    description: "List Adyen company accounts accessible to the API credential.",
    requiredScopes: [accountReadScope],
    inputSchema: paginationInputSchema,
    outputSchema: s.object(
      "The normalized Adyen company account list response.",
      {
        companies: s.array("Company accounts returned by Adyen.", companySchema),
        pagination: paginationSchema,
      },
      { required: ["companies", "pagination"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_company",
    description: "Retrieve one Adyen company account by ID.",
    requiredScopes: [accountReadScope],
    inputSchema: s.object(
      "Path parameters for retrieving an Adyen company account.",
      {
        companyId: idSchema,
      },
      { required: ["companyId"] },
    ),
    outputSchema: s.object(
      "The normalized Adyen company account response.",
      {
        company: companySchema,
      },
      { required: ["company"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_company_merchants",
    description: "List merchant accounts under an Adyen company account.",
    requiredScopes: [accountReadScope],
    inputSchema: s.object(
      "Path and pagination parameters for listing Adyen company merchant accounts.",
      {
        companyId: idSchema,
        pageNumber: pageNumberSchema,
        pageSize: pageSizeSchema,
      },
      { required: ["companyId"] },
    ),
    outputSchema: s.object(
      "The normalized Adyen company merchant account list response.",
      {
        merchants: s.array("Merchant accounts returned by Adyen.", merchantSchema),
        pagination: paginationSchema,
      },
      { required: ["merchants", "pagination"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_merchants",
    description: "List Adyen merchant accounts accessible to the API credential.",
    requiredScopes: [accountReadScope],
    inputSchema: paginationInputSchema,
    outputSchema: s.object(
      "The normalized Adyen merchant account list response.",
      {
        merchants: s.array("Merchant accounts returned by Adyen.", merchantSchema),
        pagination: paginationSchema,
      },
      { required: ["merchants", "pagination"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_merchant",
    description: "Retrieve one Adyen merchant account by ID.",
    requiredScopes: [accountReadScope],
    inputSchema: s.object(
      "Path parameters for retrieving an Adyen merchant account.",
      {
        merchantId: idSchema,
      },
      { required: ["merchantId"] },
    ),
    outputSchema: s.object(
      "The normalized Adyen merchant account response.",
      {
        merchant: merchantSchema,
      },
      { required: ["merchant"] },
    ),
  }),
];

export type AdyenActionName = (typeof adyenActions)[number]["name"];
