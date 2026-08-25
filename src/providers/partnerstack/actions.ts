import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "partnerstack";

const keySchema = s.string("A PartnerStack resource key.", { minLength: 1, maxLength: 255 });
const cursorSchema = s.string("A cursor key returned by PartnerStack pagination.", {
  minLength: 1,
});
const limitSchema = s.integer("The maximum number of records PartnerStack should return.", {
  minimum: 1,
  maximum: 250,
});
const epochMsSchema = s.integer("A Unix timestamp in milliseconds.");
const looseFieldsSchema = s.looseObject("Additional PartnerStack custom fields.");

const pageInputFields: Record<string, JsonSchema> = {
  limit: limitSchema,
  startingAfter: cursorSchema,
  endingBefore: cursorSchema,
  minCreated: epochMsSchema,
  maxCreated: epochMsSchema,
  minUpdated: epochMsSchema,
  maxUpdated: epochMsSchema,
  group: s.string("Filter to partnerships in a group by normalized group name.", {
    minLength: 1,
  }),
};

const listOutputPageFields: Record<string, JsonSchema> = {
  hasMore: s.boolean("Whether PartnerStack has another page of results."),
};

const customerSchema = s.object("A normalized PartnerStack customer.", {
  key: keySchema,
  customerKey: s.nullable(s.string("The external customer key when returned by PartnerStack.")),
  email: s.nullable(s.string("The customer email address when returned by PartnerStack.")),
  name: s.nullable(s.string("The customer name when returned by PartnerStack.")),
  partnerKey: s.nullable(s.string("The partner key associated with the customer.")),
  partnershipKey: s.nullable(s.string("The partnership key associated with the customer.")),
  createdAt: s.nullable(s.integer("The creation timestamp in milliseconds.")),
  updatedAt: s.nullable(s.integer("The last update timestamp in milliseconds.")),
  raw: s.looseObject("The raw customer object returned by PartnerStack."),
});

const partnershipSchema = s.object("A normalized PartnerStack partnership.", {
  key: keySchema,
  partnerKey: s.nullable(s.string("The partner key for the partnership.")),
  email: s.nullable(s.string("The partner email address when returned by PartnerStack.")),
  name: s.nullable(s.string("The partner or company name when returned by PartnerStack.")),
  approvedStatus: s.nullable(s.string("The approval status of the partnership.")),
  claimed: s.nullable(s.boolean("Whether the partnership has been claimed.")),
  createdAt: s.nullable(s.integer("The creation timestamp in milliseconds.")),
  updatedAt: s.nullable(s.integer("The last update timestamp in milliseconds.")),
  raw: s.looseObject("The raw partnership object returned by PartnerStack."),
});

const leadSchema = s.object("A normalized PartnerStack lead.", {
  key: keySchema,
  leadKey: s.nullable(s.string("The external lead key when returned by PartnerStack.")),
  email: s.nullable(s.string("The lead email address when returned by PartnerStack.")),
  name: s.nullable(s.string("The lead or company name when returned by PartnerStack.")),
  partnerKey: s.nullable(s.string("The partner key associated with the lead.")),
  customerKey: s.nullable(s.string("The customer key associated with the lead.")),
  createdAt: s.nullable(s.integer("The creation timestamp in milliseconds.")),
  updatedAt: s.nullable(s.integer("The last update timestamp in milliseconds.")),
  raw: s.looseObject("The raw lead object returned by PartnerStack."),
});

const dealSchema = s.object("A normalized PartnerStack deal.", {
  key: keySchema,
  dealKey: s.nullable(s.string("The external deal key when returned by PartnerStack.")),
  name: s.nullable(s.string("The deal name when returned by PartnerStack.")),
  stage: s.nullable(s.string("The deal stage when returned by PartnerStack.")),
  partnerKey: s.nullable(s.string("The partner key associated with the deal.")),
  customerKey: s.nullable(s.string("The customer key associated with the deal.")),
  amount: s.nullable(s.number("The deal amount when returned by PartnerStack.")),
  createdAt: s.nullable(s.integer("The creation timestamp in milliseconds.")),
  updatedAt: s.nullable(s.integer("The last update timestamp in milliseconds.")),
  raw: s.looseObject("The raw deal object returned by PartnerStack."),
});

const customerListInputSchema = s.object(
  "Query parameters for listing PartnerStack customers.",
  {
    ...pageInputFields,
    partnerKey: s.string("Filter to customers for a specific partner key.", { minLength: 1 }),
    partnershipKey: s.string("Filter to customers for a specific partnership key.", {
      minLength: 1,
    }),
    customerKeys: s.array("Filter to specific customer keys.", keySchema),
  },
  {
    optional: [
      "limit",
      "startingAfter",
      "endingBefore",
      "minCreated",
      "maxCreated",
      "minUpdated",
      "maxUpdated",
      "group",
      "partnerKey",
      "partnershipKey",
      "customerKeys",
    ],
  },
);

