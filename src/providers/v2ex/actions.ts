import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "v2ex";

const pageInputSchema = s.positiveInteger("Optional page number to request. Defaults to 1.");
const idInputSchema = s.positiveInteger("The V2EX numeric identifier.");
const nodeNameInputSchema = s.nonEmptyString("The V2EX node name, such as `python`.");

const v2exMemberSchema = s.looseObject("A compact V2EX member object.", {
  id: s.integer("The V2EX member identifier."),
  username: s.string("The V2EX username."),
  bio: s.string("The member biography text."),
  website: s.string("The member website URL or empty string."),
  github: s.string("The member GitHub username or profile value."),
  url: s.url("The V2EX URL for the member profile."),
  avatar: s.url("The member avatar URL."),
  created: s.integer("The Unix timestamp when the member account was created."),
  pro: s.integer("Whether the member has V2EX Pro status as returned by V2EX."),
});

const v2exProfileSchema = s.looseObject("The authenticated V2EX member profile.", {
  id: s.integer("The V2EX member identifier."),
  username: s.string("The V2EX username."),
  url: s.url("The V2EX URL for the member profile."),
  website: s.string("The member website URL or empty string."),
  twitter: s.string("The member Twitter handle or empty string."),
  psn: s.string("The member PlayStation Network handle or empty string."),
  github: s.string("The member GitHub username or profile value."),
  btc: s.string("The member Bitcoin address or empty string."),
  location: s.string("The member location or empty string."),
  tagline: s.string("The member tagline or empty string."),
  bio: s.string("The member biography text."),
  avatar_mini: s.url("The mini avatar URL."),
  avatar_normal: s.url("The normal avatar URL."),
  avatar_large: s.url("The large avatar URL."),
  created: s.integer("The Unix timestamp when the member account was created."),
  last_modified: s.integer("The Unix timestamp when the profile was last modified."),
  pro: s.integer("Whether the member has V2EX Pro status as returned by V2EX."),
});

const v2exTokenMetadataSchema = s.looseObject("Metadata for a V2EX Personal Access Token.", {
  token: s.string("The token value as returned by V2EX. It may be masked after creation."),
  scope: s.stringEnum("The token scope.", ["everything", "regular"]),
  expiration: s.integer("The token lifetime in seconds."),
  good_for_days: s.integer("The remaining token lifetime in days."),
  total_used: s.integer("The total number of times the token has been used."),
  last_used: s.integer("The Unix timestamp when the token was last used."),
  created: s.integer("The Unix timestamp when the token was created."),
});

const v2exNodeSchema = s.looseObject("A V2EX node object.", {
  id: s.integer("The V2EX node identifier."),
  founder_id: s.integer("The member identifier of the node founder."),
  url: s.url("The V2EX URL for the node."),
  name: s.string("The V2EX node name."),
  title: s.string("The human-readable node title."),
  header: s.string("The node header text."),
  footer: s.string("The node footer text."),
  avatar: s.url("The node avatar URL."),
  topics: s.integer("The number of topics in the node."),
  created: s.integer("The Unix timestamp when the node was created."),
  last_modified: s.integer("The Unix timestamp when the node was last modified."),
});

const v2exTopicSchema = s.looseObject("A V2EX topic object.", {
  id: s.integer("The V2EX topic identifier."),
  title: s.string("The topic title."),
  content: s.string("The raw topic content."),
  content_rendered: s.string("The rendered topic content."),
  syntax: s.integer("The content syntax mode returned by V2EX."),
  url: s.url("The V2EX URL for the topic."),
  replies: s.integer("The number of replies on the topic."),
  stars: s.integer("The number of stars on the topic."),
  thanks: s.integer("The number of thanks on the topic."),
  last_reply_by: s.string("The username of the latest reply author, or empty string."),
  created: s.integer("The Unix timestamp when the topic was created."),
  last_modified: s.integer("The Unix timestamp when the topic was last modified."),
  last_touched: s.integer("The Unix timestamp when the topic was last touched."),
  member: v2exMemberSchema,
  node: v2exNodeSchema,
  supplements: s.array("Supplement objects attached to the topic.", s.unknown("One supplement.")),
});

const v2exTopicReplySchema = s.looseObject("A V2EX topic reply object.", {
  id: s.integer("The V2EX reply identifier."),
  content: s.string("The raw reply content."),
  content_rendered: s.string("The rendered reply content."),
  created: s.integer("The Unix timestamp when the reply was created."),
  member: v2exMemberSchema,
});

