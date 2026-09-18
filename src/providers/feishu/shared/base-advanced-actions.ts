import type { ActionDefinition, ActionOperationType, JsonSchema } from "../../../core/types.ts";

import { s } from "../../../core/json-schema.ts";
import { defineProviderAction } from "../../../core/provider-definition.ts";
interface AddActionInput {
  readonly name: string;
  readonly operationType: ActionOperationType;
  readonly description: string;
  readonly permission: string;
  readonly inputSchema: Record<string, unknown>;
  readonly outputSchema?: Record<string, unknown>;
  readonly write?: boolean;
}
interface NamedActionInput {
  readonly name: string;
  readonly operationType: ActionOperationType;
  readonly description: string;
}
interface ToggleActionInput {
  readonly name: string;
  readonly enabled: boolean;
  readonly operationType: ActionOperationType;
}
const baseToken = s.nonEmptyString("The Base app token.");
const tableId = s.nonEmptyString("The Base table ID.");
const recordId = s.nonEmptyString("The Base record ID.");
const viewId = s.nonEmptyString("The Base view ID.");
const roleId = s.nonEmptyString("The Base role ID.");
const workflowId = s.nonEmptyString("The Base workflow ID.");
const formId = s.nonEmptyString("The Base form ID.");
const dashboardId = s.nonEmptyString("The Base dashboard ID.");
const blockId = s.nonEmptyString("The resource or dashboard block ID.");
const raw = s.looseObject("The object returned by Feishu Base.");
const config = s.looseObject("The complete API configuration object.");
const userIdType = s.stringEnum("The user ID type used in the response or filters.", [
  "open_id",
  "union_id",
  "user_id",
]);
const pageFields = {
  pageSize: s.positiveInteger("The page size.", { maximum: 100 }),
  pageToken: s.string("The pagination token from a previous response."),
};
const resultOutput = s.object(
  "The Base operation result.",
  {
    result: raw,
  },
  {
    optional: [],
  },
);
const writeOutput = s.object(
  "The completed Base write operation.",
  {
    result: raw,
    success: s.boolean("Whether Feishu accepted the operation."),
  },
  {
    optional: [],
  },
);
const listOutput = s.object(
  "A normalized page of Base resources.",
  {
    items: s.array("The resources returned for this page.", raw),
    total: s.nonNegativeInteger("The total count reported or inferred."),
    pageToken: s.string("The next pagination token."),
    hasMore: s.boolean("Whether another page is available."),
  },
  {
    optional: [],
  },
);
const deleteOutput = s.object(
  "The completed deletion.",
  {
    deleted: s.boolean("Whether the resource was deleted."),
    id: s.nonEmptyString("The deleted resource ID."),
  },
  {
    optional: [],
  },
);
const baseInput = (description: string, properties: Record<string, JsonSchema> = {}) =>
  s.object(
    description,
    { baseToken, ...properties },
    {
      optional: [],
    },
  );
const tableInput = (description: string, properties: Record<string, JsonSchema> = {}) =>
  baseInput(description, { tableId, ...properties });
const viewInput = (description: string, properties: Record<string, JsonSchema> = {}) =>
  tableInput(description, { viewId, ...properties });
const formInput = (description: string, properties: Record<string, JsonSchema> = {}) =>
  tableInput(description, { formId, ...properties });
const dashboardInput = (description: string, properties: Record<string, JsonSchema> = {}) =>
  baseInput(description, { dashboardId, ...properties });
