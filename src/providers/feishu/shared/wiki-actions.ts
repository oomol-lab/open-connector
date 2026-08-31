import type { ActionDefinition } from "../../../core/types.ts";

import { s } from "../../../core/json-schema.ts";
import { defineProviderAction } from "../../../core/provider-definition.ts";
const spaceId = s.string("The Feishu Wiki space ID.", { minLength: 1 });
const nodeToken = s.string("The Wiki node_token.", { minLength: 1 });
const pageSize = s.positiveInteger("The maximum number of results on this page.", {
  maximum: 50,
});
const pageToken = s.string("The token returned by the previous page.", { minLength: 1 });
const objectType = s.stringEnum("The document type represented by the Wiki node.", [
  "doc",
  "sheet",
  "bitable",
  "mindnote",
  "file",
  "slides",
  "docx",
]);
const wikiItem = s.looseRequiredObject(
  "A Feishu Wiki object.",
  {},
  {
    optional: [],
  },
);
const itemOutput = s.object(
  "A normalized Wiki result.",
  { item: wikiItem },
  {
    optional: [],
  },
);
const pageOutput = s.object(
  "A normalized Wiki page.",
  {
    items: s.array("The items returned on this page.", wikiItem),
    hasMore: s.boolean("Whether another page is available."),
    pageToken: s.nullable(s.string("The token for the next page.")),
  },
  {
    optional: [],
  },
);
const memberType = s.stringEnum("The Wiki member identifier type.", [
  "email",
  "openid",
  "userid",
  "unionid",
  "openchat",
  "opendepartmentid",
  "useridlist",
  "groupid",
  "departmentid",
  "appid",
]);
const memberRole = s.stringEnum("The Wiki space member role.", ["admin", "member"]);
export function createFeishuWikiActions(service: string): readonly ActionDefinition[] {
  return [
    defineProviderAction(service, {
      name: "list_wiki_spaces",
      description: "List Feishu Wiki spaces accessible to the caller.",
      requiredScopes: ["wiki:space:retrieve"],
      providerPermissions: ["wiki:space:retrieve"],
      inputSchema: s.object(
        "Configure Wiki space pagination.",
        { pageSize, pageToken },
        {
          optional: ["pageSize", "pageToken"],
        },
      ),
      outputSchema: pageOutput,
    }),
    defineProviderAction(service, {
      name: "get_wiki_space",
      description: "Get one Feishu Wiki space by ID.",
      requiredScopes: ["wiki:space:read"],
      providerPermissions: ["wiki:space:read"],
      inputSchema: s.object(
        "Identify the Wiki space.",
        { spaceId },
        {
          optional: [],
        },
      ),
      outputSchema: itemOutput,
    }),
    defineProviderAction(service, {
      name: "create_wiki_space",
      description: "Create a Feishu Wiki space.",
      requiredScopes: ["wiki:space:write_only"],
      providerPermissions: ["wiki:space:write_only"],
      inputSchema: s.object(
        "Describe the Wiki space.",
        {
          name: s.string("The Wiki space name.", { minLength: 1 }),
          description: s.string("The Wiki space description."),
        },
        {
          optional: ["description"],
        },
      ),
      outputSchema: itemOutput,
    }),
    defineProviderAction(service, {
      name: "list_wiki_nodes",
      description: "List nodes in a Feishu Wiki space or below one parent node.",
      requiredScopes: ["wiki:node:retrieve"],
      providerPermissions: ["wiki:node:retrieve"],
      inputSchema: s.object(
        "Identify the space and optional parent node.",
        {
          spaceId,
          parentNodeToken: s.string("The parent node_token used to restrict results.", {
            minLength: 1,
          }),
          pageSize,
          pageToken,
        },
        {
          optional: ["parentNodeToken", "pageSize", "pageToken"],
        },
      ),
      outputSchema: pageOutput,
    }),
    defineProviderAction(service, {
      name: "get_wiki_node",
      description: "Resolve and get a Feishu Wiki node by token and object type.",
      requiredScopes: ["wiki:node:retrieve"],
      providerPermissions: ["wiki:node:retrieve"],
      inputSchema: s.object(
        "Identify the Wiki node.",
        {
          token: s.string("A Wiki node_token or document obj_token.", { minLength: 1 }),
          objectType,
        },
        {
          optional: ["objectType"],
        },
      ),
      outputSchema: itemOutput,
    }),
    defineProviderAction(service, {
      name: "create_wiki_node",
      description: "Create a document node in a Feishu Wiki space.",
      requiredScopes: ["wiki:node:create"],
      providerPermissions: ["wiki:node:create"],
      inputSchema: s.object(
        "Describe the Wiki node.",
        {
          spaceId,
          objectType,
          parentNodeToken: s.string("The parent node_token, or omit to create at space root.", {
            minLength: 1,
          }),
          nodeType: s.stringEnum("Whether to create at the origin or as a shortcut.", ["origin", "shortcut"]),
          title: s.string("The title of the new document.", { minLength: 1 }),
          originNodeToken: s.string("The origin node_token required when creating a shortcut node.", { minLength: 1 }),
        },
        {
          optional: ["parentNodeToken", "nodeType", "title", "originNodeToken"],
        },
      ),
      outputSchema: itemOutput,
    }),
    defineProviderAction(service, {
      name: "copy_wiki_node",
      description: "Copy a Feishu Wiki node into another space or below another parent.",
      requiredScopes: ["wiki:node:copy"],
      providerPermissions: ["wiki:node:copy"],
      inputSchema: s.object(
        "Identify the source node and destination.",
        {
          spaceId,
          nodeToken,
          targetSpaceId: s.string("The destination Wiki space ID.", { minLength: 1 }),
          targetParentToken: s.string("The destination parent node_token.", { minLength: 1 }),
          title: s.string("An optional title for the copied node.", { minLength: 1 }),
        },
        {
          optional: ["targetSpaceId", "targetParentToken", "title"],
        },
      ),
      outputSchema: itemOutput,
    }),
    defineProviderAction(service, {
      name: "move_wiki_node",
      description: "Move a Feishu Wiki node to another space or parent node.",
      requiredScopes: ["wiki:node:move"],
      providerPermissions: ["wiki:node:move"],
      inputSchema: s.object(
        "Identify the source node and destination.",
        {
          spaceId,
          nodeToken,
          targetSpaceId: s.string("The destination Wiki space ID.", { minLength: 1 }),
          targetParentToken: s.string("The destination parent node_token.", { minLength: 1 }),
        },
        {
          optional: ["targetParentToken"],
        },
      ),
      outputSchema: itemOutput,
    }),
    defineProviderAction(service, {
      name: "delete_wiki_node",
      description: "Delete a Feishu Wiki node and optionally its descendants.",
      requiredScopes: ["wiki:node:create"],
      providerPermissions: ["wiki:node:create"],
      inputSchema: s.object(
        "Identify the node to delete.",
        {
          spaceId,
          nodeToken,
          objectType,
          includeChildren: s.boolean("Whether to delete descendant nodes."),
        },
        {
          optional: ["objectType", "includeChildren"],
        },
      ),
      outputSchema: s.object(
        "The deletion result or asynchronous task.",
        {
          deleted: s.boolean("Whether Feishu completed deletion synchronously."),
          taskId: s.nullable(s.string("The asynchronous task ID, when returned.")),
          raw: wikiItem,
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "submit_wiki_move_to_drive",
      description: "Move a Wiki node out of its knowledge space into Drive and return an asynchronous task handle.",
      requiredScopes: ["space:document:move", "wiki:space:read"],
      providerPermissions: ["space:document:move", "wiki:space:read"],
      asyncLifecycle: {
        startActionId: `${service}.submit_wiki_move_to_drive`,
        statusActionId: `${service}.get_wiki_task`,
      },
      inputSchema: s.object(
        "Identify the Wiki node and optional target Drive folder.",
        {
          nodeToken,
          folderToken: s.string("The target Drive folder token. Omit it to move to the identity's Drive root.", {
            minLength: 1,
          }),
        },
        {
          optional: ["folderToken"],
        },
      ),
      outputSchema: s.object(
        "The submitted Wiki move task.",
        {
          taskId: s.string("The Wiki asynchronous task ID."),
          nodeToken,
          folderToken: s.nullable(s.string("The target Drive folder token, or null for root.")),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "delete_wiki_space",
      description: "Delete a Feishu Wiki space and return either synchronous completion or an asynchronous task ID.",
      requiredScopes: ["wiki:space:write_only", "wiki:space:read"],
      providerPermissions: ["wiki:space:write_only", "wiki:space:read"],
      inputSchema: s.object(
        "Identify the Wiki space to delete.",
        { spaceId },
        {
          optional: [],
        },
      ),
      outputSchema: s.object(
        "The Wiki space deletion result.",
        {
          spaceId,
          status: s.stringEnum("The normalized deletion status.", ["running", "succeeded"]),
          taskId: s.nullable(s.string("The asynchronous task ID, when deletion is queued.")),
          raw: wikiItem,
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "get_wiki_task",
      description: "Get a normalized Wiki asynchronous task status.",
      requiredScopes: ["wiki:space:read"],
      providerPermissions: ["wiki:space:read"],
      inputSchema: s.object(
        "Identify the Wiki task and its operation type.",
        {
          taskId: s.string("The Wiki asynchronous task ID.", { minLength: 1 }),
          taskType: s.stringEnum("The Wiki asynchronous operation type.", ["move_wiki_to_docs", "delete_space"]),
        },
        {
          optional: ["taskType"],
        },
      ),
      outputSchema: s.object(
        "The normalized Wiki task status.",
        {
          taskId: s.string("The Wiki asynchronous task ID."),
          taskType: s.string("The Wiki asynchronous operation type."),
          status: s.stringEnum("The normalized Wiki task status.", ["running", "succeeded", "failed"]),
          statusMessage: s.string("The provider status message."),
          resourceToken: s.string("The moved Drive resource token."),
          resourceType: s.string("The moved Drive resource type."),
          url: s.url("The moved Drive resource URL."),
          raw: wikiItem,
        },
        {
          optional: ["statusMessage", "resourceToken", "resourceType", "url"],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "list_wiki_members",
      description: "List members of a Feishu Wiki space.",
      requiredScopes: ["wiki:member:retrieve"],
      providerPermissions: ["wiki:member:retrieve"],
      inputSchema: s.object(
        "Identify the Wiki space and configure pagination.",
        { spaceId, pageSize, pageToken },
        {
          optional: ["pageSize", "pageToken"],
        },
      ),
      outputSchema: pageOutput,
    }),
    defineProviderAction(service, {
      name: "add_wiki_member",
      description: "Add a member to a Feishu Wiki space.",
      requiredScopes: ["wiki:member:create"],
      providerPermissions: ["wiki:member:create"],
      inputSchema: s.object(
        "Identify the space and member.",
        {
          spaceId,
          memberId: s.string("The member identifier.", { minLength: 1 }),
          memberType,
          memberRole,
          notify: s.boolean("Whether Feishu should notify the member."),
        },
        {
          optional: ["notify"],
        },
      ),
      outputSchema: itemOutput,
    }),
    defineProviderAction(service, {
      name: "remove_wiki_member",
      description: "Remove a member from a Feishu Wiki space.",
      requiredScopes: ["wiki:member:update"],
      providerPermissions: ["wiki:member:update"],
      inputSchema: s.object(
        "Identify the space and membership to remove.",
        {
          spaceId,
          memberId: s.string("The member identifier.", { minLength: 1 }),
          memberType,
          memberRole,
        },
        {
          optional: [],
        },
      ),
      outputSchema: s.object(
        "The member removal result.",
        {
          removed: s.boolean("Whether the member was removed."),
          memberId: s.string("The removed member identifier."),
        },
        {
          optional: [],
        },
      ),
    }),
  ];
}