const v2exNotificationSchema = s.looseObject("A V2EX notification object.", {
  id: s.integer("The V2EX notification identifier."),
  member_id: s.integer("The member identifier that triggered the notification."),
  for_member_id: s.integer("The member identifier that received the notification."),
  text: s.string("The notification text."),
  payload: s.nullable(s.string("The notification payload string.")),
  payload_rendered: s.string("The rendered notification payload."),
  created: s.integer("The Unix timestamp when the notification was created."),
  member: s.looseObject("The member object associated with the notification."),
});

const v2exLegacyMemberSchema = s.looseObject("A member object returned by the V2EX legacy public API.", {
  id: s.integer("The V2EX member identifier."),
  username: s.string("The V2EX username."),
  url: s.url("The V2EX URL for the member profile."),
  website: s.nullableString("The member website URL, empty string, or null."),
  twitter: s.nullableString("The member Twitter handle, empty string, or null."),
  psn: s.nullableString("The member PlayStation Network handle, empty string, or null."),
  github: s.nullableString("The member GitHub username, profile value, empty string, or null."),
  btc: s.nullableString("The member Bitcoin address, empty string, or null."),
  location: s.nullableString("The member location, empty string, or null."),
  tagline: s.nullableString("The member tagline, empty string, or null."),
  bio: s.nullableString("The member biography text, empty string, or null."),
  avatar_mini: s.url("The mini avatar URL."),
  avatar_normal: s.url("The normal avatar URL."),
  avatar_large: s.url("The large avatar URL."),
  avatar_xlarge: s.url("The extra-large avatar URL."),
  avatar_xxlarge: s.url("The double extra-large avatar URL."),
  avatar_xxxlarge: s.url("The triple extra-large avatar URL."),
  created: s.integer("The Unix timestamp when the member account was created."),
  last_modified: s.integer("The Unix timestamp when the member profile was last modified."),
  pro: s.integer("Whether the member has V2EX Pro status as returned by V2EX."),
});

const v2exLegacyNodeSchema = s.looseObject("A node object returned by the V2EX legacy public API.", {
  id: s.integer("The V2EX node identifier."),
  name: s.string("The V2EX node name."),
  url: s.url("The V2EX URL for the node."),
  title: s.string("The human-readable node title."),
  title_alternative: s.string("The alternative node title."),
  header: s.string("The node header text."),
  footer: s.string("The node footer text."),
  topics: s.integer("The number of topics in the node."),
  avatar_mini: s.url("The mini node avatar URL."),
  avatar_normal: s.url("The normal node avatar URL."),
  avatar_large: s.url("The large node avatar URL."),
  stars: s.integer("The number of stars on the node."),
  founder_id: s.integer("The member identifier of the node founder."),
  aliases: s.array("Alternative names for the node.", s.string("One node alias.")),
  root: s.boolean("Whether this node is a root node."),
  parent_node_name: s.nullableString("The parent node name, empty string, or null."),
});

const v2exLegacyTopicSchema = s.looseObject("A topic object returned by the V2EX legacy public API.", {
  id: s.integer("The V2EX topic identifier."),
  title: s.string("The topic title."),
  content: s.string("The raw topic content."),
  content_rendered: s.string("The rendered topic content."),
  url: s.url("The V2EX URL for the topic."),
  replies: s.integer("The number of replies on the topic."),
  deleted: s.integer("Whether the topic has been deleted as returned by V2EX."),
  last_reply_by: s.string("The username of the latest reply author, or empty string."),
  created: s.integer("The Unix timestamp when the topic was created."),
  last_modified: s.integer("The Unix timestamp when the topic was last modified."),
  last_touched: s.integer("The Unix timestamp when the topic was last touched."),
  member: v2exLegacyMemberSchema,
  node: v2exLegacyNodeSchema,
});

const legacyTopicListOutputSchema = s.actionOutput(
  {
    topics: s.array("The public topics returned by the V2EX legacy endpoint.", v2exLegacyTopicSchema),
  },
  "The V2EX legacy public topic list response.",
);

const emptyOutputSchema = s.actionOutput(
  {
    success: s.boolean("Whether the V2EX request was accepted."),
  },
  "The empty response returned after V2EX accepts the request.",
);

