import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "sendlane";

const id = (resource: string) => s.positiveInteger(`The Sendlane ${resource} ID.`);
const name = (resource: string) => s.nonEmptyString(`The ${resource} name.`);
const page = s.positiveInteger("The page number to return.");
const limit = s.positiveInteger("The maximum number of records to return per page.");

const list = s.looseObject("A Sendlane list.", {
  id: s.integer("The list ID."),
  name: s.string("The list name."),
  description: s.string("The list description."),
  status: s.string("The list status."),
  created: s.string("When the list was created."),
  flagged: s.string("The list flagged state."),
});
const tag = s.looseObject("A Sendlane tag.", {
  id: s.integer("The tag ID."),
  name: s.string("The tag name."),
  audience_count: s.integer("The number of contacts assigned to the tag."),
  created_at: s.string("When the tag was created."),
});
const campaign = s.looseObject("A Sendlane campaign.", {
  id: s.integer("The campaign ID."),
  name: s.string("The campaign name."),
  status: s.string("The campaign status."),
  scheduled_at: s.string("When the campaign is scheduled."),
  sent_at: s.string("When the campaign was sent."),
  created_at: s.string("When the campaign was created."),
  updated_at: s.string("When the campaign was last updated."),
  automation: s.looseObject("The automation associated with the campaign."),
});
const customField = s.looseObject("A Sendlane custom field.", {
  id: s.string("The custom field ID."),
  name: s.string("The custom field name."),
  type: s.string("The custom field type."),
  created_at: s.string("When the custom field was created."),
});
const links = s.looseObject("Pagination links returned by Sendlane.");
const meta = s.looseObject("Pagination metadata returned by Sendlane.");

const collectionOutput = (description: string, itemDescription: string, itemSchema: JsonSchema) =>
  s.object(
    description,
    {
      data: s.array(itemDescription, itemSchema),
      links,
      meta,
    },
    { optional: ["links", "meta"] },
  );
const resourceOutput = (description: string, resourceSchema: JsonSchema) =>
  s.object(description, { data: resourceSchema });
const acceptedOutput = s.object("The accepted deletion response.", {
  data: s.looseObject("The deletion result returned by Sendlane.", {
    message: s.string("The deletion status message."),
  }),
});

const listCollectionOutput = collectionOutput(
  "The paginated Sendlane list response.",
  "Lists returned by Sendlane.",
  list,
);
const tagCollectionOutput = collectionOutput("The paginated Sendlane tag response.", "Tags returned by Sendlane.", tag);
const campaignCollectionOutput = collectionOutput(
  "The paginated Sendlane campaign response.",
  "Campaigns returned by Sendlane.",
  campaign,
);
const customFieldCollectionOutput = collectionOutput(
  "The paginated Sendlane custom field response.",
  "Custom fields returned by Sendlane.",
  customField,
);

