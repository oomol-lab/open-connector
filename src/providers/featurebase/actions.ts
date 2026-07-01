import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "featurebase";

const idSchema = s.string("The Featurebase object ID.", { minLength: 1 });
const cursorSchema = s.string("The opaque pagination cursor returned by Featurebase.", {
  minLength: 1,
});
const limitSchema = s.integer("The maximum number of records to return, from 1 to 100.", {
  minimum: 1,
  maximum: 100,
});
const timestampSchema = s.string("An ISO 8601 timestamp or Unix timestamp accepted by Featurebase.", {
  minLength: 1,
});
const postVisibilitySchema = s.stringEnum("The Featurebase post visibility restriction.", [
  "public",
  "authorOnly",
  "companyOnly",
]);
const contactTypeFilterSchema = s.stringEnum("The Featurebase contact type filter.", ["customer", "lead", "all"]);
const sortBySchema = s.stringEnum("The Featurebase post sorting mode.", ["createdAt", "upvotes", "trending", "recent"]);

const rawObjectSchema = s.looseObject({}, { description: "The raw Featurebase object returned by the API." });
const customFieldsSchema = s.looseObject(
  {},
  {
    description: "Custom field values keyed by Featurebase custom field ID or name.",
  },
);

const authorInputSchema = s.object(
  "The user attribution fields used when creating or updating a Featurebase post.",
  {
    id: s.string("The Featurebase user ID.", { minLength: 1 }),
    userId: s.string("The external SSO user ID.", { minLength: 1 }),
    email: s.email("The user's email address."),
    name: s.string("The user's display name.", { minLength: 1 }),
    profilePicture: s.url("The user's profile picture URL."),
  },
  { optional: ["id", "userId", "email", "name", "profilePicture"] },
);

const companyInputSchema = s.object(
  "A company associated with a Featurebase contact.",
  {
    id: s.string("The external company ID from your system.", { minLength: 1 }),
    name: s.string("The company name.", { minLength: 1 }),
    monthlySpend: s.number("The company's monthly spend or revenue."),
    customFields: customFieldsSchema,
    industry: s.string("The company's industry.", { minLength: 1 }),
    website: s.url("The company's website URL."),
    plan: s.string("The company's current plan or subscription.", { minLength: 1 }),
    companySize: s.integer("The company's employee count.", { minimum: 0 }),
    createdAt: s.dateTime("The ISO 8601 timestamp when the company was created."),
  },
  {
    optional: ["monthlySpend", "customFields", "industry", "website", "plan", "companySize", "createdAt"],
  },
);

const listOutputSchema = s.requiredObject("A cursor-paginated Featurebase list response.", {
  object: s.string("The Featurebase list object type."),
  data: s.array("The Featurebase objects returned for this page.", rawObjectSchema),
  nextCursor: s.nullable(s.string("The cursor for the next page, or null when no page remains.")),
});

const objectOutputSchema = s.requiredObject("A Featurebase object response.", {
  object: rawObjectSchema,
});

const deleteOutputSchema = s.requiredObject("A Featurebase deletion confirmation.", {
  id: idSchema,
  object: s.string("The Featurebase object type that was deleted."),
  deleted: s.boolean("Whether Featurebase deleted the requested object."),
});

