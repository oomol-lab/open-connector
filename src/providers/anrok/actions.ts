import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "anrok";

const nonEmptyStringSchema = (description: string) => s.string({ description, minLength: 1, pattern: "\\S" });
const cursorSchema = nonEmptyStringSchema("The Anrok cursor returned as nextCursor from the previous page.");
const customerLimitSchema = s.integer("The maximum number of customers to return.", { minimum: 1, maximum: 100 });
const transactionLimitSchema = s.integer("The maximum number of transactions to return.", { minimum: 1, maximum: 20 });
const filingLimitSchema = s.integer("The maximum number of filings to return.", { minimum: 1, maximum: 100 });

const productTaxCategoryIdSchema = s.object("An Anrok product tax category identifier.", {
  type: s.stringEnum(["standard", "custom"], {
    description: "Whether the product tax category is standard or custom.",
  }),
  id: nonEmptyStringSchema("The Anrok product tax category ID."),
});

const customerSchema = s.looseRequiredObject("An Anrok customer.", {
  id: nonEmptyStringSchema("The unique customer identifier in Anrok."),
  name: s.string("The display name of the customer."),
  emailAddress: s.nullable(s.string("The email address of the customer.")),
});

const productSchema = s.looseRequiredObject("An Anrok product.", {
  externalId: nonEmptyStringSchema("The product external ID."),
  taxCategoryId: productTaxCategoryIdSchema,
  name: s.string("The product display name."),
  description: s.string("The product description."),
});

const transactionSchema = s.looseRequiredObject(
  "An Anrok transaction.",
  {
    id: s.string("The Anrok transaction ID."),
    type: s.string("The Anrok transaction type."),
    anrokCreatedTime: s.dateTime("The timestamp when the transaction was created in Anrok."),
    anrokModifiedTime: s.dateTime("The timestamp when the transaction was last modified in Anrok."),
  },
  { optional: ["id", "type", "anrokCreatedTime", "anrokModifiedTime"] },
);

const filingSchema = s.looseRequiredObject(
  "An Anrok filing.",
  {
    jurisId: s.string("The filing jurisdiction ID."),
    jurisFilingId: s.string("The filing identifier within the jurisdiction."),
    name: s.string("The filing name."),
    isFiled: s.boolean("Whether the filing has been filed."),
    isAutomaticallyUpdatedForTransactionChanges: s.boolean(
      "Whether Anrok automatically updates the filing for transaction changes.",
    ),
    period: s.looseObject(
      {
        begin: s.date("The beginning date of the filing period."),
        endInclusive: s.date("The inclusive end date of the filing period."),
      },
      { description: "The filing period." },
    ),
  },
  {
    optional: ["jurisId", "jurisFilingId", "name", "isFiled", "isAutomaticallyUpdatedForTransactionChanges", "period"],
  },
);

const productTaxCategorySchema = s.object("An Anrok product tax category.", {
  id: productTaxCategoryIdSchema,
  name: s.string("The display name of the product tax category."),
});

const productMappingSchema = s.record(
  "A Product ID mapping from billing-system IDs to Anrok IDs.",
  s.string("The mapped ID."),
);

const transactionLastModifiedAfterFilterSchema = s.object(
  "Filter transactions by the time they were last modified in Anrok.",
  {
    type: s.literal("lastModifiedAfter", { description: "The transaction filter type." }),
    value: s.dateTime("Only return transactions last modified after this UTC timestamp."),
  },
);

const transactionFilingInfoFilterSchema = s.object("Filter transactions by filing association information.", {
  type: s.literal("filingInfo", { description: "The transaction filter type." }),
  value: s.object(
    "The filing association filter value.",
    {
      filingAssociationStatus: s.stringEnum(["associated"], {
        description: "The filing association status to match.",
      }),
      jurisFilingId: nonEmptyStringSchema("The jurisdiction filing ID to match."),
      jurisId: nonEmptyStringSchema("The jurisdiction ID to match."),
    },
    { optional: ["filingAssociationStatus"] },
  ),
});

