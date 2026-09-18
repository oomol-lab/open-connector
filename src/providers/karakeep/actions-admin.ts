import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { karakeepIdField } from "./schemas.ts";

const service = "karakeep";
const adminUserWriteScopes = ["admin:users:readwrite"] as const;
const adminBookmarkWriteScopes = ["admin:bookmarks:readwrite"] as const;

const adminAccessNote =
  "Requires an API key owned by a Karakeep admin user; any other key fails with authorization_failed and carries the upstream 403 message Forbidden - Admin access required.";

const jobStatusFilterValues = ["success", "failure", "pending", "all"] as const;

const modifiedWithinSecondsField = s.positiveInteger(
  "Only process bookmarks modified within this many seconds. Must be greater than zero. Omit to process all matching bookmarks.",
);

const adminJobResultSchema = s.looseRequiredObject("The result of triggering an administrative background job.", {
  success: s.boolean("Whether the job was triggered successfully."),
});

export const karakeepAdminActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "admin_update_user",
    operationType: "destructive",
    description: `Update another Karakeep user's role, bookmark quota, storage quota or browser crawling setting. Only the provided fields are changed, and at least one of them must be present. Karakeep rejects updating the user that owns the API key with a 400. ${adminAccessNote}`,
    requiredScopes: adminUserWriteScopes,
    inputSchema: s.object(
      "The Karakeep user to update and the fields to change.",
      {
        userId: karakeepIdField("The id of the user to update."),
        role: s.stringEnum("The role to assign to the user.", ["user", "admin"]),
        bookmarkQuota: s.nullableInteger(
          "The maximum number of bookmarks the user may keep, or null to remove the quota.",
          { minimum: 0 },
        ),
        storageQuota: s.nullableInteger(
          "The maximum number of asset bytes the user may store, or null to remove the quota.",
          { minimum: 0 },
        ),
        browserCrawlingEnabled: s.nullableBoolean(
          "Whether the user may use browser based crawling, or null to fall back to the server default.",
        ),
      },
      { optional: ["role", "bookmarkQuota", "storageQuota", "browserCrawlingEnabled"] },
    ),
    outputSchema: s.looseRequiredObject("The result of updating a Karakeep user.", {
      success: s.boolean("Whether the update was successful."),
    }),
  }),
  defineProviderAction(service, {
    name: "admin_trigger_recrawl",
    operationType: "write",
    description: `Trigger a recrawl of link bookmarks across the whole Karakeep instance. Filter by crawl status to target specific bookmarks, for example only the failed ones, and by how recently they were modified. The crawls are queued and run asynchronously. ${adminAccessNote}`,
    requiredScopes: adminBookmarkWriteScopes,
    inputSchema: s.object(
      "The options for the recrawl job.",
      {
        crawlStatus: s.withDefault(
          s.stringEnum(
            "Filter bookmarks by their crawl status. Use failure to retry only the failed crawls.",
            jobStatusFilterValues,
          ),
          "all",
        ),
        runInference: s.boolean({
          description: "Whether to run AI inference after crawling.",
          default: false,
        }),
        modifiedWithinSeconds: modifiedWithinSecondsField,
      },
      { optional: ["crawlStatus", "runInference", "modifiedWithinSeconds"] },
    ),
    outputSchema: adminJobResultSchema,
  }),
  defineProviderAction(service, {
    name: "admin_trigger_reindex",
    operationType: "destructive",
    description: `Trigger a reindex of bookmarks in the Karakeep search engine. Without modifiedWithinSeconds Karakeep clears the whole search index first and then re-queues every bookmark, so search results across the instance stay incomplete until the queue drains; with it only the bookmarks modified inside that window are re-queued and the existing index is preserved. The reindex runs asynchronously. ${adminAccessNote}`,
    requiredScopes: adminBookmarkWriteScopes,
    inputSchema: s.object(
      "The options for the reindex job.",
      { modifiedWithinSeconds: modifiedWithinSecondsField },
      { optional: ["modifiedWithinSeconds"] },
    ),
    outputSchema: adminJobResultSchema,
  }),
  defineProviderAction(service, {
    name: "admin_trigger_inference",
    operationType: "write",
    description: `Trigger AI inference, either tagging or summarization, on bookmarks across the whole Karakeep instance. Filter by inference status and by how recently the bookmarks were modified. The inference jobs are queued and run asynchronously. ${adminAccessNote}`,
    requiredScopes: adminBookmarkWriteScopes,
    inputSchema: s.object(
      "The options for the inference job.",
      {
        type: s.stringEnum("The type of inference to run: tag for AI tagging, summarize for AI summarization.", [
          "tag",
          "summarize",
        ]),
        status: s.withDefault(
          s.stringEnum(
            "Filter bookmarks by their inference status. Use failure to retry only the failed ones.",
            jobStatusFilterValues,
          ),
          "all",
        ),
        modifiedWithinSeconds: modifiedWithinSecondsField,
      },
      { optional: ["status", "modifiedWithinSeconds"] },
    ),
    outputSchema: adminJobResultSchema,
  }),
];
