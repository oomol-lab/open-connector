import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const worksheetId = s.nonEmptyString("The worksheet ID.");
const rowId = s.nonEmptyString("The record ID.");
const pageIndex = s.integer("The page index; defaults to 1 when omitted.");
const pageSize = s.integer("The number of items per page; defaults to 20 when omitted.");
const knowledgeIds = s.stringArray("The knowledge base IDs; an empty array selects all knowledge bases.", {
  itemDescription: "A knowledge base ID.",
});
const lookupInput = s.object(
  "The organization lookup request.",
  {
    name: s.string("The user or department name to match exactly."),
    orgId: s.string(
      "The organization ID. Optional with AppKey and Sign; omitting it uses the application's organization.",
    ),
  },
  { optional: ["name", "orgId"] },
);
const role = s.looseObject("The role metadata and membership information.", {
  id: s.string("The role ID."),
  name: s.string("The role name."),
  description: s.string("The role description."),
  roleType: s.string("The role type."),
  accounts: s.array("The role's users.", s.looseObject("A user identity.")),
  departmentTrees: s.array("The department trees assigned to the role.", s.looseObject("A department tree.")),
  departments: s.array("The departments assigned to the role.", s.looseObject("A department identity.")),
  jobs: s.array("The jobs assigned to the role.", s.looseObject("A job identity.")),
  orgRoleIds: s.stringArray("The assigned organization role IDs.", {
    itemDescription: "An organization role ID.",
  }),
});