export const featurebaseActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_boards",
    description: "List all Featurebase boards for the authenticated organization.",
    inputSchema: s.object("The input payload for listing Featurebase boards.", {}),
    outputSchema: listOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_board",
    description: "Get one Featurebase board by ID.",
    inputSchema: s.requiredObject("The input payload for retrieving a Featurebase board.", {
      id: idSchema,
    }),
    outputSchema: objectOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_posts",
    description: "List Featurebase posts with cursor pagination and optional filters.",
    inputSchema: s.object(
      "The input payload for listing Featurebase posts.",
      {
        limit: limitSchema,
        cursor: cursorSchema,
        boardId: idSchema,
        statusId: idSchema,
        tags: s.array(
          "The tag names used to filter Featurebase posts.",
          s.string("One Featurebase tag name.", { minLength: 1 }),
          { minItems: 1 },
        ),
        q: s.string("The search query used to filter Featurebase posts.", { minLength: 1 }),
        inReview: s.boolean("Whether to include posts pending moderation."),
        sortBy: sortBySchema,
      },
      { optional: ["limit", "cursor", "boardId", "statusId", "tags", "q", "inReview", "sortBy"] },
    ),
    outputSchema: listOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_post",
    description: "Create a Featurebase feedback post in a board.",
    inputSchema: s.object(
      "The input payload for creating a Featurebase post.",
      {
        title: s.string("The Featurebase post title.", { minLength: 2 }),
        boardId: idSchema,
        content: s.string("The Featurebase post content in HTML format.", { minLength: 1 }),
        tags: s.array("The tag names to attach to the post.", s.string("One tag name.", { minLength: 1 }), {
          minItems: 1,
        }),
        statusId: idSchema,
        commentsEnabled: s.boolean("Whether comments are enabled for the post."),
        inReview: s.boolean("Whether the post should be pending moderation."),
        customFields: customFieldsSchema,
        eta: timestampSchema,
        assigneeId: idSchema,
        visibility: postVisibilitySchema,
        author: authorInputSchema,
        createdAt: timestampSchema,
      },
      {
        optional: [
          "content",
          "tags",
          "statusId",
          "commentsEnabled",
          "inReview",
          "customFields",
          "eta",
          "assigneeId",
          "visibility",
          "author",
          "createdAt",
        ],
      },
    ),
    outputSchema: objectOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_post",
    description: "Get one Featurebase post by ID.",
    inputSchema: s.requiredObject("The input payload for retrieving a Featurebase post.", {
      id: idSchema,
    }),
    outputSchema: objectOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_post",
    description: "Update mutable fields on an existing Featurebase post.",
    inputSchema: s.object(
      "The input payload for updating a Featurebase post.",
      {
        id: idSchema,
        title: s.string("The updated Featurebase post title.", { minLength: 2 }),
        content: s.string("The updated Featurebase post content in HTML format.", { minLength: 1 }),
        boardId: idSchema,
        statusId: idSchema,
        tags: s.array("The replacement tag names for the post.", s.string("One tag name.", { minLength: 1 }), {
          minItems: 1,
        }),
        commentsEnabled: s.boolean("Whether comments are enabled for the post."),
        inReview: s.boolean("Whether the post should be pending moderation."),
        customFields: customFieldsSchema,
        eta: s.nullable(timestampSchema),
        createdAt: timestampSchema,
        assigneeId: s.nullable(idSchema),
        visibility: postVisibilitySchema,
        author: authorInputSchema,
        sendStatusUpdateEmail: s.boolean("Whether to email voters when the status changes."),
      },
      {
        optional: [
          "title",
          "content",
          "boardId",
          "statusId",
          "tags",
          "commentsEnabled",
          "inReview",
          "customFields",
          "eta",
          "createdAt",
          "assigneeId",
          "visibility",
          "author",
          "sendStatusUpdateEmail",
        ],
      },
    ),
    outputSchema: objectOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_post",
    description: "Delete one Featurebase post by ID.",
    inputSchema: s.requiredObject("The input payload for deleting a Featurebase post.", {
      id: idSchema,
    }),
    outputSchema: deleteOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_contacts",
    description: "List Featurebase contacts with cursor pagination and contact type filtering.",
    inputSchema: s.object(
      "The input payload for listing Featurebase contacts.",
      {
        limit: limitSchema,
        cursor: cursorSchema,
        contactType: contactTypeFilterSchema,
      },
      { optional: ["limit", "cursor", "contactType"] },
    ),
    outputSchema: listOutputSchema,
  }),
  defineProviderAction(service, {
    name: "upsert_contact",
    description: "Create or update a Featurebase contact by email or external user ID.",
    inputSchema: s.object(
      "The input payload for upserting a Featurebase contact.",
      {
        email: s.email("The contact email address."),
        userId: s.string("The external user ID from your system.", { minLength: 1 }),
        name: s.string("The contact display name.", { minLength: 1 }),
        profilePicture: s.url("The contact profile picture URL."),
        companies: s.array("The companies associated with the contact.", companyInputSchema, { minItems: 1 }),
        customFields: customFieldsSchema,
        subscribedToChangelog: s.boolean("Whether the contact is subscribed to changelog updates."),
        locale: s.string("The contact locale or language code.", { minLength: 1 }),
        phone: s.string("The contact phone number.", { minLength: 1 }),
        roles: s.array("The role IDs to assign to the contact.", idSchema, { minItems: 1 }),
        userHash: s.string("The HMAC hash used for Featurebase identity verification.", {
          minLength: 1,
        }),
        createdAt: s.dateTime("The ISO 8601 timestamp when the contact was created."),
      },
      {
        optional: [
          "email",
          "userId",
          "name",
          "profilePicture",
          "companies",
          "customFields",
          "subscribedToChangelog",
          "locale",
          "phone",
          "roles",
          "userHash",
          "createdAt",
        ],
      },
    ),
    outputSchema: objectOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_contact",
    description: "Get one Featurebase contact by ID.",
    inputSchema: s.requiredObject("The input payload for retrieving a Featurebase contact.", {
      id: idSchema,
    }),
    outputSchema: objectOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_contact",
    description: "Delete one Featurebase contact by ID.",
    inputSchema: s.requiredObject("The input payload for deleting a Featurebase contact.", {
      id: idSchema,
    }),
    outputSchema: deleteOutputSchema,
  }),
];

export type FeaturebaseActionName =
  | "list_boards"
  | "get_board"
  | "list_posts"
  | "create_post"
  | "get_post"
  | "update_post"
  | "delete_post"
  | "list_contacts"
  | "upsert_contact"
  | "get_contact"
  | "delete_contact";
