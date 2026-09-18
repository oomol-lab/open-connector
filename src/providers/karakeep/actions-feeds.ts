import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { feedSchema, karakeepIdField, successResultSchema } from "./schemas.ts";

const service = "karakeep";
const feedReadScopes = ["feeds:read"] as const;
const feedWriteScopes = ["feeds:readwrite"] as const;

const feedIdField = karakeepIdField("The unique identifier of the feed.");

const feedNameField = s.string("The display name of the feed subscription.", {
  minLength: 1,
  maxLength: 100,
});

const feedUrlField = s.string("The RSS or Atom feed URL that the Karakeep server fetches on a schedule.", {
  format: "uri",
  maxLength: 2000,
});

const feedEnabledField = s.boolean(
  "Whether Karakeep fetches the feed on its regular schedule. Set to false to keep the subscription without fetching it.",
);

const importTagsDescription = "Whether tags published by the feed are imported onto the bookmarks it creates.";

const feedListSchema = s.looseRequiredObject("All RSS feed subscriptions owned by the connected Karakeep user.", {
  feeds: s.array("The feed subscriptions. Karakeep applies no ordering to them.", feedSchema),
});

const deleteFeedResultSchema = successResultSchema(
  "The result of deleting a feed.",
  "Always true when Karakeep deleted the feed.",
  { feedId: "The id of the deleted feed." },
);

const fetchFeedResultSchema = successResultSchema(
  "The result of enqueueing an immediate feed fetch.",
  "Always true when Karakeep enqueued the fetch.",
  { feedId: "The id of the feed whose fetch was enqueued." },
);

export const karakeepFeedActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_feeds",
    operationType: "read",
    description:
      "Retrieve all RSS feed subscriptions for the authenticated Karakeep user. The response is not paginated and returns every feed at once.",
    requiredScopes: feedReadScopes,
    inputSchema: s.object("The input payload for listing RSS feed subscriptions.", {}),
    outputSchema: feedListSchema,
  }),
  defineProviderAction(service, {
    name: "create_feed",
    operationType: "write",
    description:
      "Create a new RSS feed subscription. Karakeep periodically fetches the feed and imports matching items as bookmarks. Karakeep answers with 400 when the per user feed limit has already been reached.",
    requiredScopes: feedWriteScopes,
    inputSchema: s.object(
      "The RSS feed subscription to create.",
      {
        name: feedNameField,
        url: feedUrlField,
        enabled: feedEnabledField,
        importTags: s.boolean({ description: importTagsDescription, default: false }),
      },
      { optional: ["importTags"] },
    ),
    outputSchema: feedSchema,
  }),
  defineProviderAction(service, {
    name: "get_feed",
    operationType: "read",
    description: "Retrieve a single RSS feed subscription by its id.",
    requiredScopes: feedReadScopes,
    inputSchema: s.requiredObject("The RSS feed subscription to retrieve.", {
      feedId: feedIdField,
    }),
    outputSchema: feedSchema,
  }),
  defineProviderAction(service, {
    name: "update_feed",
    operationType: "destructive",
    description:
      "Update an RSS feed subscription. Only the fields present in the input are changed; every omitted field keeps its current value.",
    requiredScopes: feedWriteScopes,
    inputSchema: s.object(
      "The RSS feed subscription fields to update.",
      {
        feedId: feedIdField,
        name: feedNameField,
        url: feedUrlField,
        enabled: feedEnabledField,
        importTags: s.boolean(importTagsDescription),
      },
      { optional: ["name", "url", "enabled", "importTags"] },
    ),
    outputSchema: feedSchema,
  }),
  defineProviderAction(service, {
    name: "delete_feed",
    operationType: "destructive",
    description: "Delete an RSS feed subscription. Bookmarks that the feed already imported are not affected.",
    requiredScopes: feedWriteScopes,
    inputSchema: s.requiredObject("The RSS feed subscription to delete.", {
      feedId: feedIdField,
    }),
    outputSchema: deleteFeedResultSchema,
  }),
  defineProviderAction(service, {
    name: "fetch_feed_now",
    operationType: "write",
    description:
      "Trigger an immediate fetch of an RSS feed subscription. The fetch is only enqueued and runs asynchronously, so newly imported bookmarks appear later; poll get_feed and watch lastFetchedAt to see when it finished.",
    requiredScopes: feedWriteScopes,
    inputSchema: s.requiredObject("The RSS feed subscription to fetch immediately.", {
      feedId: feedIdField,
    }),
    outputSchema: fetchFeedResultSchema,
  }),
];
