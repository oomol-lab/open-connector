import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "knowbe4";

const nullableStringSchema = (description: string) => s.nullable(s.string(description));
const rawObjectSchema = s.looseObject("Raw KnowBe4 API object.");

const statusInputSchema = s.stringEnum("Optional KnowBe4 record status filter.", ["active", "archived"]);

const paginationInputFields = {
  perPage: s.integer("Maximum number of records to request from KnowBe4.", {
    minimum: 1,
    maximum: 500,
  }),
  cursor: s.nonEmptyString("KnowBe4 cursor value returned by a previous request."),
};

const paginationOutputSchema = s.object("KnowBe4 request pagination metadata.", {
  requestCursor: s.nullableString("Cursor value sent to KnowBe4."),
  requestPerPage: s.nullable(
    s.integer("Maximum number of records requested from KnowBe4.", {
      minimum: 1,
      maximum: 500,
    }),
  ),
  nextCursor: s.nullableString("Next cursor detected in KnowBe4 response headers."),
  requestId: s.nullableString("KnowBe4 X-Request-Id response header."),
});

const accountSchema = s.looseRequiredObject("Normalized KnowBe4 account data.", {
  name: nullableStringSchema("KnowBe4 organization name."),
  domains: s.array("Allowed domains on the KnowBe4 account.", s.nonEmptyString("Account domain.")),
  subscriptionLevel: nullableStringSchema("KnowBe4 subscription level."),
  subscriptionEndDate: s.nullable(s.date("KnowBe4 subscription end date.")),
  numberOfSeats: s.nullable(s.integer("Number of seats available on the account.")),
  currentRiskScore: s.nullable(s.number("Current account risk score.")),
  raw: rawObjectSchema,
});

const userSchema = s.looseRequiredObject("Normalized KnowBe4 user data.", {
  id: s.nullable(s.integer("KnowBe4 user ID.")),
  email: nullableStringSchema("KnowBe4 user email address."),
  firstName: nullableStringSchema("KnowBe4 user first name."),
  lastName: nullableStringSchema("KnowBe4 user last name."),
  jobTitle: nullableStringSchema("KnowBe4 user job title."),
  status: nullableStringSchema("KnowBe4 user status."),
  groups: s.array("KnowBe4 group IDs assigned to the user.", s.integer("KnowBe4 group ID.")),
  currentRiskScore: s.nullable(s.number("Current user risk score.")),
  raw: rawObjectSchema,
});

const groupSchema = s.looseRequiredObject("Normalized KnowBe4 group data.", {
  id: s.nullable(s.integer("KnowBe4 group ID.")),
  name: nullableStringSchema("KnowBe4 group name."),
  groupType: nullableStringSchema("KnowBe4 group type."),
  memberCount: s.nullable(s.integer("Number of users in the group.")),
  status: nullableStringSchema("KnowBe4 group status."),
  currentRiskScore: s.nullable(s.number("Current group risk score.")),
  raw: rawObjectSchema,
});

const getAccountOutputSchema = s.object("KnowBe4 account response.", {
  account: accountSchema,
  raw: rawObjectSchema,
});

const listUsersInputSchema = s.object(
  "Input parameters for listing KnowBe4 users.",
  {
    status: statusInputSchema,
    groupId: s.integer("Only return users who are members of this KnowBe4 group ID.", {
      minimum: 1,
    }),
    expandGroups: s.boolean("Whether to ask KnowBe4 to expand group details on each user."),
    ...paginationInputFields,
  },
  { optional: ["status", "groupId", "expandGroups", "perPage", "cursor"] },
);

const getUserInputSchema = s.object("Input parameters for retrieving a KnowBe4 user.", {
  userId: s.integer("KnowBe4 user ID.", { minimum: 1 }),
});

const listGroupsInputSchema = s.object(
  "Input parameters for listing KnowBe4 groups.",
  {
    status: statusInputSchema,
    ...paginationInputFields,
  },
  { optional: ["status", "perPage", "cursor"] },
);

const getGroupInputSchema = s.object("Input parameters for retrieving a KnowBe4 group.", {
  groupId: s.integer("KnowBe4 group ID.", { minimum: 1 }),
});

const listUsersOutputSchema = s.object("KnowBe4 users list response.", {
  users: s.array("KnowBe4 users returned by the API.", userSchema),
  pagination: paginationOutputSchema,
  raw: s.unknown("Raw KnowBe4 response payload."),
});

const getUserOutputSchema = s.object("KnowBe4 user response.", {
  user: userSchema,
  raw: rawObjectSchema,
});

const listGroupsOutputSchema = s.object("KnowBe4 groups list response.", {
  groups: s.array("KnowBe4 groups returned by the API.", groupSchema),
  pagination: paginationOutputSchema,
  raw: s.unknown("Raw KnowBe4 response payload."),
});

const getGroupOutputSchema = s.object("KnowBe4 group response.", {
  group: groupSchema,
  raw: rawObjectSchema,
});

export const knowbe4Actions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account",
    description: "Get KnowBe4 account and subscription data from the Reporting API.",
    requiredScopes: [],
    inputSchema: s.object("No input is required to get KnowBe4 account data.", {}),
    outputSchema: getAccountOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_users",
    description: "List KnowBe4 users with optional status, group, expanded group, per_page, and cursor filters.",
    requiredScopes: [],
    inputSchema: listUsersInputSchema,
    outputSchema: listUsersOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_user",
    description: "Get a specific KnowBe4 user by user ID.",
    requiredScopes: [],
    inputSchema: getUserInputSchema,
    outputSchema: getUserOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_groups",
    description: "List KnowBe4 groups with optional status, per_page, and cursor filters.",
    requiredScopes: [],
    inputSchema: listGroupsInputSchema,
    outputSchema: listGroupsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_group",
    description: "Get a specific KnowBe4 group by group ID.",
    requiredScopes: [],
    inputSchema: getGroupInputSchema,
    outputSchema: getGroupOutputSchema,
  }),
];