const partnershipListInputSchema = s.object(
  "Query parameters for listing PartnerStack partnerships.",
  {
    ...pageInputFields,
    orderBy: s.stringEnum("The field and direction PartnerStack should order by.", [
      "-created_at",
      "created_at",
      "-updated_at",
      "updated_at",
    ]),
    email: s.email("Filter to the partner email address."),
    approvedStatus: s.stringEnum("Filter by partnership approval status.", ["approved", "pending", "declined"]),
    includeArchived: s.boolean("Whether PartnerStack should include archived partnerships."),
    partnershipKey: s.string("Filter to a specific partnership key.", { minLength: 1 }),
  },
  {
    optional: [
      "limit",
      "startingAfter",
      "endingBefore",
      "minCreated",
      "maxCreated",
      "minUpdated",
      "maxUpdated",
      "group",
      "orderBy",
      "email",
      "approvedStatus",
      "includeArchived",
      "partnershipKey",
    ],
  },
);

const leadListInputSchema = s.object(
  "Query parameters for listing PartnerStack leads.",
  {
    ...pageInputFields,
    partnerKey: s.string("Filter to leads for a specific partner key.", { minLength: 1 }),
    leadKey: s.string("Filter to a specific lead key.", { minLength: 1 }),
  },
  {
    optional: [
      "limit",
      "startingAfter",
      "endingBefore",
      "minCreated",
      "maxCreated",
      "minUpdated",
      "maxUpdated",
      "group",
      "partnerKey",
      "leadKey",
    ],
  },
);

const dealListInputSchema = s.object(
  "Query parameters for listing PartnerStack deals.",
  {
    ...pageInputFields,
    partnerKey: s.string("Filter to deals for a specific partner key.", { minLength: 1 }),
    customerKeys: s.array("Filter to specific customer keys.", keySchema),
    dealKey: s.string("Filter to a specific deal key.", { minLength: 1 }),
  },
  {
    optional: [
      "limit",
      "startingAfter",
      "endingBefore",
      "minCreated",
      "maxCreated",
      "minUpdated",
      "maxUpdated",
      "group",
      "partnerKey",
      "customerKeys",
      "dealKey",
    ],
  },
);

export const partnerstackActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_customers",
    description: "List PartnerStack customers with pagination and common filters.",
    requiredScopes: [],
    inputSchema: customerListInputSchema,
    outputSchema: s.object("The normalized PartnerStack customer list response.", {
      customers: s.array("Customers returned by PartnerStack.", customerSchema),
      ...listOutputPageFields,
    }),
  }),
  defineProviderAction(service, {
    name: "get_customer",
    description: "Retrieve one PartnerStack customer by customer key.",
    requiredScopes: [],
    inputSchema: s.object("Path parameters for retrieving a PartnerStack customer.", {
      customerKey: keySchema,
    }),
    outputSchema: s.object("The normalized PartnerStack customer response.", {
      customer: customerSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_customer",
    description: "Create a PartnerStack customer from JSON-friendly fields.",
    requiredScopes: [],
    inputSchema: s.object(
      "Customer fields forwarded to PartnerStack's create customer endpoint.",
      {
        customerKey: s.string("External customer key to assign to the customer.", {
          minLength: 1,
          maxLength: 255,
        }),
        partnerKey: s.string("Partner key responsible for the customer.", { minLength: 1 }),
        email: s.email("The customer email address."),
        name: s.string("The customer or company name.", { minLength: 1, maxLength: 100 }),
        memberKey: s.string("The member key responsible for the customer.", { minLength: 1 }),
        providerKey: s.string("A payment provider customer identifier.", {
          minLength: 1,
          maxLength: 255,
        }),
        meta: looseFieldsSchema,
      },
      { optional: ["name", "memberKey", "providerKey", "meta"] },
    ),
    outputSchema: s.object("The normalized PartnerStack customer creation response.", {
      customer: customerSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_partnerships",
    description: "List PartnerStack partnerships with pagination and common filters.",
    requiredScopes: [],
    inputSchema: partnershipListInputSchema,
    outputSchema: s.object("The normalized PartnerStack partnership list response.", {
      partnerships: s.array("Partnerships returned by PartnerStack.", partnershipSchema),
      ...listOutputPageFields,
    }),
  }),
  defineProviderAction(service, {
    name: "get_partnership",
    description: "Retrieve one PartnerStack partnership by partner key, partnership key, or email.",
    requiredScopes: [],
    inputSchema: s.object("Path parameters for retrieving a PartnerStack partnership.", {
      uniqueIdentifier: s.string("A partner key, internal partnership key, or email.", {
        minLength: 1,
      }),
    }),
    outputSchema: s.object("The normalized PartnerStack partnership response.", {
      partnership: partnershipSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_leads",
    description: "List PartnerStack leads with pagination and common filters.",
    requiredScopes: [],
    inputSchema: leadListInputSchema,
    outputSchema: s.object("The normalized PartnerStack lead list response.", {
      leads: s.array("Leads returned by PartnerStack.", leadSchema),
      ...listOutputPageFields,
    }),
  }),
  defineProviderAction(service, {
    name: "list_deals",
    description: "List PartnerStack deals with pagination and common filters.",
    requiredScopes: [],
    inputSchema: dealListInputSchema,
    outputSchema: s.object("The normalized PartnerStack deal list response.", {
      deals: s.array("Deals returned by PartnerStack.", dealSchema),
      ...listOutputPageFields,
    }),
  }),
];
