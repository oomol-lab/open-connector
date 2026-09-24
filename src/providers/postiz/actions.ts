import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const integration = s.looseObject("A connected Postiz social channel.", {
  id: s.string("Postiz integration ID."),
  name: s.string("Channel display name."),
  identifier: s.string("Social platform identifier."),
});
const media = s.looseObject("Uploaded Postiz media reference.", {
  id: s.string("Uploaded media ID."),
  path: s.string("Hosted media URL."),
});
const postContent = s.object(
  "One content item for a social post.",
  {
    content: s.string("Text content to publish."),
    image: s.array("Previously uploaded media references.", media),
  },
  { optional: ["image"] },
);
const postItem = s.object(
  "Content and settings for one connected channel.",
  {
    integration: s.requiredObject("Destination channel.", {
      id: s.nonEmptyString("Postiz integration ID."),
    }),
    value: s.array("Content items for this channel.", postContent, { minItems: 1 }),
    settings: s.looseObject("Platform-specific settings, including the required __type platform identifier.", {
      __type: s.nonEmptyString("Postiz platform identifier matching the destination channel."),
    }),
    group: s.string("Group ID for related posts."),
  },
  { optional: ["settings", "group"] },
);

export const postizActions: ActionDefinition[] = [
  defineProviderAction("postiz", {
    name: "list_integrations",
    operationType: "read",
    requiredScopes: [],
    description: "List connected Postiz social channels, optionally filtered by customer group.",
    inputSchema: s.object(
      "Filter for connected channels.",
      { group: s.nonEmptyString("Customer group ID.") },
      { optional: ["group"] },
    ),
    outputSchema: s.array("Connected Postiz social channels.", integration),
  }),
  defineProviderAction("postiz", {
    name: "list_posts",
    operationType: "read",
    requiredScopes: [],
    description: "List Postiz posts in a UTC date range.",
    inputSchema: s.object(
      "Date range for finding posts.",
      {
        startDate: s.dateTime("Inclusive start time in UTC ISO format."),
        endDate: s.dateTime("End time in UTC ISO format."),
        customer: s.nonEmptyString("Optional customer ID filter."),
      },
      { optional: ["customer"] },
    ),
    outputSchema: s.looseObject("Postiz posts response.", {
      posts: s.array("Posts in the selected date range.", s.looseObject("Postiz post record.")),
    }),
  }),
  defineProviderAction("postiz", {
    name: "upload_from_url",
    operationType: "write",
    requiredScopes: [],
    description: "Ask Postiz to import a publicly reachable media file from a URL.",
    inputSchema: s.requiredObject("Media URL to import.", {
      url: s.string("Public HTTPS media URL reachable by Postiz without authentication.", {
        format: "uri",
        pattern: "^https://",
      }),
    }),
    outputSchema: s.looseObject("Uploaded media record returned by Postiz.", {
      id: s.string("Uploaded media ID."),
      path: s.string("Hosted media URL to include in a post."),
    }),
  }),
  defineProviderAction("postiz", {
    name: "create_post",
    operationType: "write",
    requiredScopes: [],
    description: "Create a draft, publish immediately, or schedule content on connected Postiz channels.",
    inputSchema: s.object(
      "Postiz create-post payload.",
      {
        type: s.stringEnum("Publication mode.", ["draft", "now", "schedule"]),
        date: s.dateTime("Publish date in UTC ISO format; ignored for immediate publishing."),
        shortLink: s.boolean("Whether Postiz should shorten links."),
        tags: s.array(
          "Post tags.",
          s.requiredObject("A Postiz tag.", {
            value: s.string("Tag value."),
            label: s.string("Tag label."),
          }),
        ),
        posts: s.array("Destination channel posts.", postItem, { minItems: 1 }),
        order: s.string("Post ordering strategy accepted by Postiz."),
        inter: s.number("Interval between posts."),
      },
      { optional: ["posts", "order", "inter"] },
    ),
    outputSchema: s.array(
      "Created posts returned by Postiz.",
      s.looseObject("Created post reference.", {
        postId: s.string("Created Postiz post ID."),
        integration: s.string("Destination integration ID."),
      }),
    ),
  }),
];
