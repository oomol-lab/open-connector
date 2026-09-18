import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "gatherup";

const positiveInteger = (description: string) => s.integer(description, { minimum: 1 });
const nullableString = (description: string) => s.nullable(s.string(description));
const idOutput = (description: string) =>
  s.anyOf(description, [s.string(`${description} as a string.`), s.integer(`${description} as an integer.`)]);

const commonOptionalInputFields = {
  agent: positiveInteger("The optional GatherUp agency client number to target when using account-owner credentials."),
};

const commonSuccessOutputFields = {
  errorCode: s.integer("The GatherUp result code. A successful response returns 0."),
  errorMessage: s.string("The GatherUp result message."),
};

const businessListItemSchema = s.looseRequiredObject("A business location returned by GatherUp.", {
  businessId: positiveInteger("The GatherUp business ID."),
  businessName: s.string("The business name."),
  businessDeleted: s.integer("Whether GatherUp marks the business as deleted."),
});

const businessDetailSchema = s.looseRequiredObject(
  "A GatherUp business location with provider-defined fields preserved.",
  {
    id: positiveInteger("The GatherUp business ID."),
    name: s.string("The business name."),
    ...commonSuccessOutputFields,
  },
);

const customerListItemSchema = s.object(
  "A customer returned by GatherUp.",
  {
    id: idOutput("The GatherUp customer ID"),
    businessId: idOutput("The GatherUp business ID associated with the customer"),
    firstName: s.string("The customer's first name."),
    lastName: s.string("The customer's last name."),
    phone: s.string("The customer's phone number when present."),
    email: s.string("The customer's email address when present."),
    jobId: s.string("The customer job ID when configured."),
    customId: s.string("The customer custom ID when configured."),
    parentId: idOutput("The parent customer ID"),
    rating: nullableString("The customer's rating, or null when no rating has been received."),
    review: nullableString("The customer's review, or null when no review has been received."),
    statusInfo: s.string("The current GatherUp feedback request status."),
    subscription: s.integer("The customer's subscription flag returned by GatherUp."),
    createdAt: s.string("The timestamp when the customer was created."),
  },
  {
    optional: [
      "firstName",
      "lastName",
      "phone",
      "email",
      "jobId",
      "customId",
      "parentId",
      "rating",
      "review",
      "statusInfo",
      "subscription",
      "createdAt",
    ],
    additionalProperties: true,
  },
);

const customerDetailSchema = s.object(
  "A GatherUp customer with provider-defined fields preserved.",
  {
    businessId: idOutput("The GatherUp business ID associated with the customer"),
    firstName: s.string("The customer's first name."),
    lastName: s.string("The customer's last name."),
    email: s.string("The customer's email address when present."),
    phone: s.string("The customer's phone number when present."),
    jobId: s.string("The customer job ID when configured."),
    customId: s.string("The customer custom ID when configured."),
    rating: nullableString("The customer's rating, or null when no rating has been received."),
    statusInfo: s.string("The current GatherUp feedback request status."),
    unsubscribed: s.string("The customer unsubscribe flag returned by GatherUp."),
    createdAt: s.string("The timestamp when the customer was created."),
    ...commonSuccessOutputFields,
  },
  {
    optional: [
      "firstName",
      "lastName",
      "email",
      "phone",
      "jobId",
      "customId",
      "rating",
      "statusInfo",
      "unsubscribed",
      "createdAt",
    ],
    additionalProperties: true,
  },
);

const listBusinessesAction = defineProviderAction(service, {
  name: "list_businesses",
  operationType: "read",
  description: "List one page of business locations available to the connected GatherUp account.",
  requiredScopes: [],
  inputSchema: s.object(
    "Filters for listing GatherUp business locations.",
    {
      ...commonOptionalInputFields,
      includeDeletedBusinesses: s.boolean("Whether GatherUp should include deleted business locations."),
      page: positiveInteger("The one-based page number to request."),
      limit: positiveInteger("The number of business locations to request per page."),
    },
    { optional: ["agent", "includeDeletedBusinesses", "page", "limit"] },
  ),
  outputSchema: s.looseRequiredObject("A page of GatherUp business locations.", {
    page: positiveInteger("The current page number."),
    perPage: positiveInteger("The number of business locations requested per page."),
    pages: s.nonNegativeInteger("The total number of pages."),
    count: s.nonNegativeInteger("The total number of business locations."),
    data: s.array("The business locations returned on this page.", businessListItemSchema),
    ...commonSuccessOutputFields,
  }),
});

const getBusinessAction = defineProviderAction(service, {
  name: "get_business",
  operationType: "read",
  description: "Get one GatherUp business location by ID.",
  requiredScopes: [],
  inputSchema: s.object(
    "The GatherUp business lookup input.",
    {
      ...commonOptionalInputFields,
      businessId: positiveInteger("The GatherUp business ID to retrieve."),
    },
    { optional: ["agent"] },
  ),
  outputSchema: businessDetailSchema,
});

const listCustomersAction = defineProviderAction(service, {
  name: "list_customers",
  operationType: "read",
  description: "List one page of GatherUp customers with optional business and customer filters.",
  requiredScopes: [],
  inputSchema: s.object(
    "Filters for listing GatherUp customers.",
    {
      ...commonOptionalInputFields,
      businessId: positiveInteger("Filter customers by GatherUp business ID."),
      customerId: positiveInteger("Filter customers by GatherUp customer ID."),
      customId: s.nonEmptyString("Filter customers by custom ID."),
      jobId: s.nonEmptyString("Filter customers by job ID."),
      email: s.email("Filter customers by email address."),
      page: positiveInteger("The one-based page number to request."),
      subscription: s.boolean("Filter customers by subscription status."),
      showHistory: s.boolean("Whether GatherUp should include customer history."),
    },
    {
      optional: [
        "agent",
        "businessId",
        "customerId",
        "customId",
        "jobId",
        "email",
        "page",
        "subscription",
        "showHistory",
      ],
    },
  ),
  outputSchema: s.object(
    "A page of GatherUp customers.",
    {
      page: positiveInteger("The current page number."),
      pages: s.nonNegativeInteger("The total number of pages."),
      count: s.nonNegativeInteger("The total number of customers."),
      perPage: positiveInteger("The number of customers returned per page."),
      data: s.array("The customers returned on this page.", customerListItemSchema),
      ...commonSuccessOutputFields,
    },
    { optional: ["errorCode", "errorMessage"], additionalProperties: true },
  ),
});

const getCustomerAction = defineProviderAction(service, {
  name: "get_customer",
  operationType: "read",
  description: "Get one GatherUp customer by ID.",
  requiredScopes: [],
  inputSchema: s.object(
    "The GatherUp customer lookup input.",
    {
      ...commonOptionalInputFields,
      customerId: positiveInteger("The GatherUp customer ID to retrieve."),
    },
    { optional: ["agent"] },
  ),
  outputSchema: customerDetailSchema,
});

export const gatherupActions: ActionDefinition[] = [
  listBusinessesAction,
  getBusinessAction,
  listCustomersAction,
  getCustomerAction,
];
