import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "mx";

const userIdentifierSchema = s.nonEmptyString("The MX-defined user guid or partner-defined user id.");

const userPatchSchema = s.object(
  "The user fields accepted by MX user create and update requests.",
  {
    id: s.nonEmptyString("The unique partner-defined identifier for the user."),
    email: s.email("The email address associated with the user."),
    isDisabled: s.boolean("Whether the user is disabled in MX."),
    metadata: s.string("Additional non-sensitive metadata to store on the MX user."),
  },
  { optional: ["id", "email", "isDisabled", "metadata"] },
);

const mxUserSchema = s.requiredObject("A normalized MX Platform API user.", {
  guid: s.nullable(s.string("The unique identifier for the user, defined by MX.")),
  id: s.nullable(s.string("The unique partner-defined identifier for the user.")),
  email: s.nullable(s.string("The email address associated with the user.")),
  isDisabled: s.nullable(s.boolean("Whether the user is disabled in MX.")),
  metadata: s.nullable(s.string("Additional information stored on the MX user.")),
  raw: s.looseObject("The raw MX user object returned by the Platform API."),
});

const paginationSchema = s.requiredObject("Pagination metadata returned by MX list endpoints.", {
  currentPage: s.nullable(s.integer("The page delivered by the current response.")),
  perPage: s.nullable(s.integer("The number of records delivered with each page.")),
  totalEntries: s.nullable(s.integer("The total number of records available.")),
  totalPages: s.nullable(s.integer("The total number of pages available.")),
  raw: s.nullable(s.looseObject("The raw pagination object returned by MX.")),
});

const listUsersInputSchema = s.object(
  "Input parameters for listing MX users.",
  {
    page: s.integer("The 1-based page number to request.", { minimum: 1 }),
    recordsPerPage: s.integer("The number of users to request per page.", {
      minimum: 10,
      maximum: 1000,
    }),
    id: s.string("Filter users by partner-defined user id."),
    email: s.email("Filter users by email address."),
    isDisabled: s.boolean("Filter users by disabled status."),
  },
  { optional: ["page", "recordsPerPage", "id", "email", "isDisabled"] },
);

const readUserInputSchema = s.requiredObject("Input parameters for reading one MX user.", {
  userIdentifier: userIdentifierSchema,
});

const createUserInputSchema = s.requiredObject("Input parameters for creating an MX user.", {
  user: userPatchSchema,
});

const updateUserInputSchema = s.requiredObject("Input parameters for updating an MX user.", {
  userIdentifier: userIdentifierSchema,
  user: userPatchSchema,
});

const userOutputSchema = s.requiredObject("The normalized MX user result.", {
  user: mxUserSchema,
});

export const mxActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_users",
    operationType: "read",
    description: "List users created in the MX Platform API with pagination and simple filters.",
    requiredScopes: [],
    inputSchema: listUsersInputSchema,
    outputSchema: s.requiredObject("The normalized MX list-users result.", {
      users: s.array("The users returned by MX.", mxUserSchema),
      pagination: paginationSchema,
      raw: s.looseObject("The raw MX list-users response."),
    }),
  }),
  defineProviderAction(service, {
    name: "create_user",
    operationType: "write",
    description: "Create an MX Platform API user and return the newly-created user.",
    requiredScopes: [],
    inputSchema: createUserInputSchema,
    outputSchema: userOutputSchema,
  }),
  defineProviderAction(service, {
    name: "read_user",
    operationType: "read",
    description: "Read one MX Platform API user by MX guid or partner-defined id.",
    requiredScopes: [],
    inputSchema: readUserInputSchema,
    outputSchema: userOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_user",
    operationType: "write",
    description: "Update an MX Platform API user by MX guid or partner-defined id.",
    requiredScopes: [],
    inputSchema: updateUserInputSchema,
    outputSchema: userOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_user",
    operationType: "destructive",
    description: "Permanently delete one MX Platform API user by MX guid or partner-defined id.",
    requiredScopes: [],
    inputSchema: readUserInputSchema,
    outputSchema: s.requiredObject("The normalized MX delete-user result.", {
      deleted: s.boolean("Whether MX accepted the user deletion request."),
      status: s.integer("The HTTP status returned by MX for the delete request."),
    }),
  }),
];