export const sendlaneActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_lists",
    operationType: "read",
    description: "List Sendlane contact lists.",
    requiredScopes: [],
    inputSchema: s.object(
      "Pagination parameters for listing Sendlane lists.",
      { limit, page },
      { optional: ["limit", "page"] },
    ),
    outputSchema: listCollectionOutput,
  }),
  defineProviderAction(service, {
    name: "get_list",
    operationType: "read",
    description: "Get a Sendlane contact list by ID.",
    requiredScopes: [],
    inputSchema: s.object("Input for retrieving a Sendlane list.", { listId: id("list") }),
    outputSchema: resourceOutput("The Sendlane list response.", list),
  }),
  defineProviderAction(service, {
    name: "create_list",
    operationType: "write",
    description: "Create a Sendlane contact list.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for creating a Sendlane list.",
      {
        name: name("list"),
        description: s.string("The list description."),
      },
      { optional: ["description"] },
    ),
    outputSchema: resourceOutput("The created Sendlane list response.", list),
  }),
  defineProviderAction(service, {
    name: "update_list",
    operationType: "write",
    description: "Update a Sendlane contact list.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for updating a Sendlane list.",
      {
        listId: id("list"),
        name: name("list"),
        description: s.string("The list description."),
      },
      { optional: ["description"] },
    ),
    outputSchema: resourceOutput("The updated Sendlane list response.", list),
  }),
  defineProviderAction(service, {
    name: "delete_list",
    operationType: "destructive",
    description: "Delete a Sendlane contact list by ID.",
    requiredScopes: [],
    inputSchema: s.object("Input for deleting a Sendlane list.", { listId: id("list") }),
    outputSchema: acceptedOutput,
  }),
  defineProviderAction(service, {
    name: "list_tags",
    operationType: "read",
    description: "List Sendlane contact tags.",
    requiredScopes: [],
    inputSchema: s.object("Input for listing Sendlane tags.", {}),
    outputSchema: tagCollectionOutput,
  }),
  defineProviderAction(service, {
    name: "get_tag",
    operationType: "read",
    description: "Get a Sendlane contact tag by ID.",
    requiredScopes: [],
    inputSchema: s.object("Input for retrieving a Sendlane tag.", { tagId: id("tag") }),
    outputSchema: resourceOutput("The Sendlane tag response.", tag),
  }),
  defineProviderAction(service, {
    name: "create_tag",
    operationType: "write",
    description: "Create a Sendlane contact tag.",
    requiredScopes: [],
    inputSchema: s.object("Input for creating a Sendlane tag.", { name: name("tag") }),
    outputSchema: resourceOutput("The created Sendlane tag response.", tag),
  }),
  defineProviderAction(service, {
    name: "update_tag",
    operationType: "write",
    description: "Update a Sendlane contact tag.",
    requiredScopes: [],
    inputSchema: s.object("Input for updating a Sendlane tag.", {
      tagId: id("tag"),
      name: name("tag"),
    }),
    outputSchema: resourceOutput("The updated Sendlane tag response.", tag),
  }),
  defineProviderAction(service, {
    name: "delete_tag",
    operationType: "destructive",
    description: "Delete a Sendlane contact tag by ID.",
    requiredScopes: [],
    inputSchema: s.object("Input for deleting a Sendlane tag.", { tagId: id("tag") }),
    outputSchema: acceptedOutput,
  }),
  defineProviderAction(service, {
    name: "list_campaigns",
    operationType: "read",
    description: "List Sendlane email campaigns.",
    requiredScopes: [],
    inputSchema: s.object("Input for listing Sendlane campaigns.", {}),
    outputSchema: campaignCollectionOutput,
  }),
  defineProviderAction(service, {
    name: "get_campaign",
    operationType: "read",
    description: "Get a Sendlane email campaign by ID.",
    requiredScopes: [],
    inputSchema: s.object("Input for retrieving a Sendlane campaign.", {
      campaignId: id("campaign"),
    }),
    outputSchema: resourceOutput("The Sendlane campaign response.", campaign),
  }),
  defineProviderAction(service, {
    name: "list_custom_fields",
    operationType: "read",
    description: "List Sendlane custom fields.",
    requiredScopes: [],
    inputSchema: s.object(
      "Pagination parameters for listing Sendlane custom fields.",
      { limit, page },
      { optional: ["limit", "page"] },
    ),
    outputSchema: customFieldCollectionOutput,
  }),
  defineProviderAction(service, {
    name: "get_custom_field",
    operationType: "read",
    description: "Get a Sendlane custom field by ID.",
    requiredScopes: [],
    inputSchema: s.object("Input for retrieving a Sendlane custom field.", {
      customFieldId: id("custom field"),
    }),
    outputSchema: resourceOutput("The Sendlane custom field response.", customField),
  }),
  defineProviderAction(service, {
    name: "create_custom_field",
    operationType: "write",
    description: "Create a Sendlane custom field.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for creating a Sendlane custom field.",
      {
        name: name("custom field"),
        type: s.nonEmptyString("The custom field type."),
      },
      { optional: ["type"] },
    ),
    outputSchema: customFieldCollectionOutput,
  }),
  defineProviderAction(service, {
    name: "update_custom_field",
    operationType: "write",
    description: "Update a Sendlane custom field.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for updating a Sendlane custom field.",
      {
        customFieldId: id("custom field"),
        name: name("custom field"),
        type: s.nonEmptyString("The custom field type."),
      },
      { optional: ["type"] },
    ),
    outputSchema: resourceOutput("The updated Sendlane custom field response.", customField),
  }),
];

export type SendlaneActionName = (typeof sendlaneActions)[number]["name"];
