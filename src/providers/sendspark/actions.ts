import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "sendspark";

const workspaceIdSchema = s.nonEmptyString("The Sendspark workspace identifier.");
const dynamicIdSchema = s.nonEmptyString("The Sendspark dynamic video campaign identifier.");
const looseRecordSchema = s.record(
  "Additional upstream fields returned by Sendspark.",
  s.unknown("An upstream field value."),
);

const campaignSchema = s.looseObject("A Sendspark dynamic video campaign returned by the API.", {
  _id: s.string("The unique campaign record identifier."),
  name: s.string("The dynamic video campaign name."),
  workspace: s.string("The workspace identifier associated with the campaign."),
  status: s.string("The campaign status returned by Sendspark."),
  createdAt: s.string("The timestamp when the campaign was created."),
  campaign_id: s.string("The Sendspark campaign ID when returned by the API."),
  summary: s.looseObject("Processing summary counts returned for the campaign."),
});

const prospectSchema = s.looseObject("A Sendspark prospect returned by the dynamic campaign API.", {
  contactEmail: s.email("The prospect email address."),
  contactName: s.string("The prospect full name when returned by Sendspark."),
  backgroundUrl: s.string("The background image URL used for the dynamic video."),
  status: s.string("The current prospect processing status."),
  valid: s.boolean("Whether Sendspark considers the prospect data valid."),
  createdAt: s.string("The timestamp when the prospect was created."),
  updatedAt: s.string("The timestamp when the prospect was last updated."),
  id: s.string("The prospect identifier returned by Sendspark."),
  _id: s.string("The internal prospect identifier returned by Sendspark."),
  shareUrl: s.string("The public share URL for the completed video."),
  embedUrl: s.string("The embeddable URL for the completed video."),
  company: s.string("The prospect company name."),
  jobTitle: s.string("The prospect job title."),
});

const paginationSchema = s.looseObject("Pagination metadata returned by Sendspark.", {
  limit: s.nullableInteger("The page size returned by Sendspark."),
  offset: s.nullableInteger("The page offset returned by Sendspark."),
  total: s.nullableInteger("The total result count returned by Sendspark."),
  raw: looseRecordSchema,
});

const linksSchema = s.looseObject("Pagination links returned by Sendspark.", {
  next: s.nullable(s.unknown("The next page link or link metadata returned by Sendspark.")),
  previous: s.nullable(s.unknown("The previous page link or link metadata returned by Sendspark.")),
});

const prospectInputSchema = s.object(
  "Prospect fields used to create a Sendspark dynamic video.",
  {
    contactName: s.nonEmptyString("The full name of the prospect."),
    contactEmail: s.email("The email address of the prospect."),
    backgroundUrl: s.url("The background image URL to use in the personalized video."),
    company: s.nonEmptyString("The company name of the prospect."),
    jobTitle: s.nonEmptyString("The job title of the prospect."),
  },
  { optional: ["backgroundUrl", "company", "jobTitle"] },
);

const prospectDepurationConfigSchema = s.object(
  "Duplicate handling settings used when adding a Sendspark prospect.",
  {
    payloadDepurationStrategy: s.stringEnum("How Sendspark should resolve duplicate prospect payload entries.", [
      "keep-first-valid",
      "keep-last-valid",
    ]),
    forceCreation: s.boolean("Whether Sendspark should create the prospect despite duplicates."),
  },
  { optional: ["forceCreation"] },
);

export const sendsparkActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_dynamic_campaigns",
    description: "List Sendspark dynamic video campaigns in a workspace with optional pagination and search filters.",
    inputSchema: s.actionInput(
      {
        workspaceId: workspaceIdSchema,
        limit: s.integer("Number of campaigns per page. Sendspark supports a maximum of 20.", {
          minimum: 1,
          maximum: 20,
        }),
        offset: s.integer("The 1-based pagination offset.", { minimum: 1 }),
        search: s.nonEmptyString("Search campaigns by campaign name."),
        filters: s.nonEmptyString("Filter campaigns by creator ID."),
      },
      ["workspaceId"],
      "Input parameters for listing Sendspark dynamic video campaigns.",
    ),
    outputSchema: s.actionOutput(
      {
        campaigns: s.array("The campaigns returned by Sendspark.", campaignSchema),
        pagination: paginationSchema,
        links: linksSchema,
        raw: looseRecordSchema,
      },
      "A page of Sendspark dynamic video campaigns.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_dynamic_campaign",
    description: "Get one Sendspark dynamic video campaign by workspace and campaign ID.",
    inputSchema: s.actionInput(
      {
        workspaceId: workspaceIdSchema,
        dynamicId: dynamicIdSchema,
      },
      ["workspaceId", "dynamicId"],
      "Input parameters for getting a Sendspark dynamic campaign.",
    ),
    outputSchema: s.actionOutput(
      {
        campaign: campaignSchema,
        raw: looseRecordSchema,
      },
      "A Sendspark dynamic video campaign response.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_dynamic_campaign",
    description: "Create a Sendspark dynamic video campaign in a workspace.",
    inputSchema: s.actionInput(
      {
        workspaceId: workspaceIdSchema,
        name: s.nonEmptyString("The unique campaign name within the workspace."),
      },
      ["workspaceId", "name"],
      "Input parameters for creating a Sendspark dynamic campaign.",
    ),
    outputSchema: s.actionOutput(
      {
        campaign: campaignSchema,
        raw: looseRecordSchema,
      },
      "The created Sendspark dynamic video campaign response.",
    ),
  }),
  defineProviderAction(service, {
    name: "add_prospect",
    description: "Add a prospect to a Sendspark dynamic video campaign.",
    inputSchema: s.actionInput(
      {
        workspaceId: workspaceIdSchema,
        dynamicId: dynamicIdSchema,
        processAndAuthorizeCharge: s.boolean(
          "Whether to acknowledge and authorize charges associated with processing this prospect.",
        ),
        prospect: prospectInputSchema,
        prospectDepurationConfig: prospectDepurationConfigSchema,
      },
      ["workspaceId", "dynamicId", "processAndAuthorizeCharge", "prospect"],
      "Input parameters for adding a prospect to a Sendspark dynamic campaign.",
    ),
    outputSchema: s.actionOutput(
      {
        prospects: s.array("The prospect records returned by Sendspark.", prospectSchema),
        raw: looseRecordSchema,
      },
      "The Sendspark prospect creation response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_prospect_by_email",
    description:
      "Get Sendspark prospect data by email for a dynamic campaign, including generated video URLs when available.",
    inputSchema: s.actionInput(
      {
        workspaceId: workspaceIdSchema,
        dynamicId: dynamicIdSchema,
        email: s.email("The prospect email address to look up."),
      },
      ["workspaceId", "dynamicId", "email"],
      "Input parameters for getting a Sendspark prospect by email.",
    ),
    outputSchema: s.actionOutput(
      {
        prospect: prospectSchema,
        raw: looseRecordSchema,
      },
      "A Sendspark prospect lookup response.",
    ),
  }),
];
