import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "lemlist";

const campaignStatusSchema = s.stringEnum("Campaign status filter supported by lemlist.", [
  "running",
  "draft",
  "archived",
  "ended",
  "paused",
  "errors",
]);
const sortOrderSchema = s.stringEnum("Sort direction for campaign listing.", ["asc", "desc"]);

const campaignSchema = s.looseRequiredObject(
  "lemlist campaign summary or detail.",
  {
    _id: s.string("Unique campaign identifier."),
    name: s.string("Campaign name."),
    labels: s.array("Categorization labels.", s.string("Campaign label.")),
    createdAt: s.string("Creation timestamp."),
    createdBy: s.string("Creator user ID."),
    status: s.string("Campaign status returned by lemlist."),
    sequenceId: s.string("Main sequence ID."),
    scheduleIds: s.array("Associated schedule IDs.", s.string("Schedule ID.")),
    teamId: s.string("ID of the team that owns this campaign."),
    hasError: s.boolean("Whether the campaign has errors."),
    errors: s.array("Campaign error messages.", s.string("Campaign error message.")),
    creator: s.looseObject("Campaign creator information.", {
      userId: s.string("Creator user ID."),
      userEmail: s.email("Creator email address."),
    }),
    senders: s.array(
      "Campaign senders configuration.",
      s.looseObject("Campaign sender configuration.", {
        id: s.string("Sender user ID."),
        email: s.email("Sender email address."),
        sendUserMailboxId: s.string("Mailbox ID used for sending."),
      }),
    ),
    raw: s.looseObject("Raw campaign payload returned by lemlist."),
  },
  {
    optional: [
      "labels",
      "createdAt",
      "createdBy",
      "status",
      "sequenceId",
      "scheduleIds",
      "teamId",
      "hasError",
      "errors",
      "creator",
      "senders",
      "raw",
    ],
  },
);

const leadSchema = s.looseRequiredObject(
  "lemlist lead summary.",
  {
    _id: s.string("Unique lead identifier."),
    contactId: s.string("Associated contact identifier."),
    state: s.string("Current lead state."),
    raw: s.looseObject("Raw lead payload returned by lemlist."),
  },
  { optional: ["contactId", "state", "raw"] },
);

const teamSchema = s.looseRequiredObject(
  "lemlist team information.",
  {
    _id: s.string("Unique team identifier."),
    name: s.string("Team name."),
    userIds: s.array("User IDs in this team.", s.string("User ID.")),
    createdBy: s.string("User ID who created the team."),
    createdAt: s.string("Date and time when the team was created."),
    beta: s.array("Beta features enabled for the team.", s.string("Beta feature name.")),
    pictureId: s.string("Team profile picture file ID."),
    customDomain: s.string("Custom domain for the team."),
    raw: s.looseObject("Raw team payload returned by lemlist."),
  },
  {
    optional: ["userIds", "createdBy", "createdAt", "beta", "pictureId", "customDomain", "raw"],
  },
);

export const lemlistActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_team",
    description: "Retrieve information about the lemlist team for the API key.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for retrieving the lemlist team.", {}),
    outputSchema: s.object("lemlist team response.", {
      team: teamSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_campaigns",
    description: "List lemlist campaigns with optional pagination and status filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for listing lemlist campaigns.",
      {
        limit: s.integer("Number of campaigns to retrieve. lemlist allows up to 100.", {
          minimum: 1,
          maximum: 100,
        }),
        offset: s.nonNegativeInteger("Offset from the start for pagination."),
        page: s.integer("Page number to retrieve.", { minimum: 1 }),
        sortBy: s.stringEnum("Field by which to sort campaigns.", ["createdAt"]),
        sortOrder: sortOrderSchema,
        status: campaignStatusSchema,
        createdBy: s.nonEmptyString("Creator user ID used to filter campaigns."),
      },
      { optional: ["limit", "offset", "page", "sortBy", "sortOrder", "status", "createdBy"] },
    ),
    outputSchema: s.object("lemlist campaign list response.", {
      campaigns: s.array("Campaigns returned by lemlist.", campaignSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_campaign",
    description: "Retrieve one lemlist campaign by campaign ID.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for retrieving a lemlist campaign.", {
      campaignId: s.nonEmptyString("Unique identifier of the campaign to retrieve."),
    }),
    outputSchema: s.object("lemlist campaign response.", {
      campaign: campaignSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_campaign_leads",
    description: "List leads from a lemlist campaign with optional state filtering.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for listing leads in a lemlist campaign.",
      {
        campaignId: s.nonEmptyString("Unique identifier of the campaign whose leads should be listed."),
        state: s.nonEmptyString("Lead state filter such as scanned, contacted, or interested."),
        limit: s.integer("Maximum number of leads to return. lemlist allows up to 500.", {
          minimum: 1,
          maximum: 500,
        }),
      },
      { optional: ["state", "limit"] },
    ),
    outputSchema: s.object("lemlist campaign leads response.", {
      leads: s.array("Leads returned by lemlist.", leadSchema),
    }),
  }),
];