export const mingdaoQueryActions: readonly ProviderActionDefinition[] = [
  defineProviderAction("mingdao", {
    name: "list_record_logs",
    operationType: "read",
    requiredScopes: [],
    description: "Read a Mingdao record's change logs, optionally filtered by operators, field and date range.",
    inputSchema: s.object(
      "The record log request.",
      {
        worksheetId,
        rowId,
        operatorIds: s.stringArray("Filter by these operator IDs.", {
          itemDescription: "An operator user ID.",
        }),
        field: s.string("The field ID or alias used to filter change logs."),
        pageIndex,
        pageSize,
        startDate: s.string("The start date in yyyy-MM-dd HH:mm:ss format."),
        endDate: s.string("The end date in yyyy-MM-dd HH:mm:ss format."),
      },
      { required: ["worksheetId", "rowId"] },
    ),
    outputSchema: s.object("The record log response.", {
      data: s.looseObject("The returned record logs and continuation information.", {
        logs: s.array(
          "The record change logs.",
          s.looseObject("A change log containing its operator, operation and old and new field values."),
        ),
        lastMark: s.string("The timestamp of the last update."),
        flag: s.boolean("Whether more data is available."),
      }),
    }),
  }),
  defineProviderAction("mingdao", {
    name: "list_record_discussions",
    operationType: "read",
    requiredScopes: [],
    description:
      "Read a Mingdao record's discussions, including replies, mentions and attachment metadata, with optional search and Markdown output.",
    inputSchema: s.object(
      "The record discussion request.",
      {
        worksheetId,
        rowId,
        pageIndex: s.integer("The one-based page index; defaults to 1.", { minimum: 1 }),
        pageSize: s.integer("The page size from 1 to 100; defaults to 20.", {
          minimum: 1,
          maximum: 100,
        }),
        search: s.string("The discussion search keyword."),
        onlyWithAttachments: s.boolean("Whether to return only discussions with attachments; defaults to false."),
        responseFormat: s.stringEnum(
          "The response format: json or md. Markdown includes only important fields; defaults to json.",
          ["json", "md"],
        ),
      },
      { required: ["worksheetId", "rowId"] },
    ),
    outputSchema: s.object("The record discussion response.", {
      data: s.anyOf("The discussion page or requested Markdown text.", [
        s.looseObject("The discussion page.", {
          discussions: s.array(
            "The returned discussions.",
            s.looseObject("A discussion with its author, message, replies, mentions and attachments."),
          ),
        }),
        s.string("The Markdown discussion text."),
      ]),
    }),
  }),
  defineProviderAction("mingdao", {
    name: "get_approval",
    operationType: "read",
    requiredScopes: [],
    description:
      "Get the execution details, current steps and available operation metadata for an existing Mingdao record approval.",
    inputSchema: s.object("The approval execution details request.", {
      worksheetId,
      rowId,
      approvalId: s.nonEmptyString("The approval process ID."),
    }),
    outputSchema: s.object("The approval execution details response.", {
      data: s.looseObject("The approval execution details, including provider-defined step and operation metadata.", {
        companyId: s.string("The organization ID."),
        works: s.array("The executed workflow step instances.", s.looseObject("A workflow step instance.")),
        currentWork: s.unknown("The current work item, or null when unavailable."),
        currentWorkItem: s.unknown("The current work item details, or null when unavailable."),
        operationTypeList: s.nullable(
          s.array(
            "The available operation codes: 3 revoke, 4 approve, 5 reject, 6 forward for approval, 7 countersign, 9 submit, 10 hand over, 12 print.",
            s.array("A group of available approval operation codes.", s.integer("An approval operation code.")),
          ),
        ),
        operationUserRange: s.nullable(
          s.looseObject("The allowed user ranges for each operation type, or null when unavailable."),
        ),
        opinionTemplate: s.unknown("The approval or rejection opinion template, or null."),
        title: s.nullable(s.string("The approval title, or null when unavailable.")),
        processName: s.string("The process name."),
        processId: s.string("The process ID."),
        parentId: s.string("The editable process version ID."),
        isApproval: s.boolean("Whether this is an approval workflow."),
        flowNode: s.looseObject("The current workflow node information."),
        backFlowNodes: s.array("The nodes available for rollback.", s.looseObject("A rollback node.")),
        callBackNodeType: s.nullable(
          s.integer(
            "Rollback scope: 0 all above, 1 start only, 2 previous only, 3 specified nodes; null when unavailable.",
          ),
        ),
        instanceType: s.integer("The application form state: -1 deleted, 0 revoked, 1 normal, 2 draft."),
        btnMap: s.nullable(s.looseObject("The names assigned to operation buttons, or null when unavailable.")),
        status: s.integer("The execution status: 1 in progress, 2 completed, 3 terminated, 4 failed."),
        currentWorkIds: s.stringArray("The current step IDs.", {
          itemDescription: "A workflow step ID.",
        }),
        signOperationType: s.nullable(
          s.integer(
            "Countersign mode: 0 let the user select, 1 before approval, 2 after approval; null when unavailable.",
          ),
        ),
        allowTaskRevokeBackNodeId: s.nullable(
          s.string("The node to which the approver may revoke the task, or null when unavailable."),
        ),
        printList: s.array("The available print templates.", s.looseObject("A print template.")),
        disabledPrint: s.boolean("Whether system printing is disabled."),
        recordTitle: s.nullable(s.string("The task title, or null when unavailable.")),
        ownerAccount: s.unknown("The data owner information, or null."),
        createAccount: s.unknown("The data creator and actual workflow initiator, or null."),
        createDate: s.nullable(s.string("The record creation time, or null when unavailable.")),
        app: s.unknown("The application information, or null."),
      }),
    }),
  }),
  defineProviderAction("mingdao", {
    name: "list_approvals",
    operationType: "read",
    requiredScopes: [],
    description:
      "List approval executions for a Mingdao record, optionally selecting completed or incomplete executions.",
    inputSchema: s.object(
      "The approval execution list request.",
      {
        worksheetId,
        rowId,
        pageIndex: s.integer("The requested page index."),
        pageSize: s.integer("The requested number of executions per page."),
        complete: s.boolean("Whether to select completed executions: true for completed, false for incomplete."),
      },
      { required: ["worksheetId", "rowId"] },
    ),
    outputSchema: s.object("The approval execution list response.", {
      data: s.looseObject("The approval execution list returned by the API.", {
        worksheetId,
        rowId,
        todoList: s.array("The approval task entries.", s.looseObject("An approval task entry.")),
      }),
    }),
  }),
  defineProviderAction("mingdao", {
    name: "list_roles",
    operationType: "read",
    requiredScopes: [],
    description:
      "List the connected Mingdao application's roles and their user, department, job and organization-role memberships.",
    inputSchema: s.object("The role list request.", {}),
    outputSchema: s.object("The role list response.", {
      data: s.looseObject("The role list result.", {
        roles: s.array("The application roles.", role),
      }),
    }),
  }),
  defineProviderAction("mingdao", {
    name: "get_role",
    operationType: "read",
    requiredScopes: [],
    description: "Get a Mingdao application role's global, worksheet, field and custom-page permissions.",
    inputSchema: s.object("The role details request.", {
      roleId: s.nonEmptyString("The role ID."),
    }),
    outputSchema: s.object("The role details response.", {
      data: s.looseObject("The role details and permission configuration.", {
        id: s.string("The role ID."),
        name: s.string("The role name."),
        description: s.string("The role description."),
        permissionScope: s.string(
          "The permission scope: 80 full access, 60 read all and edit/delete own, 30 read joined and edit/delete own, 20 read all, 0 permissions by application item.",
        ),
        type: s.string("The role type; 0 denotes a custom role."),
        hideAppForMembers: s.string("Whether the application is hidden from members, encoded as true or false text."),
        globalPermissions: s.looseObject(
          "The global permissions, effective when permissionScope is greater than zero.",
        ),
        worksheetPermissions: s.array(
          "The worksheet, record, view and field permissions, effective when permissionScope is zero.",
          s.looseObject("A worksheet permission configuration."),
        ),
        pagePermissions: s.array(
          "The custom-page permissions, effective when permissionScope is zero.",
          s.looseObject("A custom-page permission configuration."),
        ),
      }),
    }),
  }),
  defineProviderAction("mingdao", {
    name: "list_optionsets",
    operationType: "read",
    requiredScopes: [],
    description: "List the reusable option sets in the connected Mingdao application.",
    inputSchema: s.object("The option set list request.", {}),
    outputSchema: s.object("The option set list response.", {
      data: s.looseObject("The option set list result.", {
        optionsets: s.array("The application option sets.", s.looseObject("An option set and its option definitions.")),
      }),
    }),
  }),
  defineProviderAction("mingdao", {
    name: "lookup_users",
    operationType: "read",
    requiredScopes: [],
    description: "Look up users in the Mingdao application's organization, optionally matching an exact user name.",
    inputSchema: lookupInput,
    outputSchema: s.object("The user lookup response.", {
      data: s.looseObject("The user lookup result.", {
        users: s.array("The matching users.", s.looseObject("A user identity and organization profile.")),
      }),
    }),
  }),
  defineProviderAction("mingdao", {
    name: "lookup_departments",
    operationType: "read",
    requiredScopes: [],
    description:
      "Look up departments in the Mingdao application's organization, optionally matching an exact department name.",
    inputSchema: lookupInput,
    outputSchema: s.object("The department lookup response.", {
      data: s.looseObject("The department lookup result.", {
        departments: s.array(
          "The matching departments.",
          s.looseObject("A department identity and hierarchy information."),
        ),
      }),
    }),
  }),
  defineProviderAction("mingdao", {
    name: "list_regions",
    operationType: "read",
    requiredScopes: [],
    description: "List or search Mingdao geographic regions; omit the region ID to retrieve top-level regions.",
    inputSchema: s.object(
      "The region list request.",
      {
        id: s.string("The region ID; omitting it returns top-level regions."),
        search: s.string("The fuzzy region-name search text."),
      },
      { optional: ["id", "search"] },
    ),
    outputSchema: s.object("The region list response.", {
      data: s.looseObject("The region list result.", {
        regions: s.array("The matching regions.", s.looseObject("A geographic region.")),
      }),
    }),
  }),
  defineProviderAction("mingdao", {
    name: "list_knowledge",
    operationType: "read",
    requiredScopes: [],
    description: "List Mingdao application knowledge bases, including their configured embedding models.",
    inputSchema: s.object("The knowledge base list request.", { knowledgeIds }, { optional: ["knowledgeIds"] }),
    outputSchema: s.object("The knowledge base list response.", {
      data: s.array(
        "The application knowledge bases.",
        s.looseObject("A knowledge base.", {
          id: s.string("The knowledge base ID."),
          name: s.string("The knowledge base name."),
          remark: s.string("The knowledge base description."),
          model: s.string("The configured embedding model."),
        }),
      ),
    }),
  }),
  defineProviderAction("mingdao", {
    name: "search_knowledge",
    operationType: "read",
    requiredScopes: [],
    description:
      "Search Mingdao knowledge content using vector, keyword or hybrid retrieval. Knowledge bases with different embedding models must be searched in separate calls.",
    inputSchema: s.object(
      "The knowledge search request.",
      {
        knowledgeIds,
        query: s.string("The text to search for."),
        searchMode: s.stringEnum(
          "The retrieval mode: vector for semantic search, keyword for full-text search, or hybrid for both.",
          ["vector", "keyword", "hybrid"],
        ),
        topK: s.integer("The maximum number of matches, at least 1; defaults to 10.", {
          minimum: 1,
        }),
        minRelevance: s.number("The minimum vector-search relevance score from 0 to 1; applies only to vector mode.", {
          minimum: 0,
          maximum: 1,
        }),
        rrfK: s.integer("The reciprocal rank fusion k parameter; applies only to hybrid mode and defaults to 60."),
        filter: s.object(
          "Optional worksheet and content-type restrictions.",
          {
            worksheetIds: s.stringArray("Restrict the search to these worksheet IDs.", {
              itemDescription: "A worksheet ID.",
            }),
            types: s.array(
              "The content types to search; omitting this field searches all types.",
              s.stringEnum("A knowledge content type.", [
                "record",
                "record_attachment",
                "discussion_attachment",
                "discussion",
              ]),
            ),
          },
          { optional: ["worksheetIds", "types"] },
        ),
      },
      { required: ["knowledgeIds", "query", "searchMode"] },
    ),
    outputSchema: s.object("The knowledge search response.", {
      data: s.looseObject("The knowledge search results.", {
        chunks: s.array(
          "The matching content chunks.",
          s.looseObject("A matching chunk with its source and attachment metadata.", {
            score: s.number("The ranking score."),
            knowledgeId: s.string("The source knowledge base ID."),
            knowledgeName: s.string("The source knowledge base name."),
            chunkId: s.string("The unique content chunk ID."),
            content: s.string("The matching text content."),
            type: s.string("The content type: record, record_attachment, discussion_attachment or discussion."),
            rowId,
            appId: s.string("The application ID."),
            worksheetId,
            worksheetName: s.string("The worksheet name."),
            field: s.string("The field ID for an attachment match."),
            fieldName: s.string("The field name for an attachment match."),
            updatedAt: s.string("The last update time."),
            recordTitle: s.string("The record title."),
            attachmentId: s.string("The attachment ID, when the match is from an attachment."),
            attachmentName: s.string("The attachment name, when the match is from an attachment."),
            match: s.string("The match type: raw for an original chunk, enhanced for an enhanced chunk."),
          }),
        ),
      }),
    }),
  }),
];
