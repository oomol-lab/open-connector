import type { ActionDefinition } from "../../../core/types.ts";

import { s } from "../../../core/json-schema.ts";
import { defineProviderAction } from "../../../core/provider-definition.ts";
interface FeishuContactActionOptions {
  readonly service: string;
  readonly identity: "user" | "tenant";
}
const userIdTypeSchema = s.stringEnum("The identifier type used by userId.", ["open_id", "union_id", "user_id"]);
const departmentIdTypeSchema = s.stringEnum("The identifier type used by departmentId.", [
  "department_id",
  "open_department_id",
]);
const pageOutputSchema = s.object(
  "A page of Feishu contact resources.",
  {
    items: s.array("The resources returned on this page.", s.looseObject("A Feishu contact object.")),
    pageToken: s.nullable(s.string("The token for fetching the next page.")),
    hasMore: s.boolean("Whether another page is available."),
  },
  {
    optional: [],
  },
);
const userOutputSchema = s.object(
  "A Feishu user profile.",
  {
    user: s.looseObject("The user object returned by Feishu."),
  },
  {
    optional: [],
  },
);
export function createFeishuContactActions(input: FeishuContactActionOptions): readonly ActionDefinition[] {
  const getUserPermissions =
    input.identity === "user"
      ? ["contact:user.basic_profile:readonly"]
      : ["contact:user.base:readonly", "contact:contact.base:readonly"];
  const directoryPermissions = [
    "contact:user.base:readonly",
    "contact:department.base:readonly",
    "contact:contact.base:readonly",
  ];
  const actions: ActionDefinition[] = [
    defineProviderAction(input.service, {
      name: "get_user",
      operationType: "read",
      description: "Get a Feishu user profile. User identity may omit userId to return the authenticated user.",
      requiredScopes: getUserPermissions,
      providerPermissions: getUserPermissions,
      inputSchema: s.object(
        "Identify the user to retrieve.",
        {
          userId: s.string(
            "The Feishu user identifier. Omit only when using user identity to get the authenticated user.",
            { minLength: 1 },
          ),
          userIdType: userIdTypeSchema,
        },
        {
          optional: ["userId", "userIdType"],
        },
      ),
      outputSchema: userOutputSchema,
    }),
    defineProviderAction(input.service, {
      name: "list_departments",
      operationType: "read",
      description: "List child departments below a Feishu department visible to the app.",
      requiredScopes: directoryPermissions,
      providerPermissions: directoryPermissions,
      inputSchema: s.object(
        "Identify the parent department and page through its children.",
        {
          departmentId: s.string("The parent department identifier. Use 0 for the root department.", { minLength: 1 }),
          departmentIdType: departmentIdTypeSchema,
          userIdType: userIdTypeSchema,
          fetchChild: s.boolean("Whether to recursively include all descendant departments."),
          pageSize: s.positiveInteger("The number of departments per page.", { maximum: 50 }),
          pageToken: s.string("The page token returned by the previous request."),
        },
        {
          optional: ["departmentId", "departmentIdType", "userIdType", "fetchChild", "pageSize", "pageToken"],
        },
      ),
      outputSchema: pageOutputSchema,
    }),
    defineProviderAction(input.service, {
      name: "list_department_users",
      operationType: "read",
      description: "List users in a Feishu department visible to the app.",
      requiredScopes: directoryPermissions,
      providerPermissions: directoryPermissions,
      inputSchema: s.object(
        "Identify the department and page through its users.",
        {
          departmentId: s.string("The department identifier.", { minLength: 1 }),
          departmentIdType: departmentIdTypeSchema,
          userIdType: userIdTypeSchema,
          pageSize: s.positiveInteger("The number of users per page.", { maximum: 50 }),
          pageToken: s.string("The page token returned by the previous request."),
        },
        {
          optional: ["departmentIdType", "userIdType", "pageSize", "pageToken"],
        },
      ),
      outputSchema: pageOutputSchema,
    }),
  ];
  if (input.identity === "user") {
    actions.push(
      defineProviderAction(input.service, {
        name: "search_users",
        operationType: "read",
        description: "Search Feishu users by keyword, open_id list, or relationship filters using user identity.",
        requiredScopes: ["contact:user:search"],
        providerPermissions: ["contact:user:search"],
        inputSchema: s.object(
          "Describe one user search.",
          {
            query: s.string("A search keyword of at most 50 characters.", { maxLength: 50 }),
            userIds: s.array(
              "Restrict the search to these open_id values.",
              s.string("A Feishu open_id.", { minLength: 1 }),
              { maxItems: 100 },
            ),
            leftOrganization: s.boolean("Whether to return only users who left the organization."),
            hasChatted: s.boolean("Whether to return only users the caller has chatted with."),
            excludeExternalUsers: s.boolean("Whether to exclude cross-tenant users."),
            hasEnterpriseEmail: s.boolean("Whether to return only users with enterprise email."),
            pageSize: s.positiveInteger("The number of users to return.", { maximum: 30 }),
          },
          {
            optional: [
              "query",
              "userIds",
              "leftOrganization",
              "hasChatted",
              "excludeExternalUsers",
              "hasEnterpriseEmail",
              "pageSize",
            ],
          },
        ),
        outputSchema: pageOutputSchema,
      }),
    );
  }
  return actions;
}
