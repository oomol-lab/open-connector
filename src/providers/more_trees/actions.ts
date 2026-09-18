import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "more_trees" as const;

const accountOutputSchema = s.looseRequiredObject(
  "The More Trees account information returned for the connected account.",
  {
    account_name: s.string("The More Trees account name."),
    credit_balance: s.number("The current planting credit balance."),
    forest_name: s.string("The account forest name."),
    forest_slug: s.string("The account forest slug."),
  },
);

const forestTotalsSchema = s.looseRequiredObject(
  "The cumulative planting and carbon statistics for a More Trees forest.",
  {
    trees_planted: s.nonNegativeInteger("The number of trees planted by the forest."),
    trees_gifted: s.nonNegativeInteger("The number of trees gifted by the forest."),
    trees_received: s.nonNegativeInteger("The number of trees received by the forest."),
    co2_captured: s.number("The amount of carbon dioxide captured for the forest."),
    projects_supported: s.nonNegativeInteger("The number of planting projects supported by the forest."),
  },
);

const forestOutputSchema = s.looseRequiredObject("The More Trees forest branding and cumulative impact information.", {
  forest_name: s.string("The forest display name."),
  logo_url: s.nullable(s.string("The forest logo URL when configured.")),
  brand_color: s.nullable(s.string("The forest brand color when configured.")),
  totals: forestTotalsSchema,
});

const treeSchema = s.looseRequiredObject(
  "A tree species available within a More Trees planting project.",
  {
    id: s.positiveInteger("The tree species identifier used by planting requests."),
    name: s.string("The tree species name."),
    description: s.string("The tree species description."),
    tonnes_c02: s.number("The tonnes of carbon dioxide captured by one tree."),
    credits_required: s.number("The number of credits required to plant one tree."),
    default: s.boolean("Whether this is the default tree for the project."),
    tree_image: s.nullable(s.string("The tree image URL when available.")),
  },
  { optional: ["description", "tree_image"] },
);

const projectSchema = s.looseRequiredObject(
  "An active More Trees planting project and its available tree species.",
  {
    id: s.positiveInteger("The project identifier used by planting requests."),
    name: s.string("The project name."),
    description: s.string("The project description."),
    country: s.string("The country where the project operates."),
    project_type: s.string("The project type."),
    supplier_name: s.string("The project supplier name."),
    default: s.boolean("Whether this is the default planting project."),
    project_image: s.nullable(s.string("The project image URL when available.")),
    trees: s.array("The tree species available for this project.", treeSchema),
  },
  { optional: ["description", "project_image"] },
);

const recipientInputSchema = s.object(
  "A recipient who should receive one or more gifted trees.",
  {
    accountCode: s.nonEmptyString(
      "The recipient's More Trees account code. Provide exactly one of accountCode or email.",
    ),
    email: s.email("The recipient's email address. Provide exactly one of email or accountCode."),
    name: s.nonEmptyString("The recipient's name."),
    quantity: s.positiveInteger("The number of trees to gift to this recipient."),
  },
  { optional: ["accountCode", "email"] },
);

const plantTreesInputSchema = s.object(
  "The More Trees request for planting trees for the connected account or gifting trees to recipients.",
  {
    plantForOthers: s.boolean("Whether to gift trees to recipients instead of planting for the connected account."),
    test: s.boolean(
      "Whether to evaluate the request without persisting it or spending planting credits. More Trees defaults this to false.",
    ),
    quantity: s.positiveInteger(
      "The number of trees to plant for the connected account. Required when plantForOthers is false.",
    ),
    projectId: s.positiveInteger(
      "The planting project identifier. More Trees selects the default project when omitted.",
    ),
    treeId: s.positiveInteger("The tree species identifier. More Trees selects the default tree when omitted."),
    recipients: s.array(
      "The recipients who should receive gifted trees. Required when plantForOthers is true.",
      recipientInputSchema,
      { minItems: 1 },
    ),
  },
  { optional: ["test", "quantity", "projectId", "treeId", "recipients"] },
);

const plantedRecipientSchema = s.looseRequiredObject("A recipient confirmed by the More Trees planting response.", {
  account_code: s.string("The recipient's More Trees account code."),
  account_name: s.string("The recipient's More Trees account name."),
  quantity: s.positiveInteger("The number of trees planted for the recipient."),
});

const plantTreesOutputSchema = s.looseRequiredObject(
  "The More Trees planting result and remaining credit balance.",
  {
    test: s.boolean("Whether More Trees evaluated the request in non-persistent test mode."),
    plant_for_others: s.boolean("Whether the request planted trees for recipients instead of the connected account."),
    credits_used: s.number("The number of planting credits used or evaluated."),
    credits_remaining: s.number("The number of planting credits remaining."),
    project_id: s.positiveInteger("The planting project selected by More Trees."),
    tree_id: s.positiveInteger("The tree species selected by More Trees."),
    recipients: s.array("The recipients confirmed for a gifted-tree request.", plantedRecipientSchema),
  },
  { optional: ["plant_for_others", "recipients"] },
);

export const moreTreesActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account",
    operationType: "read",
    description:
      "Get account identity, planting credit balance, and forest identifiers for the connected More Trees account.",
    inputSchema: s.requiredObject("The request for the connected More Trees account.", {}),
    outputSchema: accountOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_forest",
    operationType: "read",
    description: "Get More Trees forest branding and cumulative planting and carbon statistics.",
    inputSchema: s.object(
      "The request for a More Trees forest.",
      {
        forestSlugOrAccountCode: s.nonEmptyString(
          "The forest slug or account code to inspect. Defaults to the connected account code.",
        ),
      },
      { optional: ["forestSlugOrAccountCode"] },
    ),
    outputSchema: forestOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_projects",
    operationType: "read",
    description: "List active More Trees planting projects and the tree species available within each project.",
    inputSchema: s.requiredObject("The request for active More Trees planting projects.", {}),
    outputSchema: s.array("The active planting projects returned by More Trees.", projectSchema),
  }),
  defineProviderAction(service, {
    name: "plant_trees",
    operationType: "write",
    description:
      "Plant trees for the connected More Trees account or gift trees to recipients, with optional non-persistent test mode.",
    inputSchema: plantTreesInputSchema,
    outputSchema: plantTreesOutputSchema,
  }),
];

export type MoreTreesActionName = "get_account" | "get_forest" | "list_projects" | "plant_trees";
