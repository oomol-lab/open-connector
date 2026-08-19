import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "braze";

const sortDirectionSchema = s.stringEnum("The creation-time sort direction to send to Braze.", ["asc", "desc"]);

const listInputSchema = s.object(
  "Filters and paging parameters for a Braze export list endpoint.",
  {
    page: s.nonNegativeInteger("The zero-based Braze page number to return."),
    includeArchived: s.boolean("Whether archived campaigns or Canvases should be included."),
    sortDirection: sortDirectionSchema,
    lastEditedAfter: s.nonEmptyString(
      "Only return items edited after this time, mapped to Braze last_edit.time[gt]. Use Braze's yyyy-MM-DDTHH:mm:ss-compatible timestamp format.",
    ),
  },
  { optional: ["page", "includeArchived", "sortDirection", "lastEditedAfter"] },
);

const detailsFlagsSchema = {
  postLaunchDraftVersion: s.boolean("Whether Braze should return the post-launch draft version when one exists."),
  includeHasTranslatableContent: s.boolean(
    "Whether Braze should include has_translatable_content fields for messages.",
  ),
};

const rawObjectSchema = (description: string) => s.looseObject(description);
const stringArraySchema = (description: string, itemDescription: string) =>
  s.array(description, s.string(itemDescription));

const campaignListItemSchema = s.object(
  "One normalized campaign item returned by Braze.",
  {
    id: s.nonEmptyString("The Braze campaign API identifier."),
    name: s.string("The Braze campaign name."),
    lastEdited: s.string("The last edited timestamp returned by Braze."),
    isApiCampaign: s.boolean("Whether the campaign is an API campaign."),
    tags: stringArraySchema("Tag names associated with the campaign.", "One campaign tag name."),
    raw: rawObjectSchema("The raw Braze campaign list item."),
  },
  { optional: ["name", "lastEdited", "isApiCampaign", "tags"] },
);

const canvasListItemSchema = s.object(
  "One normalized Canvas item returned by Braze.",
  {
    id: s.nonEmptyString("The Braze Canvas API identifier."),
    name: s.string("The Braze Canvas name."),
    lastEdited: s.string("The last edited timestamp returned by Braze."),
    tags: stringArraySchema("Tag names associated with the Canvas.", "One Canvas tag name."),
    raw: rawObjectSchema("The raw Braze Canvas list item."),
  },
  { optional: ["name", "lastEdited", "tags"] },
);

const listCampaignsOutputSchema = s.object(
  "The normalized Braze campaign list response.",
  {
    message: s.string("The Braze response status message."),
    campaigns: s.array("The campaigns returned by Braze.", campaignListItemSchema),
    raw: rawObjectSchema("The raw Braze campaign list response."),
  },
  { optional: ["message"] },
);

const listCanvasesOutputSchema = s.object(
  "The normalized Braze Canvas list response.",
  {
    message: s.string("The Braze response status message."),
    canvases: s.array("The Canvases returned by Braze.", canvasListItemSchema),
    raw: rawObjectSchema("The raw Braze Canvas list response."),
  },
  { optional: ["message"] },
);

const campaignDetailsSchema = s.object(
  "The normalized Braze campaign details response.",
  {
    id: s.nonEmptyString("The Braze campaign API identifier requested by the caller."),
    name: s.string("The Braze campaign name."),
    description: s.nullable(s.string("The Braze campaign description.")),
    createdAt: s.string("The timestamp when the campaign was created."),
    updatedAt: s.string("The timestamp when the campaign was last updated."),
    archived: s.boolean("Whether the campaign is archived."),
    draft: s.boolean("Whether the campaign is a draft."),
    enabled: s.boolean("Whether the campaign is active."),
    hasPostLaunchDraft: s.boolean("Whether the campaign has a post-launch draft."),
    scheduleType: s.string("The campaign schedule type."),
    channels: stringArraySchema("Channels used by the campaign.", "One campaign channel name."),
    firstSent: s.nullable(s.string("The campaign's first sent timestamp.")),
    lastSent: s.nullable(s.string("The campaign's last sent timestamp.")),
    tags: stringArraySchema("Tag names associated with the campaign.", "One campaign tag name."),
    teams: stringArraySchema("Team names associated with the campaign.", "One team name."),
    messages: rawObjectSchema("Raw campaign messages keyed by Braze message variation ID."),
    conversionBehaviors: s.array(
      "Raw campaign conversion behavior objects.",
      rawObjectSchema("One campaign conversion behavior object."),
    ),
    raw: rawObjectSchema("The raw Braze campaign details response."),
  },
  {
    optional: [
      "name",
      "description",
      "createdAt",
      "updatedAt",
      "archived",
      "draft",
      "enabled",
      "hasPostLaunchDraft",
      "scheduleType",
      "channels",
      "firstSent",
      "lastSent",
      "tags",
      "teams",
      "messages",
      "conversionBehaviors",
    ],
  },
);

