import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "instabot" as const;

const userIdSchema = s.integer("The Instabot user object ID.", { minimum: 1 });
const photoFileSchema = s.requiredObject("A reference to an existing Instabot File Object.", {
  objectId: s.integer("The Instabot File Object ID used as the user's photo.", { minimum: 1 }),
});
const customPropertiesSchema = s.looseObject("Custom Instabot user properties keyed by property name.");
const userSchema = s.looseObject("An Instabot user resource.");
const statusSchema = s.requiredObject("The status envelope returned by Instabot.", {
  apiStatusCode: s.string("The Instabot API status code."),
  apiStatusMessage: s.nullable(s.string("The Instabot API status message when the service supplies one.")),
});
const singleUserOutputSchema = s.requiredObject("The response returned for one Instabot user.", {
  status: statusSchema,
  user: userSchema,
});
const mutationStatusOutputSchema = s.requiredObject("The response returned by an Instabot user mutation.", {
  status: statusSchema,
});
const resolveSchema = s.array(
  "Related user resources to resolve in the response.",
  s.stringEnum("One supported Instabot user relationship.", ["organizations", "userSegments", "conversations"]),
  { minItems: 1 },
);
const listOptions = {
  limit: s.integer("The maximum number of users to return.", { minimum: 1 }),
  skip: s.integer("The number of users to skip from the start of the result set.", { minimum: 0 }),
  orderBy: s.nonEmptyString("The Instabot sort expression, such as name desc,email asc."),
  resolve: resolveSchema,
  getTotalCount: s.boolean("Whether Instabot should include totalCount in the response."),
};
const listOutputSchema = s.requiredObject("A page of Instabot users.", {
  status: statusSchema,
  users: s.array("The users returned by Instabot.", userSchema),
  hasMoreRecords: s.nullable(s.boolean("Whether more users remain after this response when supplied by Instabot.")),
  totalCount: s.nullable(s.integer("The total matching user count when requested and supplied by Instabot.")),
});

export const instabotActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_user",
    operationType: "write",
    description: "Create a registered user in Instabot.",
    inputSchema: s.object(
      "The Instabot user fields used for creation.",
      {
        userName: s.nonEmptyString("The unique user name."),
        userPassword: s.nonEmptyString("The initial user password."),
        name: s.string("The user's display name."),
        description: s.string("The user description."),
        email: s.email("The user's email address."),
        phone: s.string("The user's phone number."),
        photoFile: photoFileSchema,
        customProperties: customPropertiesSchema,
      },
      { optional: ["name", "description", "email", "phone", "photoFile", "customProperties"] },
    ),
    outputSchema: s.requiredObject("The result returned after Instabot creates a user.", {
      status: statusSchema,
      userId: userIdSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_user",
    operationType: "read",
    description: "Get one Instabot user by object ID.",
    inputSchema: s.object(
      "The input for retrieving one Instabot user.",
      {
        userId: userIdSchema,
        resolve: resolveSchema,
      },
      { optional: ["resolve"] },
    ),
    outputSchema: singleUserOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_users",
    operationType: "read",
    description: "List Instabot users with pagination, sorting, and optional related resources.",
    inputSchema: s.object("The input for listing Instabot users.", listOptions, {
      optional: ["limit", "skip", "orderBy", "resolve", "getTotalCount"],
    }),
    outputSchema: listOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_updated_users",
    operationType: "read",
    description: "List Instabot users changed since an ISO-8601 timestamp.",
    inputSchema: s.object(
      "The input for listing recently updated Instabot users.",
      {
        since: s.dateTime("The ISO-8601 timestamp after which users must have changed."),
        ...listOptions,
      },
      { optional: ["limit", "skip", "orderBy", "resolve", "getTotalCount"] },
    ),
    outputSchema: listOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_user",
    operationType: "write",
    description: "Update writable fields on an Instabot user.",
    inputSchema: s.object(
      "The Instabot user fields to update.",
      {
        userId: userIdSchema,
        username: s.nonEmptyString("The unique user name."),
        name: s.string("The user's display name."),
        description: s.string("The user description."),
        email: s.nullable(s.email("The user's email address.")),
        phone: s.nullable(s.string("The user's phone number.")),
        photoFile: s.nullable(photoFileSchema),
        customProperties: customPropertiesSchema,
      },
      {
        optional: ["username", "name", "description", "email", "phone", "photoFile", "customProperties"],
      },
    ),
    outputSchema: mutationStatusOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_user",
    operationType: "destructive",
    description: "Soft-delete an Instabot user.",
    inputSchema: s.requiredObject("The input for deleting an Instabot user.", {
      userId: userIdSchema,
    }),
    outputSchema: mutationStatusOutputSchema,
  }),
  defineProviderAction(service, {
    name: "restore_user",
    operationType: "write",
    description: "Restore a previously deleted Instabot user.",
    inputSchema: s.requiredObject("The input for restoring an Instabot user.", {
      userId: userIdSchema,
    }),
    outputSchema: mutationStatusOutputSchema,
  }),
];

export type InstabotActionName =
  | "create_user"
  | "get_user"
  | "list_users"
  | "list_updated_users"
  | "update_user"
  | "delete_user"
  | "restore_user";
