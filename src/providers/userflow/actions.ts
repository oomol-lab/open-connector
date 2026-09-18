import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "userflow";

const rawObjectSchema = s.looseObject("A raw object returned by Userflow.");
const attributesSchema = s.record(
  "Userflow custom attributes keyed by attribute name.",
  s.unknown("One Userflow custom attribute value."),
);
const userflowObjectSchema = s.looseObject("A Userflow API object.", {
  id: s.string("The Userflow object ID."),
  object: s.string("The Userflow object type."),
  created_at: s.nullableString("Timestamp when the object was created."),
  updated_at: s.nullableString("Timestamp when the object was last updated."),
});
const userSchema = s.looseObject("A Userflow user object.", {
  id: s.string("The Userflow user ID."),
  object: s.string("The Userflow object type."),
  name: s.nullableString("The user's display name."),
  email: s.nullableString("The user's email address."),
  attributes: attributesSchema,
  signed_up_at: s.nullableString("Timestamp when the user signed up."),
});
const groupSchema = s.looseObject("A Userflow group object.", {
  id: s.string("The Userflow group ID."),
  object: s.string("The Userflow object type."),
  name: s.nullableString("The group's display name."),
  attributes: attributesSchema,
});
const expandSchema = s.stringArray("Expandable Userflow fields to include in the response.", {
  itemDescription: "One expandable Userflow field name.",
});

export const userflowActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_users",
    operationType: "read",
    description: "List Userflow users with optional cursor pagination and filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "Optional filters for listing Userflow users.",
      {
        limit: s.integer("Maximum number of items to return.", { minimum: 1, maximum: 100 }),
        starting_after: s.nonEmptyString("Object ID after which the page should start."),
        ending_before: s.nonEmptyString("Object ID before which the page should end."),
        email: s.string("Filter users by email address."),
        user_id: s.nonEmptyString("Filter users by external user ID."),
        expand: expandSchema,
        order_by: s.nonEmptyString("Sort order accepted by Userflow."),
      },
      { optional: ["limit", "starting_after", "ending_before", "email", "user_id", "expand", "order_by"] },
    ),
    outputSchema: s.looseRequiredObject("A paginated Userflow user list.", {
      object: s.string("The Userflow list object type."),
      data: s.array("Users returned by Userflow.", userSchema),
      has_more: s.boolean("Whether another page is available."),
      url: s.string("The API path represented by the list."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_user",
    operationType: "read",
    description: "Fetch one Userflow user by ID.",
    requiredScopes: [],
    inputSchema: s.object(
      "Path and query parameters for reading one Userflow user.",
      { user_id: s.nonEmptyString("The Userflow user ID to retrieve."), expand: expandSchema },
      { optional: ["expand"] },
    ),
    outputSchema: s.object("The Userflow user lookup result.", { user: userSchema }),
  }),
  defineProviderAction(service, {
    name: "upsert_user",
    operationType: "write",
    description: "Create or update one Userflow user.",
    requiredScopes: [],
    inputSchema: s.object(
      "Payload for creating or updating one Userflow user.",
      {
        user_id: s.nonEmptyString("The external user ID to create or update in Userflow."),
        name: s.string("The user's display name."),
        email: s.email("The user's email address."),
        signed_up_at: s.dateTime("Timestamp when the user signed up."),
        attributes: attributesSchema,
        groups: s.stringArray("Group IDs the user belongs to.", { itemDescription: "One group ID." }),
      },
      { optional: ["name", "email", "signed_up_at", "attributes", "groups"] },
    ),
    outputSchema: s.object("The created or updated Userflow user.", { user: userSchema }),
  }),
  defineProviderAction(service, {
    name: "delete_user",
    operationType: "destructive",
    description: "Delete one Userflow user by ID.",
    requiredScopes: [],
    inputSchema: s.object("Path parameters for deleting one Userflow user.", {
      user_id: s.nonEmptyString("The Userflow user ID to delete."),
    }),
    outputSchema: s.object("The Userflow user deletion acknowledgement.", {
      deleted: s.boolean("Whether the Userflow user was deleted."),
      user_id: s.string("The deleted Userflow user ID."),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "upsert_group",
    operationType: "write",
    description: "Create or update one Userflow group.",
    requiredScopes: [],
    inputSchema: s.object(
      "Payload for creating or updating one Userflow group.",
      {
        group_id: s.nonEmptyString("The external group ID to create or update in Userflow."),
        name: s.string("The group's display name."),
        attributes: attributesSchema,
      },
      { optional: ["name", "attributes"] },
    ),
    outputSchema: s.object("The created or updated Userflow group.", { group: groupSchema }),
  }),
  defineProviderAction(service, {
    name: "get_group",
    operationType: "read",
    description: "Fetch one Userflow group by ID.",
    requiredScopes: [],
    inputSchema: s.object(
      "Path and query parameters for reading one Userflow group.",
      { group_id: s.nonEmptyString("The Userflow group ID to retrieve."), expand: expandSchema },
      { optional: ["expand"] },
    ),
    outputSchema: s.object("The Userflow group lookup result.", { group: groupSchema }),
  }),
  defineProviderAction(service, {
    name: "delete_group",
    operationType: "destructive",
    description: "Delete one Userflow group by ID.",
    requiredScopes: [],
    inputSchema: s.object("Path parameters for deleting one Userflow group.", {
      group_id: s.nonEmptyString("The Userflow group ID to delete."),
    }),
    outputSchema: s.object("The Userflow group deletion acknowledgement.", {
      deleted: s.boolean("Whether the Userflow group was deleted."),
      group_id: s.string("The deleted Userflow group ID."),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "track_event",
    operationType: "write",
    description: "Track one Userflow event for a user.",
    requiredScopes: [],
    inputSchema: s.object(
      "Payload for tracking a Userflow event.",
      {
        name: s.nonEmptyString("The event name to track."),
        user_id: s.nonEmptyString("The Userflow user ID associated with the event."),
        group_id: s.nonEmptyString("The Userflow group ID associated with the event."),
        occurred_at: s.dateTime("Timestamp when the event occurred."),
        attributes: attributesSchema,
      },
      { optional: ["group_id", "occurred_at", "attributes"] },
    ),
    outputSchema: s.object("The Userflow event tracking result.", { event: userflowObjectSchema }),
  }),
];