export const v2exActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_notifications",
    description: "Fetch the latest V2EX notifications for the authenticated member.",
    inputSchema: s.actionInput({ p: pageInputSchema }, [], "Input parameters for fetching V2EX notifications."),
    outputSchema: s.actionOutput(
      {
        notifications: s.array("The notifications returned for this page.", v2exNotificationSchema),
        total: s.integer("The total notification count parsed from the V2EX pagination message."),
      },
      "The V2EX notifications response.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_notification",
    description: "Delete one V2EX notification by its numeric identifier.",
    inputSchema: s.actionInput(
      { notification_id: idInputSchema },
      ["notification_id"],
      "Input parameters for deleting a V2EX notification.",
    ),
    outputSchema: emptyOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_hot_topics",
    description: "Fetch public hot topics from the V2EX legacy JSON API.",
    inputSchema: s.actionInput({}, [], "Input parameters for fetching V2EX legacy hot topics."),
    outputSchema: legacyTopicListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_latest_topics",
    description: "Fetch public latest topics from the V2EX legacy JSON API.",
    inputSchema: s.actionInput({}, [], "Input parameters for fetching V2EX legacy latest topics."),
    outputSchema: legacyTopicListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_current_member",
    description: "Fetch the authenticated V2EX member profile.",
    inputSchema: s.actionInput({}, [], "Input parameters for fetching the authenticated V2EX member."),
    outputSchema: s.actionOutput({ member: v2exProfileSchema }, "The V2EX member profile response."),
  }),
  defineProviderAction(service, {
    name: "get_current_token",
    description: "Fetch metadata for the V2EX Personal Access Token used by this connection.",
    inputSchema: s.actionInput({}, [], "Input parameters for fetching current V2EX token metadata."),
    outputSchema: s.actionOutput({ token: v2exTokenMetadataSchema }, "The V2EX token metadata response."),
  }),
  defineProviderAction(service, {
    name: "create_token",
    description: "Create a new V2EX Personal Access Token from an existing token.",
    inputSchema: s.actionInput(
      {
        scope: s.stringEnum("The access scope for the new V2EX token.", ["everything", "regular"]),
        expiration: s.anyOf("The token lifetime in seconds.", [
          s.literal(2_592_000, { description: "A 30-day token lifetime in seconds." }),
          s.literal(5_184_000, { description: "A 60-day token lifetime in seconds." }),
          s.literal(7_776_000, { description: "A 90-day token lifetime in seconds." }),
          s.literal(15_552_000, { description: "A 180-day token lifetime in seconds." }),
        ]),
      },
      ["scope", "expiration"],
      "Input parameters for creating a V2EX Personal Access Token.",
    ),
    outputSchema: s.actionOutput(
      { token: s.string("The newly created Personal Access Token value.") },
      "The V2EX token creation response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_node",
    description: "Fetch a V2EX node by node name.",
    inputSchema: s.actionInput(
      { node_name: nodeNameInputSchema },
      ["node_name"],
      "Input parameters for fetching a V2EX node.",
    ),
    outputSchema: s.actionOutput({ node: v2exNodeSchema }, "The V2EX node response."),
  }),
  defineProviderAction(service, {
    name: "list_node_topics",
    description: "Fetch topics from a V2EX node.",
    inputSchema: s.actionInput(
      { node_name: nodeNameInputSchema, p: pageInputSchema },
      ["node_name"],
      "Input parameters for fetching topics from a V2EX node.",
    ),
    outputSchema: s.actionOutput(
      { topics: s.array("The topics returned for this node page.", v2exTopicSchema) },
      "The V2EX node topics response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_topic",
    description: "Fetch a V2EX topic by numeric identifier.",
    inputSchema: s.actionInput(
      { topic_id: idInputSchema },
      ["topic_id"],
      "Input parameters for fetching a V2EX topic.",
    ),
    outputSchema: s.actionOutput({ topic: v2exTopicSchema }, "The V2EX topic response."),
  }),
  defineProviderAction(service, {
    name: "list_topic_replies",
    description: "Fetch replies for a V2EX topic.",
    inputSchema: s.actionInput(
      { topic_id: idInputSchema, p: pageInputSchema },
      ["topic_id"],
      "Input parameters for fetching replies for a V2EX topic.",
    ),
    outputSchema: s.actionOutput(
      { replies: s.array("The replies returned for this topic page.", v2exTopicReplySchema) },
      "The V2EX topic replies response.",
    ),
  }),
  defineProviderAction(service, {
    name: "set_topic_sticky",
    description: "Set one of the authenticated member's V2EX topics as sticky.",
    inputSchema: s.actionInput(
      {
        topic_id: idInputSchema,
        duration: s.stringEnum("Optional sticky duration. Defaults to 15min.", ["15min", "1hr", "8hr"]),
      },
      ["topic_id"],
      "Input parameters for setting a V2EX topic as sticky.",
    ),
    outputSchema: emptyOutputSchema,
  }),
  defineProviderAction(service, {
    name: "boost_topic",
    description: "Boost one of the authenticated member's V2EX topics to the homepage.",
    inputSchema: s.actionInput(
      { topic_id: idInputSchema },
      ["topic_id"],
      "Input parameters for boosting a V2EX topic.",
    ),
    outputSchema: emptyOutputSchema,
  }),
];
