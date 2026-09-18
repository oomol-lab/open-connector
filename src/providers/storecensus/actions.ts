import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "storecensus";

const storecensusSectionSchema = s.stringEnum("A StoreCensus response section to include.", [
  "basic_info",
  "contact_info",
  "location_info",
  "social_media",
  "ecommerce_info",
  "financial_info",
  "traffic_analytics",
  "technical_info",
  "apps_integrations",
  "activity_signals",
  "crm",
  "data_metadata",
]);

const sectionsSchema = s.array(
  "StoreCensus response sections to include. Omit this field to request all sections.",
  storecensusSectionSchema,
);

const paginationSchema = s.looseObject("StoreCensus pagination metadata.", {
  page: s.integer("The one-indexed page number returned by StoreCensus."),
  pageSize: s.integer("The page size returned by StoreCensus."),
  hasMore: s.boolean("Whether StoreCensus has more results after this page."),
  nextCursor: s.nullable(s.string("The cursor for the next result page.")),
  total: s.integer("The total number of matching records when StoreCensus returns it."),
  returned: s.integer("The number of records returned in this response."),
  totalPages: s.integer("The total number of pages when StoreCensus returns it."),
});

const storeSchema = s.looseObject("A StoreCensus ecommerce store record.", {
  basic_info: s.looseObject("Basic website and company information."),
  contact_info: s.looseObject("Store contact information."),
  location_info: s.looseObject("Store location information."),
  social_media: s.looseObject("Store social media profile information."),
  ecommerce_info: s.looseObject("Ecommerce platform and catalog information."),
  financial_info: s.looseObject("Estimated revenue and technology spend information."),
  traffic_analytics: s.looseObject("Estimated traffic and audience analytics."),
  technical_info: s.looseObject("Detected technology information."),
  apps_integrations: s.looseObject("Detected Shopify app integration information."),
  activity_signals: s.looseObject("Recent activity and growth signals."),
  crm: s.looseObject("StoreCensus CRM fields for the store."),
  data_metadata: s.looseObject("StoreCensus data metadata for the store."),
});

const appCategorySchema = s.looseObject("A StoreCensus Shopify app category.", {
  category_id: s.integer("The StoreCensus category identifier."),
  name: s.string("The category name."),
  slug: s.string("The URL-friendly category slug."),
  app_count: s.integer("The number of active apps in this category."),
});

const appSchema = s.looseObject("A StoreCensus Shopify app record.", {
  app_id: s.integer("The StoreCensus app identifier."),
  name: s.string("The app name."),
  handle: s.string("The URL-friendly Shopify app handle."),
  description: s.string("The app description."),
  icon_url: s.string("The app icon URL."),
  rating: s.number("The average app rating from zero to five."),
  developer: s.string("The app developer name."),
  active: s.boolean("Whether the app is active."),
  check_status: s.string("The StoreCensus app check status."),
  last_updated: s.string("The last time StoreCensus updated this app record."),
  main_category: appCategorySchema,
  categories: s.array("The categories associated with this app.", appCategorySchema),
});

export const storecensusActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_website",
    operationType: "read",
    description: "Retrieve StoreCensus ecommerce intelligence for a website domain or lead ID.",
    inputSchema: s.object(
      "The input payload for retrieving one StoreCensus website.",
      {
        domain: s.nonWhitespaceString(
          "The domain name or numeric StoreCensus lead ID to retrieve, such as example-store.com or 12345.",
        ),
        sections: sectionsSchema,
      },
      { optional: ["sections"] },
    ),
    outputSchema: s.object("The response returned when retrieving one StoreCensus website.", {
      website: storeSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "search_stores",
    operationType: "read",
    description: "Search StoreCensus ecommerce stores with filters and cursor pagination.",
    inputSchema: s.object(
      "The input payload for searching StoreCensus stores.",
      {
        filters: s.looseObject(
          "StoreCensus store filters, such as country, vertical, apps, estimatedVisits, or CRM filters.",
        ),
        sort: s.object(
          "The StoreCensus sort configuration.",
          {
            column: s.nonWhitespaceString("The StoreCensus column to sort by."),
            direction: s.stringEnum("The sort direction.", ["asc", "desc"]),
          },
          { optional: ["direction"] },
        ),
        pageSize: s.integer("The number of stores to return. StoreCensus allows 50 to 500.", {
          minimum: 1,
          maximum: 500,
        }),
        cursor: s.nonWhitespaceString("The StoreCensus cursor returned by the previous page."),
        sections: sectionsSchema,
      },
      { optional: ["filters", "sort", "pageSize", "cursor", "sections"] },
    ),
    outputSchema: s.object("The response returned when searching StoreCensus stores.", {
      stores: s.array("The stores returned by StoreCensus.", storeSchema),
      pagination: paginationSchema,
      filters: s.looseObject("The filters applied by StoreCensus."),
      sort: s.looseObject("The sort applied by StoreCensus."),
      sections: s.array("The StoreCensus sections included in the response.", storecensusSectionSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_apps",
    operationType: "read",
    description: "List or search StoreCensus Shopify apps with page pagination.",
    inputSchema: s.object(
      "The input payload for listing StoreCensus Shopify apps.",
      {
        page: s.integer("The one-indexed page number to return.", { minimum: 1 }),
        pageSize: s.integer("The number of apps to return. StoreCensus caps this at 500.", {
          minimum: 1,
          maximum: 500,
        }),
        app_id: s.integer("The specific StoreCensus app ID to retrieve.", { minimum: 1 }),
        minRating: s.number("The minimum app rating to return.", { minimum: 0, maximum: 5 }),
        search: s.nonWhitespaceString("A text search applied to app name, description, or developer."),
        categoryId: s.integer("The StoreCensus app category ID to filter by.", { minimum: 1 }),
      },
      { optional: ["page", "pageSize", "app_id", "minRating", "search", "categoryId"] },
    ),
    outputSchema: s.object("The response returned when listing StoreCensus Shopify apps.", {
      apps: s.array("The apps returned by StoreCensus.", appSchema),
      pagination: paginationSchema,
      filters: s.looseObject("The app filters applied by StoreCensus."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_app_categories",
    operationType: "read",
    description: "List StoreCensus Shopify app categories that have active apps.",
    inputSchema: s.object("The input payload for listing StoreCensus app categories.", {}),
    outputSchema: s.object("The response returned when listing StoreCensus app categories.", {
      categories: s.array("The app categories returned by StoreCensus.", appCategorySchema),
      total: s.integer("The total number of categories returned by StoreCensus."),
    }),
  }),
];
