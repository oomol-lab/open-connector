import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "fluxguard";

const nonEmptyStringSchema = (description: string) =>
  s.string(description, {
    minLength: 1,
    pattern: "\\S",
  });
const urlSchema = s.url("The absolute URL that Fluxguard should monitor.");
const siteIdSchema = nonEmptyStringSchema("The Fluxguard site ID.");
const sessionIdSchema = nonEmptyStringSchema("The Fluxguard session ID.");
const pageIdSchema = nonEmptyStringSchema("The Fluxguard page ID.");
const webhookUrlSchema = s.url("The webhook URL that Fluxguard should notify.");
const rawObjectSchema = s.unknownObject("The raw object returned by Fluxguard.");
const accountSchema = s.object("A normalized Fluxguard account response.", {
  id: s.nullable(s.string("The Fluxguard account or organization ID when returned.")),
  status: s.nullable(s.string("The account status when returned.")),
  raw: rawObjectSchema,
});
const addPageResultSchema = s.object("A normalized Fluxguard add-page response.", {
  siteId: s.nullable(s.string("The site ID returned by Fluxguard.")),
  sessionId: s.nullable(s.string("The session ID returned by Fluxguard.")),
  pageId: s.nullable(s.string("The page ID returned by Fluxguard.")),
  raw: rawObjectSchema,
});
const pageDataSchema = s.object("A normalized Fluxguard monitored page response.", {
  siteId: s.nullable(s.string("The site ID returned by Fluxguard.")),
  sessionId: s.nullable(s.string("The session ID returned by Fluxguard.")),
  pageId: s.nullable(s.string("The page ID returned by Fluxguard.")),
  url: s.nullable(s.string("The monitored page URL when returned.")),
  raw: rawObjectSchema,
});
const webhookSchema = s.object("A normalized Fluxguard webhook object.", {
  id: s.nullable(s.string("The webhook ID returned by Fluxguard.")),
  url: s.nullable(s.string("The webhook URL returned by Fluxguard.")),
  raw: rawObjectSchema,
});
const categorySchema = s.object("A normalized Fluxguard category object.", {
  id: s.string("The Fluxguard category ID."),
  name: s.nullable(s.string("The category name when returned.")),
  type: s.nullable(s.string("The category type when returned, such as site or page.")),
  raw: rawObjectSchema,
});
const genericResultSchema = s.object("A normalized Fluxguard operation result.", {
  ok: s.boolean("Whether the Fluxguard operation completed successfully."),
  raw: s.nullable(rawObjectSchema),
});
const categoryIdsSchema = s.array(
  "Fluxguard site category IDs to assign while creating a site.",
  nonEmptyStringSchema("A Fluxguard category ID."),
  { minItems: 1 },
);

export const fluxguardActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account",
    description: "Get account attributes for the authenticated Fluxguard organization.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for getting a Fluxguard account.", {}),
    outputSchema: s.object("The response returned when getting a Fluxguard account.", {
      account: accountSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "add_page",
    description: "Add a URL as a monitored Fluxguard page.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for adding a Fluxguard monitored page.",
      {
        url: urlSchema,
        siteId: siteIdSchema,
        sessionId: sessionIdSchema,
        nickname: nonEmptyStringSchema("A nickname for the monitored site or page."),
        categoryIds: categoryIdsSchema,
      },
      { optional: ["siteId", "sessionId", "nickname", "categoryIds"] },
    ),
    outputSchema: s.object("The response returned when adding a Fluxguard page.", {
      page: addPageResultSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "initiate_crawl",
    description: "Initiate a Fluxguard crawl for a monitored session.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for initiating a Fluxguard crawl.", {
      siteId: siteIdSchema,
      sessionId: sessionIdSchema,
    }),
    outputSchema: s.object("The response returned when initiating a Fluxguard crawl.", {
      result: genericResultSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_page",
    description: "Get Fluxguard data for a monitored page.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for getting a Fluxguard monitored page.", {
      siteId: siteIdSchema,
      sessionId: sessionIdSchema,
      pageId: pageIdSchema,
    }),
    outputSchema: s.object("The response returned when getting a Fluxguard monitored page.", {
      page: pageDataSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_sample_webhook",
    description: "Get a sample Fluxguard webhook payload for the authenticated account.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for getting a Fluxguard sample webhook.", {}),
    outputSchema: s.object("The response returned when getting a Fluxguard sample webhook.", {
      sample: s.unknownObject("The sample webhook payload returned by Fluxguard."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_webhooks",
    description: "List Fluxguard webhooks configured for the authenticated account.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for listing Fluxguard webhooks.", {}),
    outputSchema: s.object("The response returned when listing Fluxguard webhooks.", {
      webhooks: s.array("The webhooks returned by Fluxguard.", webhookSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "upsert_webhook",
    description: "Create or replace the Fluxguard account webhook.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for creating or replacing a Fluxguard webhook.",
      {
        url: webhookUrlSchema,
        siteCategoryIds: s.array(
          "Fluxguard site category IDs to associate with the webhook.",
          nonEmptyStringSchema("A Fluxguard site category ID."),
          { minItems: 1 },
        ),
      },
      { optional: ["siteCategoryIds"] },
    ),
    outputSchema: s.object("The response returned when creating or replacing a Fluxguard webhook.", {
      webhook: webhookSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_webhook",
    description: "Delete the Fluxguard account webhook.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for deleting a Fluxguard webhook.", {}),
    outputSchema: s.object("The response returned when deleting a Fluxguard webhook.", {
      result: genericResultSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_categories",
    description: "List Fluxguard account categories.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for listing Fluxguard categories.", {}),
    outputSchema: s.object("The response returned when listing Fluxguard categories.", {
      categories: s.array("The categories returned by Fluxguard.", categorySchema),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_category",
    description: "Create a Fluxguard site category.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for creating a Fluxguard site category.", {
      name: nonEmptyStringSchema("The Fluxguard site category name."),
    }),
    outputSchema: s.object("The response returned when creating a Fluxguard site category.", {
      category: categorySchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_site",
    description: "Delete a Fluxguard monitored site and its associated data.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for deleting a Fluxguard site.", {
      siteId: siteIdSchema,
    }),
    outputSchema: s.object("The response returned when deleting a Fluxguard site.", {
      result: genericResultSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_page",
    description: "Delete a Fluxguard monitored page and its captured versions.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for deleting a Fluxguard monitored page.", {
      siteId: siteIdSchema,
      sessionId: sessionIdSchema,
      pageId: pageIdSchema,
    }),
    outputSchema: s.object("The response returned when deleting a Fluxguard monitored page.", {
      result: genericResultSchema,
    }),
  }),
];

export type FluxguardActionName =
  | "get_account"
  | "add_page"
  | "initiate_crawl"
  | "get_page"
  | "get_sample_webhook"
  | "list_webhooks"
  | "upsert_webhook"
  | "delete_webhook"
  | "list_categories"
  | "create_category"
  | "delete_site"
  | "delete_page";
