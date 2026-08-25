import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "genpage";

const workspaceIdSchema = s.integer("The GenPage workspace ID.");
const audienceIdSchema = s.integer("The GenPage audience ID.");
const campaignIdSchema = s.integer("The GenPage campaign ID.");
const leadIdsSchema = s.array("The GenPage lead IDs.", s.integer("A GenPage lead ID."), {
  minItems: 1,
});
const rawObjectSchema = s.looseObject("The object returned by GenPage.");

function workspaceInput(description: string) {
  return s.object(description, { workspace_id: workspaceIdSchema });
}

function rawResultOutput(description: string) {
  return s.object(description, { result: rawObjectSchema });
}

const listWorkspacesAction = defineProviderAction(service, {
  name: "list_workspaces",
  description: "List the GenPage workspaces accessible to the API token.",
  requiredScopes: [],
  inputSchema: s.object("The input for listing GenPage workspaces.", {}),
  outputSchema: s.object("The response from listing GenPage workspaces.", {
    workspaces: s.array("The accessible GenPage workspaces.", rawObjectSchema),
  }),
});

const listWorkspaceVariablesAction = defineProviderAction(service, {
  name: "list_workspace_variables",
  description: "List the default and custom lead variables in a GenPage workspace.",
  requiredScopes: [],
  inputSchema: workspaceInput("The input for listing GenPage workspace variables."),
  outputSchema: s.object("The response from listing GenPage workspace variables.", {
    variables: s.array("The workspace lead variables.", rawObjectSchema),
  }),
});

const getCreditBalanceAction = defineProviderAction(service, {
  name: "get_credit_balance",
  description: "Get the account credit balance and usage for a GenPage workspace.",
  requiredScopes: [],
  inputSchema: workspaceInput("The input for getting a GenPage credit balance."),
  outputSchema: rawResultOutput("The GenPage credit balance response."),
});

const listCampaignsAction = defineProviderAction(service, {
  name: "list_campaigns",
  description: "List campaigns in a GenPage workspace.",
  requiredScopes: [],
  inputSchema: workspaceInput("The input for listing GenPage campaigns."),
  outputSchema: s.object("The response from listing GenPage campaigns.", {
    campaigns: s.array("The GenPage campaigns.", rawObjectSchema),
  }),
});

const createCampaignAction = defineProviderAction(service, {
  name: "create_campaign",
  description: "Create an empty GenPage campaign for a workspace.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input for creating a GenPage campaign.",
    {
      workspace_id: workspaceIdSchema,
      name: s.nonEmptyString("The campaign name."),
      branding_id: s.integer("The branding ID to apply from the GenPage dashboard."),
      prompt: s.nonEmptyString("The prompt used to generate a name when name is omitted."),
    },
    { optional: ["name", "branding_id", "prompt"] },
  ),
  outputSchema: rawResultOutput("The created GenPage campaign response."),
});

const getCampaignAnalyticsAction = defineProviderAction(service, {
  name: "get_campaign_analytics",
  description: "Get visit and click performance metrics for GenPage campaigns.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input for getting GenPage campaign analytics.",
    {
      workspace_id: workspaceIdSchema,
      campaign_ids: s.array("The campaign IDs to include, or omit to include every campaign.", campaignIdSchema, {
        minItems: 1,
      }),
    },
    { optional: ["campaign_ids"] },
  ),
  outputSchema: rawResultOutput("The GenPage campaign analytics response."),
});

const listAudiencesAction = defineProviderAction(service, {
  name: "list_audiences",
  description: "List audiences in a GenPage workspace.",
  requiredScopes: [],
  inputSchema: workspaceInput("The input for listing GenPage audiences."),
  outputSchema: s.object("The response from listing GenPage audiences.", {
    audiences: s.array("The GenPage audiences.", rawObjectSchema),
  }),
});

const createAudienceAction = defineProviderAction(service, {
  name: "create_audience",
  description: "Create a named audience in a GenPage workspace.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input for creating a GenPage audience.",
    {
      workspace_id: workspaceIdSchema,
      name: s.nonEmptyString("The audience name."),
      description: s.string("An optional note describing the audience."),
      color: s.string("An optional dashboard color in hexadecimal notation."),
      lead_ids: leadIdsSchema,
    },
    { optional: ["description", "color", "lead_ids"] },
  ),
  outputSchema: rawResultOutput("The created GenPage audience response."),
});

function audienceLeadInput(description: string) {
  return s.object(description, {
    workspace_id: workspaceIdSchema,
    audience_id: audienceIdSchema,
    lead_ids: leadIdsSchema,
  });
}

const addAudienceLeadsAction = defineProviderAction(service, {
  name: "add_audience_leads",
  description: "Add existing GenPage leads to an audience.",
  requiredScopes: [],
  inputSchema: audienceLeadInput("The input for adding leads to a GenPage audience."),
  outputSchema: rawResultOutput("The GenPage add-audience-leads response."),
});

const removeAudienceLeadsAction = defineProviderAction(service, {
  name: "remove_audience_leads",
  description: "Remove leads from a GenPage audience without deleting the leads.",
  requiredScopes: [],
  inputSchema: audienceLeadInput("The input for removing leads from a GenPage audience."),
  outputSchema: rawResultOutput("The GenPage remove-audience-leads response."),
});

function audienceCampaignInput(description: string) {
  return s.object(description, {
    workspace_id: workspaceIdSchema,
    audience_id: audienceIdSchema,
    campaign_id: campaignIdSchema,
  });
}

const linkAudienceToCampaignAction = defineProviderAction(service, {
  name: "link_audience_to_campaign",
  description: "Link a GenPage audience to a campaign so its leads receive campaign pages.",
  requiredScopes: [],
  inputSchema: audienceCampaignInput("The input for linking a GenPage audience to a campaign."),
  outputSchema: rawResultOutput("The GenPage audience-link response."),
});

const unlinkAudienceFromCampaignAction = defineProviderAction(service, {
  name: "unlink_audience_from_campaign",
  description: "Unlink a GenPage audience from a campaign without deleting leads or pages.",
  requiredScopes: [],
  inputSchema: audienceCampaignInput("The input for unlinking a GenPage audience from a campaign."),
  outputSchema: rawResultOutput("The GenPage audience-unlink response."),
});

const deleteAudienceAction = defineProviderAction(service, {
  name: "delete_audience",
  description: "Delete a GenPage audience while keeping all leads in the workspace.",
  requiredScopes: [],
  inputSchema: s.object("The input for deleting a GenPage audience.", {
    workspace_id: workspaceIdSchema,
    audience_id: audienceIdSchema,
  }),
  outputSchema: rawResultOutput("The GenPage delete-audience response."),
});

export const genpageActions: readonly ActionDefinition[] = [
  listWorkspacesAction,
  listWorkspaceVariablesAction,
  getCreditBalanceAction,
  listCampaignsAction,
  createCampaignAction,
  getCampaignAnalyticsAction,
  listAudiencesAction,
  createAudienceAction,
  addAudienceLeadsAction,
  removeAudienceLeadsAction,
  linkAudienceToCampaignAction,
  unlinkAudienceFromCampaignAction,
  deleteAudienceAction,
];