export function createFeishuBaseAdvancedActions(service: string): readonly ActionDefinition[] {
  const actions: ActionDefinition[] = [];
  const add = (input: AddActionInput) => {
    actions.push(
      defineProviderAction(service, {
        name: input.name,
        operationType: input.operationType,
        description: input.description,
        requiredScopes: [input.permission],
        providerPermissions: [input.permission],
        inputSchema: input.inputSchema,
        outputSchema: input.outputSchema ?? (input.write ? writeOutput : resultOutput),
      }),
    );
  };
  add({
    name: "list_base_blocks",
    operationType: "read",
    description: "List folders, tables, documents, dashboards, and workflows in a Base.",
    permission: "base:block:read",
    inputSchema: baseInput("Filter the Base resource directory.", {
      parentId: s.nonEmptyString("The parent folder block ID."),
      type: s.stringEnum("The resource type to return.", ["folder", "table", "docx", "dashboard", "workflow"]),
    }),
    outputSchema: listOutput,
  });
  add({
    name: "create_base_block",
    operationType: "write",
    description: "Create a folder, table, document, dashboard, or workflow block.",
    permission: "base:block:create",
    write: true,
    inputSchema: baseInput("Configure the Base block.", {
      type: s.stringEnum("The resource type to create.", ["folder", "table", "docx", "dashboard", "workflow"]),
      name: s.nonEmptyString("The resource name."),
      parentId: s.nonEmptyString("The destination folder block ID."),
    }),
  });
  add({
    name: "move_base_block",
    operationType: "destructive",
    description: "Move and order a Base resource block.",
    permission: "base:block:update",
    write: true,
    inputSchema: baseInput("Identify the block and its destination.", {
      blockId,
      parentId: s.nullable(s.nonEmptyString("The destination folder ID, or null for root.")),
      beforeId: s.nonEmptyString("Place the block before this sibling block."),
      afterId: s.nonEmptyString("Place the block after this sibling block."),
    }),
  });
  add({
    name: "rename_base_block",
    operationType: "write",
    description: "Rename a Base resource block.",
    permission: "base:block:update",
    write: true,
    inputSchema: baseInput("Identify and rename the block.", {
      blockId,
      name: s.nonEmptyString("The new resource name."),
    }),
  });
  add({
    name: "delete_base_block",
    operationType: "destructive",
    description: "Delete a Base resource block.",
    permission: "base:block:delete",
    write: true,
    inputSchema: baseInput("Identify the block to delete.", { blockId }),
    outputSchema: deleteOutput,
  });
  add({
    name: "list_base_record_history",
    operationType: "read",
    description: "List the change history for one Base record.",
    permission: "base:history:read",
    inputSchema: tableInput("Identify the record and history page.", {
      recordId,
      maxVersion: s.positiveInteger("The maximum version for the next page."),
      pageSize: s.positiveInteger("The history page size.", { maximum: 50 }),
    }),
    outputSchema: listOutput,
  });
  add({
    name: "create_base_record_share_links",
    operationType: "write",
    description: "Generate share links for up to 100 Base records.",
    permission: "base:record:read",
    inputSchema: tableInput("Identify records to share.", {
      recordIds: s.array("The record IDs to share.", recordId, {
        minItems: 1,
        maxItems: 100,
      }),
    }),
  });
  const viewProperties: readonly NamedActionInput[] = [
    {
      name: "get_base_view_filter",
      operationType: "read",
      description: "Get the filter configuration of a Base view.",
    },
    {
      name: "get_base_view_visible_fields",
      operationType: "read",
      description: "Get the visible field IDs of a Base view.",
    },
    {
      name: "get_base_view_group",
      operationType: "read",
      description: "Get the grouping configuration of a Base view.",
    },
    {
      name: "get_base_view_sort",
      operationType: "read",
      description: "Get the sorting configuration of a Base view.",
    },
    {
      name: "get_base_view_timebar",
      operationType: "read",
      description: "Get the timeline configuration of a Base view.",
    },
    {
      name: "get_base_view_card",
      operationType: "read",
      description: "Get the card configuration of a Base view.",
    },
  ];
  for (const item of viewProperties) {
    add({
      ...item,
      permission: "base:view:read",
      inputSchema: viewInput("Identify the Base view."),
    });
  }
  const viewSetters: readonly NamedActionInput[] = [
    {
      name: "set_base_view_filter",
      operationType: "destructive",
      description: "Replace the filter configuration of a Base view.",
    },
    {
      name: "set_base_view_visible_fields",
      operationType: "destructive",
      description: "Replace the visible field configuration of a Base view.",
    },
    {
      name: "set_base_view_group",
      operationType: "destructive",
      description: "Replace the grouping configuration of a Base view.",
    },
    {
      name: "set_base_view_sort",
      operationType: "destructive",
      description: "Replace the sorting configuration of a Base view.",
    },
    {
      name: "set_base_view_timebar",
      operationType: "destructive",
      description: "Replace the timeline configuration of a Base view.",
    },
    {
      name: "set_base_view_card",
      operationType: "destructive",
      description: "Replace the card configuration of a Base view.",
    },
  ];
  for (const item of viewSetters) {
    add({
      ...item,
      permission: "base:view:write_only",
      write: true,
      inputSchema: viewInput("Identify the Base view and provide its complete configuration.", {
        config,
      }),
    });
  }
  add({
    name: "rename_base_view",
    operationType: "write",
    description: "Rename a Base view.",
    permission: "base:view:write_only",
    write: true,
    inputSchema: viewInput("Identify and rename the Base view.", {
      name: s.nonEmptyString("The new view name."),
    }),
  });
  add({
    name: "list_base_roles",
    operationType: "read",
    description: "List roles configured for Base advanced permissions.",
    permission: "base:role:read",
    inputSchema: baseInput("Identify the Base."),
    outputSchema: listOutput,
  });
  add({
    name: "get_base_role",
    operationType: "read",
    description: "Get a Base role and its complete permission configuration.",
    permission: "base:role:read",
    inputSchema: baseInput("Identify the Base role.", { roleId }),
  });
  add({
    name: "create_base_role",
    operationType: "write",
    description: "Create a custom Base role from a complete permission configuration.",
    permission: "base:role:create",
    write: true,
    inputSchema: baseInput("Provide the custom role configuration.", { role: config }),
  });
  add({
    name: "update_base_role",
    operationType: "write",
    description: "Delta-merge changes into a Base role configuration.",
    permission: "base:role:update",
    write: true,
    inputSchema: baseInput("Identify the role and provide changed fields.", {
      roleId,
      changes: config,
    }),
  });
  add({
    name: "delete_base_role",
    operationType: "destructive",
    description: "Delete a custom Base role; system roles cannot be deleted.",
    permission: "base:role:delete",
    write: true,
    inputSchema: baseInput("Identify the custom role to delete.", { roleId }),
    outputSchema: deleteOutput,
  });
  const advancedPermissionActions: readonly ToggleActionInput[] = [
    { name: "enable_base_advanced_permissions", enabled: true, operationType: "write" },
    { name: "disable_base_advanced_permissions", enabled: false, operationType: "destructive" },
  ];
  for (const { name, enabled, operationType } of advancedPermissionActions) {
    add({
      name,
      operationType,
      description: `${enabled ? "Enable" : "Disable"} advanced permissions for a Base.`,
      permission: "base:app:update",
      write: true,
      inputSchema: baseInput("Identify the Base whose permission mode should change."),
    });
  }
  add({
    name: "list_base_workflows",
    operationType: "read",
    description: "List and optionally filter workflows in a Base.",
    permission: "base:workflow:read",
    inputSchema: baseInput("Filter the workflow list.", {
      status: s.stringEnum("The workflow status.", ["enabled", "disabled"]),
      pageSize: s.positiveInteger("The page size.", { maximum: 100 }),
    }),
    outputSchema: listOutput,
  });
  add({
    name: "get_base_workflow",
    operationType: "read",
    description: "Get a Base workflow including its steps.",
    permission: "base:workflow:read",
    inputSchema: baseInput("Identify the workflow.", {
      workflowId,
      userIdType: userIdType,
    }),
  });
  add({
    name: "create_base_workflow",
    operationType: "write",
    description: "Create a disabled Base workflow from a complete definition.",
    permission: "base:workflow:create",
    write: true,
    inputSchema: baseInput("Provide the complete workflow definition.", {
      workflow: config,
    }),
  });
  add({
    name: "update_base_workflow",
    operationType: "destructive",
    description: "Replace a Base workflow definition while preserving its enabled state.",
    permission: "base:workflow:update",
    write: true,
    inputSchema: baseInput("Identify the workflow and provide its full replacement.", {
      workflowId,
      workflow: config,
    }),
  });
  const workflowStateActions: readonly ToggleActionInput[] = [
    { name: "enable_base_workflow", enabled: true, operationType: "write" },
    { name: "disable_base_workflow", enabled: false, operationType: "destructive" },
  ];
  for (const { name, enabled, operationType } of workflowStateActions) {
    add({
      name,
      operationType,
      description: `${enabled ? "Enable" : "Disable"} a Base workflow without changing its steps.`,
      permission: "base:workflow:update",
      write: true,
      inputSchema: baseInput("Identify the workflow.", { workflowId }),
    });
  }
  add({
    name: "list_base_forms",
    operationType: "read",
    description: "List forms configured for a Base table.",
    permission: "base:form:read",
    inputSchema: tableInput("Identify the table and page forms.", pageFields),
    outputSchema: listOutput,
  });
  add({
    name: "get_base_form",
    operationType: "read",
    description: "Get a form configured for a Base table.",
    permission: "base:form:read",
    inputSchema: formInput("Identify the form."),
  });
  add({
    name: "get_base_form_detail",
    operationType: "read",
    description: "Get public form questions and submission metadata by share token.",
    permission: "base:form:read",
    inputSchema: s.object(
      "Identify the shared form.",
      {
        shareToken: s.nonEmptyString("The form share token."),
      },
      {
        optional: [],
      },
    ),
  });
  add({
    name: "create_base_form",
    operationType: "write",
    description: "Create a form in a Base table.",
    permission: "base:form:create",
    write: true,
    inputSchema: tableInput("Configure the form.", {
      name: s.nonEmptyString("The form name."),
      description: s.string("The form description."),
    }),
  });
  add({
    name: "update_base_form",
    operationType: "write",
    description: "Update the name or description of a Base form.",
    permission: "base:form:update",
    write: true,
    inputSchema: formInput("Identify the form and provide changed metadata.", {
      name: s.nonEmptyString("The new form name."),
      description: s.string("The new form description."),
    }),
  });
  add({
    name: "delete_base_form",
    operationType: "destructive",
    description: "Delete a form from a Base table.",
    permission: "base:form:delete",
    write: true,
    inputSchema: formInput("Identify the form to delete."),
    outputSchema: deleteOutput,
  });
  add({
    name: "list_base_form_questions",
    operationType: "read",
    description: "List questions configured for a Base form.",
    permission: "base:form:read",
    inputSchema: formInput("Identify the form."),
    outputSchema: listOutput,
  });
  const questions = s.array("The form questions to create or update.", s.looseObject("One question definition."), {
    minItems: 1,
    maxItems: 10,
  });
  add({
    name: "create_base_form_questions",
    operationType: "write",
    description: "Create up to ten questions in a Base form.",
    permission: "base:form:update",
    write: true,
    inputSchema: formInput("Identify the form and provide question definitions.", {
      questions,
    }),
  });
  add({
    name: "update_base_form_questions",
    operationType: "write",
    description: "Update up to ten Base form questions by question ID.",
    permission: "base:form:update",
    write: true,
    inputSchema: formInput("Identify the form and provide question updates.", {
      questions,
    }),
  });
  add({
    name: "delete_base_form_questions",
    operationType: "destructive",
    description: "Delete up to ten questions from a Base form.",
    permission: "base:form:update",
    write: true,
    inputSchema: formInput("Identify the form questions to delete.", {
      questionIds: s.array("The question IDs to delete.", s.nonEmptyString("A question ID."), {
        minItems: 1,
        maxItems: 10,
      }),
    }),
  });
  add({
    name: "submit_base_form",
    operationType: "write",
    description: "Submit JSON field values to a shared Base form.",
    permission: "base:form:update",
    write: true,
    inputSchema: s.object(
      "Identify the shared form and provide field values.",
      {
        shareToken: s.nonEmptyString("The form share token."),
        content: s.looseObject(
          "Form field values keyed by field title; attachment values must already contain uploaded tokens.",
        ),
      },
      {
        optional: [],
      },
    ),
  });
  add({
    name: "list_base_dashboards",
    operationType: "read",
    description: "List dashboards in a Base.",
    permission: "base:dashboard:read",
    inputSchema: baseInput("Page Base dashboards.", pageFields),
    outputSchema: listOutput,
  });
  add({
    name: "get_base_dashboard",
    operationType: "read",
    description: "Get a Base dashboard.",
    permission: "base:dashboard:read",
    inputSchema: dashboardInput("Identify the dashboard."),
  });
  add({
    name: "create_base_dashboard",
    operationType: "write",
    description: "Create a dashboard in a Base.",
    permission: "base:dashboard:create",
    write: true,
    inputSchema: baseInput("Configure the dashboard.", {
      name: s.nonEmptyString("The dashboard name."),
      themeStyle: s.string("The dashboard theme style."),
    }),
  });
  add({
    name: "update_base_dashboard",
    operationType: "write",
    description: "Update a Base dashboard name or theme.",
    permission: "base:dashboard:update",
    write: true,
    inputSchema: dashboardInput("Identify the dashboard and provide changed metadata.", {
      name: s.nonEmptyString("The new dashboard name."),
      themeStyle: s.string("The new dashboard theme style."),
    }),
  });
  add({
    name: "delete_base_dashboard",
    operationType: "destructive",
    description: "Delete a Base dashboard and its blocks.",
    permission: "base:dashboard:delete",
    write: true,
    inputSchema: dashboardInput("Identify the dashboard to delete."),
    outputSchema: deleteOutput,
  });
  add({
    name: "arrange_base_dashboard",
    operationType: "write",
    description: "Ask Feishu to automatically arrange dashboard blocks.",
    permission: "base:dashboard:update",
    write: true,
    inputSchema: dashboardInput("Identify the dashboard to arrange.", {
      userIdType: userIdType,
    }),
  });
  add({
    name: "list_base_dashboard_blocks",
    operationType: "read",
    description: "List blocks in a Base dashboard.",
    permission: "base:dashboard:read",
    inputSchema: dashboardInput("Page dashboard blocks.", pageFields),
    outputSchema: listOutput,
  });
  add({
    name: "get_base_dashboard_block",
    operationType: "read",
    description: "Get a Base dashboard block and its data configuration.",
    permission: "base:dashboard:read",
    inputSchema: dashboardInput("Identify the dashboard block.", {
      blockId,
      userIdType: userIdType,
    }),
  });
  add({
    name: "get_base_dashboard_block_data",
    operationType: "read",
    description: "Get the computed chart data for a Base dashboard block.",
    permission: "base:dashboard:read",
    inputSchema: baseInput("Identify the dashboard block.", { blockId }),
  });
  add({
    name: "create_base_dashboard_block",
    operationType: "write",
    description: "Create a chart, metric, or text block in a Base dashboard.",
    permission: "base:dashboard:create",
    write: true,
    inputSchema: dashboardInput("Configure the dashboard block.", {
      name: s.nonEmptyString("The block name."),
      type: s.nonEmptyString("The chart or text block type."),
      dataConfig: config,
      userIdType: userIdType,
    }),
  });
  add({
    name: "update_base_dashboard_block",
    operationType: "write",
    description: "Update a Base dashboard block name or data configuration.",
    permission: "base:dashboard:update",
    write: true,
    inputSchema: dashboardInput("Identify the block and provide changed configuration.", {
      blockId,
      name: s.nonEmptyString("The new block name."),
      dataConfig: config,
      userIdType: userIdType,
    }),
  });
  add({
    name: "delete_base_dashboard_block",
    operationType: "destructive",
    description: "Delete a block from a Base dashboard.",
    permission: "base:dashboard:delete",
    write: true,
    inputSchema: dashboardInput("Identify the block to delete.", { blockId }),
    outputSchema: deleteOutput,
  });
  return actions;
}
