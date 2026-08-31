import type { ActionDefinition } from "../../../core/types.ts";

import { s } from "../../../core/json-schema.ts";
import { defineProviderAction } from "../../../core/provider-definition.ts";
const userIdType = s.stringEnum("The identifier type used for user fields.", ["open_id", "union_id", "user_id"]);
const departmentIdType = s.stringEnum("The identifier type used for departments.", [
  "department_id",
  "open_department_id",
]);
const targetType = s.stringEnum("The OKR target level.", ["objective", "key_result"]);
const targetId = s.string("The objective or key-result ID.", { minLength: 1 });
const pageSize = s.positiveInteger("The maximum number of results on this page.", {
  maximum: 50,
});
const extendedPageSize = s.positiveInteger("The maximum number of results on this page.", {
  maximum: 100,
});
const pageToken = s.string("The page token returned by the previous request.", { minLength: 1 });
const looseItem = s.looseRequiredObject(
  "A Feishu OKR object.",
  {},
  {
    optional: [],
  },
);
const pageOutput = s.object(
  "A normalized OKR page.",
  {
    items: s.array("The OKR objects returned on this page.", looseItem),
    hasMore: s.boolean("Whether another page is available."),
    pageToken: s.nullable(s.string("The token for the next page.")),
  },
  {
    optional: [],
  },
);
const mentions = s.array(
  "User open_ids mentioned after the text.",
  s.string("A mentioned user open_id.", { minLength: 1 }),
);
const progressFields = {
  content: s.string("The progress update text.", { minLength: 1 }),
  percent: s.number("The numeric completion percentage."),
  status: s.stringEnum("The progress status.", ["normal", "overdue", "done"]),
};
const alignmentPageOutput = s.object(
  "A normalized OKR alignment page.",
  {
    items: s.array(
      "The alignment relationships returned on this page.",
      s.looseRequiredObject(
        "A Feishu OKR alignment relationship.",
        {},
        {
          optional: [],
        },
      ),
    ),
    hasMore: s.boolean("Whether another page is available."),
    pageToken: s.nullable(s.string("The token for the next page.")),
  },
  {
    optional: [],
  },
);
const categoryPageOutput = s.object(
  "A normalized OKR category page.",
  {
    items: s.array(
      "The OKR categories returned on this page.",
      s.looseRequiredObject(
        "A Feishu OKR category.",
        {},
        {
          optional: [],
        },
      ),
    ),
    hasMore: s.boolean("Whether another page is available."),
    pageToken: s.nullable(s.string("The token for the next page.")),
  },
  {
    optional: [],
  },
);
export function createFeishuOkrActions(service: string): readonly ActionDefinition[] {
  return [
    defineProviderAction(service, {
      name: "list_okr_cycles",
      description: "List Feishu OKR cycles visible to a user.",
      requiredScopes: ["okr:okr.period:readonly"],
      providerPermissions: ["okr:okr.period:readonly"],
      inputSchema: s.object(
        "Choose a user and configure pagination.",
        {
          userId: s.string("The user whose cycles should be listed.", { minLength: 1 }),
          userIdType,
          pageSize,
          pageToken,
        },
        {
          optional: ["userId", "userIdType", "pageSize", "pageToken"],
        },
      ),
      outputSchema: pageOutput,
    }),
    defineProviderAction(service, {
      name: "get_okr_cycle_detail",
      description: "List every objective in an OKR cycle and fetch the key results below each objective.",
      requiredScopes: ["okr:okr.content:readonly"],
      providerPermissions: ["okr:okr.content:readonly"],
      inputSchema: s.object(
        "Identify the OKR cycle.",
        {
          cycleId: s.string("The OKR cycle ID.", { minLength: 1 }),
          userIdType,
        },
        {
          optional: ["userIdType"],
        },
      ),
      outputSchema: s.object(
        "The complete OKR cycle content.",
        {
          cycleId: s.string("The OKR cycle ID."),
          objectives: s.array("Objectives with an added key_results array.", looseItem),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "create_okr",
      description: "Create one Feishu objective or key result from plain text.",
      requiredScopes: ["okr:okr.content:writeonly"],
      providerPermissions: ["okr:okr.content:writeonly"],
      inputSchema: s.object(
        "Describe the OKR item.",
        {
          targetType,
          parentId: s.string("The cycle ID for an objective or objective ID for a key result.", {
            minLength: 1,
          }),
          text: s.string("The objective or key-result text.", { minLength: 1 }),
          mentions,
          notes: s.string("Optional notes for an objective."),
          notesMentions: mentions,
          categoryId: s.string("The objective category ID.", { minLength: 1 }),
          userIdType,
        },
        {
          optional: ["mentions", "notes", "notesMentions", "categoryId", "userIdType"],
        },
      ),
      outputSchema: s.object(
        "The created OKR item.",
        {
          targetType: s.string("The created target level."),
          targetId: s.string("The created objective or key-result ID."),
          raw: looseItem,
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "batch_create_okrs",
      description: "Create objectives and their key results sequentially, with optional rollback on failure.",
      requiredScopes: ["okr:okr.content:writeonly"],
      providerPermissions: ["okr:okr.content:writeonly"],
      inputSchema: s.object(
        "Describe objectives and nested key results.",
        {
          cycleId: s.string("The OKR cycle ID.", { minLength: 1 }),
          objectives: s.array(
            "Objectives to create.",
            s.object(
              "One objective and its key results.",
              {
                text: s.string("The objective text.", { minLength: 1 }),
                mentions,
                notes: s.string("Optional objective notes."),
                categoryId: s.string("The objective category ID.", { minLength: 1 }),
                keyResults: s.array(
                  "Key results to create below the objective.",
                  s.object(
                    "One key result.",
                    {
                      text: s.string("The key-result text.", { minLength: 1 }),
                      mentions,
                    },
                    {
                      optional: ["mentions"],
                    },
                  ),
                ),
              },
              {
                optional: ["mentions", "notes", "categoryId", "keyResults"],
              },
            ),
            { minItems: 1 },
          ),
          rollbackOnFailure: s.boolean("Whether to delete objectives created by this action if a later step fails."),
          userIdType,
        },
        {
          optional: ["rollbackOnFailure", "userIdType"],
        },
      ),
      outputSchema: s.object(
        "The batch creation result.",
        {
          objectives: s.array("Created objective and key-result IDs.", looseItem),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "patch_okr",
      description: "Update content, notes, score, or deadline on an objective or key result.",
      requiredScopes: ["okr:okr.content:writeonly"],
      providerPermissions: ["okr:okr.content:writeonly"],
      inputSchema: s.object(
        "Identify the target and provide fields to update.",
        {
          targetType,
          targetId,
          text: s.string("Replacement target text.", { minLength: 1 }),
          mentions,
          notes: s.string("Replacement notes."),
          score: s.number("The new OKR score."),
          deadline: s.string("The new deadline accepted by Feishu.", { minLength: 1 }),
          userIdType,
        },
        {
          optional: ["text", "mentions", "notes", "score", "deadline", "userIdType"],
        },
      ),
      outputSchema: s.object(
        "The patch result.",
        {
          targetType: s.string("The patched target level."),
          targetId: s.string("The patched target ID."),
          patchedFields: s.array("The fields sent to Feishu.", s.string("A patched field name.")),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "list_okr_alignments",
      description: "List the objectives aligned from or to a Feishu OKR objective.",
      requiredScopes: ["okr:okr.content:readonly"],
      providerPermissions: ["okr:okr.content:readonly"],
      inputSchema: s.object(
        "Identify the objective and configure alignment pagination.",
        {
          objectiveId: s.string("The objective ID whose alignments should be listed.", {
            minLength: 1,
          }),
          alignType: s.stringEnum("The direction of the alignment relationship.", ["aligning", "aligned"]),
          userIdType,
          departmentIdType,
          pageSize: extendedPageSize,
          pageToken,
        },
        {
          optional: ["alignType", "userIdType", "departmentIdType", "pageSize", "pageToken"],
        },
      ),
      outputSchema: alignmentPageOutput,
    }),
    defineProviderAction(service, {
      name: "create_okr_alignment",
      description: "Align one Feishu OKR objective to another objective.",
      requiredScopes: ["okr:okr.content:writeonly"],
      providerPermissions: ["okr:okr.content:writeonly"],
      inputSchema: s.object(
        "Identify the source and destination objectives.",
        {
          objectiveId: s.string("The objective that initiates the alignment.", { minLength: 1 }),
          toObjectiveId: s.string("The objective that receives the alignment.", { minLength: 1 }),
        },
        {
          optional: [],
        },
      ),
      outputSchema: s.object(
        "The created alignment relationship.",
        {
          alignmentId: s.string("The created alignment ID."),
          raw: s.looseRequiredObject(
            "The raw Feishu alignment response.",
            {},
            {
              optional: [],
            },
          ),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "delete_okr_alignment",
      description: "Delete a Feishu OKR objective alignment.",
      requiredScopes: ["okr:okr.content:writeonly"],
      providerPermissions: ["okr:okr.content:writeonly"],
      inputSchema: s.object(
        "Identify the alignment relationship.",
        {
          alignmentId: s.string("The alignment ID to delete.", { minLength: 1 }),
        },
        {
          optional: [],
        },
      ),
      outputSchema: s.object(
        "The alignment deletion result.",
        {
          deleted: s.boolean("Whether the alignment was deleted."),
          alignmentId: s.string("The deleted alignment ID."),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "list_okr_categories",
      description: "List enabled and disabled Feishu OKR categories configured by the tenant.",
      requiredScopes: ["okr:okr.setting:read"],
      providerPermissions: ["okr:okr.setting:read"],
      inputSchema: s.object(
        "Choose the category owner type and configure pagination.",
        {
          ownerType: s.stringEnum("The type of owner whose categories should be listed.", ["user", "department"]),
          pageSize: extendedPageSize,
          pageToken,
        },
        {
          optional: ["ownerType", "pageSize", "pageToken"],
        },
      ),
      outputSchema: categoryPageOutput,
    }),
    ...progressActions(service),
    defineProviderAction(service, {
      name: "reorder_okrs",
      description: "Replace the objective or key-result order with an explicit ID sequence.",
      requiredScopes: ["okr:okr.content:writeonly"],
      providerPermissions: ["okr:okr.content:writeonly"],
      inputSchema: s.object(
        "Describe the desired order.",
        {
          targetType,
          parentId: s.string("The cycle ID or objective ID containing the targets.", {
            minLength: 1,
          }),
          orderedIds: s.array(
            "All target IDs in the desired order.",
            s.string("An objective or key-result ID.", { minLength: 1 }),
            { minItems: 1 },
          ),
        },
        {
          optional: [],
        },
      ),
      outputSchema: s.object(
        "The reorder result.",
        {
          targetType: s.string("The reordered target level."),
          orderedIds: s.array("The applied target order.", s.string("A target ID.")),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "update_okr_weights",
      description: "Replace objective or key-result weights with explicit ID and weight pairs.",
      requiredScopes: ["okr:okr.content:writeonly"],
      providerPermissions: ["okr:okr.content:writeonly"],
      inputSchema: s.object(
        "Describe the desired weights.",
        {
          targetType,
          parentId: s.string("The cycle ID or objective ID containing the targets.", {
            minLength: 1,
          }),
          weights: s.array(
            "Target weights.",
            s.object(
              "One target weight.",
              {
                id: s.string("The objective or key-result ID.", { minLength: 1 }),
                weight: s.number("The target weight."),
              },
              {
                optional: [],
              },
            ),
            { minItems: 1 },
          ),
        },
        {
          optional: [],
        },
      ),
      outputSchema: s.object(
        "The weight update result.",
        {
          targetType: s.string("The updated target level."),
          weights: s.array("The applied weights.", looseItem),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "update_okr_indicator",
      description: "Find the first indicator for an objective or key result and update its current value.",
      requiredScopes: ["okr:okr.content:writeonly"],
      providerPermissions: ["okr:okr.content:writeonly"],
      inputSchema: s.object(
        "Identify the target and set an indicator value.",
        {
          targetType,
          targetId,
          currentValue: s.number("The indicator's new current value."),
        },
        {
          optional: [],
        },
      ),
      outputSchema: s.object(
        "The indicator update result.",
        {
          indicatorId: s.string("The updated indicator ID."),
          currentValue: s.number("The applied indicator value."),
        },
        {
          optional: [],
        },
      ),
    }),
  ];
}
function progressActions(service: string): readonly ActionDefinition[] {
  const baseInput = {
    targetType,
    targetId,
    userIdType,
    departmentIdType,
    pageSize,
    pageToken,
  };
  return [
    defineProviderAction(service, {
      name: "list_okr_progress",
      description: "List progress records for an objective or key result.",
      requiredScopes: ["okr:okr.progress:readonly"],
      providerPermissions: ["okr:okr.progress:readonly"],
      inputSchema: s.object("Identify the target and configure pagination.", baseInput, {
        optional: ["userIdType", "departmentIdType", "pageSize", "pageToken"],
      }),
      outputSchema: pageOutput,
    }),
    defineProviderAction(service, {
      name: "get_okr_progress",
      description: "Get one Feishu OKR progress record.",
      requiredScopes: ["okr:okr.progress:readonly"],
      providerPermissions: ["okr:okr.progress:readonly"],
      inputSchema: s.object(
        "Identify the progress record.",
        {
          progressId: s.string("The progress record ID.", { minLength: 1 }),
          userIdType,
        },
        {
          optional: ["userIdType"],
        },
      ),
      outputSchema: s.object(
        "The requested progress record.",
        { progress: looseItem },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "create_okr_progress",
      description: "Create a progress record for an objective or key result.",
      requiredScopes: ["okr:okr.progress:writeonly"],
      providerPermissions: ["okr:okr.progress:writeonly"],
      inputSchema: s.object(
        "Describe the progress record.",
        {
          targetType,
          targetId,
          ...progressFields,
          sourceTitle: s.string("The source title shown with the progress record."),
          sourceUrl: s.url("The source URL shown with the progress record."),
          userIdType,
        },
        {
          optional: ["percent", "status", "sourceTitle", "sourceUrl", "userIdType"],
        },
      ),
      outputSchema: s.object(
        "The created progress record.",
        { progress: looseItem },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "update_okr_progress",
      description: "Update the content or rate of an OKR progress record.",
      requiredScopes: ["okr:okr.progress:writeonly"],
      providerPermissions: ["okr:okr.progress:writeonly"],
      inputSchema: s.object(
        "Identify and update the progress record.",
        {
          progressId: s.string("The progress record ID.", { minLength: 1 }),
          ...progressFields,
          userIdType,
        },
        {
          optional: ["content", "percent", "status", "userIdType"],
        },
      ),
      outputSchema: s.object(
        "The updated progress record.",
        { progress: looseItem },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "delete_okr_progress",
      description: "Delete a Feishu OKR progress record.",
      requiredScopes: ["okr:okr.progress:delete"],
      providerPermissions: ["okr:okr.progress:delete"],
      inputSchema: s.object(
        "Identify the progress record.",
        {
          progressId: s.string("The progress record ID.", { minLength: 1 }),
        },
        {
          optional: [],
        },
      ),
      outputSchema: s.object(
        "The deletion result.",
        {
          deleted: s.boolean("Whether the progress record was deleted."),
          progressId: s.string("The deleted progress record ID."),
        },
        {
          optional: [],
        },
      ),
    }),
  ];
}