const paginationOutputFields = {
  hasMore: s.boolean("Whether Anrok has more records after this page."),
  nextCursor: s.nullable(s.string("The cursor to use for the next page, or null when there are no more pages.")),
};

export const anrokActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_customers",
    operationType: "read",
    description: "List Anrok customers with cursor pagination.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing Anrok customers.",
      {
        cursor: cursorSchema,
        limit: customerLimitSchema,
      },
      { optional: ["cursor", "limit"] },
    ),
    outputSchema: s.object("The response returned when listing Anrok customers.", {
      customers: s.array("The Anrok customers returned on this page.", customerSchema),
      ...paginationOutputFields,
    }),
  }),
  defineProviderAction(service, {
    name: "get_customer",
    operationType: "read",
    description: "Retrieve one Anrok customer by customer ID.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for retrieving one Anrok customer.",
      {
        customerId: nonEmptyStringSchema("The unique customer identifier in Anrok."),
      },
      { required: ["customerId"] },
    ),
    outputSchema: customerSchema,
  }),
  defineProviderAction(service, {
    name: "list_transactions",
    operationType: "read",
    description: "List Anrok transactions with optional cursor pagination and filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing Anrok transactions.",
      {
        cursor: cursorSchema,
        limit: transactionLimitSchema,
        filter: s.oneOf([transactionLastModifiedAfterFilterSchema, transactionFilingInfoFilterSchema], {
          description: "The filter to apply to returned transactions.",
        }),
      },
      { optional: ["cursor", "limit", "filter"] },
    ),
    outputSchema: s.object("The response returned when listing Anrok transactions.", {
      transactions: s.array("The Anrok transactions returned on this page.", transactionSchema),
      ...paginationOutputFields,
    }),
  }),
  defineProviderAction(service, {
    name: "list_filings",
    operationType: "read",
    description: "List Anrok filings with optional cursor pagination and filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing Anrok filings.",
      {
        cursor: cursorSchema,
        limit: filingLimitSchema,
        filter: s.object(
          "The filter to apply to returned filings.",
          {
            jurisId: nonEmptyStringSchema("The jurisdiction ID to filter by."),
            periodEndDateRangeInclusive: nonEmptyStringSchema(
              "The filing period end date range to filter by, such as 2025-01..2025-03.",
            ),
          },
          { optional: ["jurisId", "periodEndDateRangeInclusive"] },
        ),
      },
      { optional: ["cursor", "limit", "filter"] },
    ),
    outputSchema: s.object("The response returned when listing Anrok filings.", {
      filings: s.array("The Anrok filings returned on this page.", filingSchema),
      ...paginationOutputFields,
    }),
  }),
  defineProviderAction(service, {
    name: "get_product",
    operationType: "read",
    description: "Retrieve one Anrok product by external ID.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for retrieving one Anrok product.",
      {
        externalId: nonEmptyStringSchema("The external product ID to look up in Anrok."),
      },
      { required: ["externalId"] },
    ),
    outputSchema: productSchema,
  }),
  defineProviderAction(service, {
    name: "list_product_tax_categories",
    operationType: "read",
    description: "List product tax categories available on the Anrok seller account.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for listing Anrok product tax categories.", {}),
    outputSchema: s.object("The response returned when listing Anrok product tax categories.", {
      productTaxCategories: s.array(
        "The Anrok product tax categories available on the seller account.",
        productTaxCategorySchema,
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "list_product_mappings",
    operationType: "read",
    description: "List Product ID mappings for one Anrok integration.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing Anrok product mappings.",
      {
        integrationId: nonEmptyStringSchema("The Anrok integration ID whose mappings should be listed."),
      },
      { required: ["integrationId"] },
    ),
    outputSchema: s.array("The Product ID mapping objects returned by Anrok.", productMappingSchema),
  }),
];