const canvasDetailsSchema = s.object(
  "The normalized Braze Canvas details response.",
  {
    id: s.nonEmptyString("The Braze Canvas API identifier requested by the caller."),
    name: s.string("The Braze Canvas name."),
    description: s.nullable(s.string("The Braze Canvas description.")),
    createdAt: s.string("The timestamp when the Canvas was created."),
    updatedAt: s.string("The timestamp when the Canvas was last updated."),
    archived: s.boolean("Whether the Canvas is archived."),
    draft: s.boolean("Whether the Canvas is a draft."),
    enabled: s.boolean("Whether the Canvas is active."),
    hasPostLaunchDraft: s.boolean("Whether the Canvas has a post-launch draft."),
    scheduleType: s.string("The Canvas schedule type."),
    firstEntry: s.nullable(s.string("The Canvas first-entry timestamp.")),
    lastEntry: s.nullable(s.string("The Canvas last-entry timestamp.")),
    channels: stringArraySchema("Channels used by the Canvas.", "One Canvas channel name."),
    variants: s.array("Raw Canvas variant objects.", rawObjectSchema("One Canvas variant object.")),
    tags: stringArraySchema("Tag names associated with the Canvas.", "One Canvas tag name."),
    teams: stringArraySchema("Team names associated with the Canvas.", "One team name."),
    steps: s.array("Raw Canvas step objects.", rawObjectSchema("One Canvas step object.")),
    raw: rawObjectSchema("The raw Braze Canvas details response."),
  },
  {
    optional: [
      "name",
      "description",
      "createdAt",
      "updatedAt",
      "archived",
      "draft",
      "enabled",
      "hasPostLaunchDraft",
      "scheduleType",
      "firstEntry",
      "lastEntry",
      "channels",
      "variants",
      "tags",
      "teams",
      "steps",
    ],
  },
);

const getCampaignDetailsOutputSchema = s.object(
  "The Braze campaign details action output.",
  {
    message: s.string("The Braze response status message."),
    campaign: campaignDetailsSchema,
    raw: rawObjectSchema("The raw Braze campaign details response."),
  },
  { optional: ["message"] },
);

const getCanvasDetailsOutputSchema = s.object(
  "The Braze Canvas details action output.",
  {
    message: s.string("The Braze response status message."),
    canvas: canvasDetailsSchema,
    raw: rawObjectSchema("The raw Braze Canvas details response."),
  },
  { optional: ["message"] },
);

export const brazeActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_campaigns",
    description: "List Braze campaigns with optional archived, sort, page, and last-edited filters.",
    requiredScopes: ["campaigns.list"],
    inputSchema: listInputSchema,
    outputSchema: listCampaignsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_campaign_details",
    description: "Fetch Braze metadata and message details for one campaign.",
    requiredScopes: ["campaigns.details"],
    inputSchema: s.object(
      "Input parameters for fetching one Braze campaign details response.",
      {
        campaignId: s.nonEmptyString("The Braze campaign API identifier."),
        ...detailsFlagsSchema,
      },
      { required: ["campaignId"], optional: ["postLaunchDraftVersion", "includeHasTranslatableContent"] },
    ),
    outputSchema: getCampaignDetailsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_canvases",
    description: "List Braze Canvases with optional archived, sort, page, and last-edited filters.",
    requiredScopes: ["canvas.list"],
    inputSchema: listInputSchema,
    outputSchema: listCanvasesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_canvas_details",
    description: "Fetch Braze metadata, variants, steps, and message details for one Canvas.",
    requiredScopes: ["canvas.details"],
    inputSchema: s.object(
      "Input parameters for fetching one Braze Canvas details response.",
      {
        canvasId: s.nonEmptyString("The Braze Canvas API identifier."),
        ...detailsFlagsSchema,
      },
      { required: ["canvasId"], optional: ["postLaunchDraftVersion", "includeHasTranslatableContent"] },
    ),
    outputSchema: getCanvasDetailsOutputSchema,
  }),
];
