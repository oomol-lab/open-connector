import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "sender";

const pageField = s.positiveInteger("Page number for Sender pagination.");
const limitField = s.positiveInteger("Number of records to return per page.");
const workflowLimitField = s.integer("Number of workflows to return per page (1-100).", {
  minimum: 1,
  maximum: 100,
});

const paginationFields = {
  page: pageField,
  limit: limitField,
};

const linksSchema = s.looseObject("Pagination links returned by Sender.", {
  first: s.nullable(s.string("URL for the first page.")),
  last: s.nullable(s.string("URL for the last page.")),
  prev: s.nullable(s.string("URL for the previous page.")),
  next: s.nullable(s.string("URL for the next page.")),
});

const metaSchema = s.looseObject("Pagination metadata returned by Sender.", {
  current_page: s.integer("The current page number."),
  from: s.nullable(s.integer("The first item number on this page.")),
  last_page: s.integer("The last available page number."),
  path: s.string("The request path reported by Sender."),
  per_page: s.integer("The number of records per page."),
  to: s.nullable(s.integer("The last item number on this page.")),
  total: s.integer("The total number of records."),
});

const senderStatusSchema = s.looseObject("Sender subscriber status details.", {
  email: s.string("The marketing email subscription status."),
  temail: s.string("The transactional email subscription status."),
});

const phoneCountrySchema = s.looseObject("Sender phone country metadata.", {
  phone_code: s.integer("The numeric country calling code."),
  country_code: s.string("The ISO country code."),
});

const subscriberTagSchema = s.looseObject("A Sender group tag attached to a subscriber.", {
  id: s.string("The Sender group ID."),
  title: s.string("The Sender group title."),
});

const subscriberSchema = s.looseObject("A Sender subscriber record.", {
  id: s.string("The Sender subscriber ID."),
  email: s.string("The subscriber email address."),
  firstname: s.string("The subscriber first name."),
  lastname: s.string("The subscriber last name."),
  phone: s.nullable(s.string("The subscriber phone number.")),
  phone_country: s.nullable(phoneCountrySchema),
  created: s.string("When Sender created the subscriber record."),
  status: senderStatusSchema,
  bounced_at: s.nullable(s.string("When the subscriber bounced, when present.")),
  unsubscribed_at: s.nullable(s.string("When the subscriber unsubscribed, when present.")),
  location: s.unknown("Location details returned by Sender, when present."),
  subscriber_tags: s.array("Groups attached to this subscriber.", subscriberTagSchema),
  columns: s.unknown("Custom field values returned by Sender."),
});

const groupSchema = s.looseObject("A Sender group record.", {
  id: s.string("The Sender group ID."),
  title: s.string("The Sender group title."),
  recipient_count: s.integer("Total recipients in the group."),
  active_subscribers: s.integer("Active subscribers in the group."),
  unsubscribed_count: s.integer("Unsubscribed recipients in the group."),
  bounced_count: s.integer("Bounced recipients in the group."),
  phone_count: s.integer("Phone recipients in the group."),
  active_phone_count: s.integer("Active phone recipients in the group."),
  account_id: s.string("The Sender account ID."),
  user_id: s.string("The Sender user ID."),
  created: s.string("When Sender created the group."),
  modified: s.string("When Sender last modified the group."),
  is_recalculating_subscribers: s.boolean("Whether Sender is recalculating group subscribers."),
});

const fieldSchema = s.looseObject("A Sender custom field record.", {
  id: s.nullable(s.string("The Sender field ID, when present.")),
  title: s.string("The custom field title."),
  account_id: s.nullable(s.string("The Sender account ID, when present.")),
  user_id: s.nullable(s.string("The Sender user ID, when present.")),
  created: s.nullable(s.string("When Sender created the field, when present.")),
  modified: s.nullable(s.string("When Sender last modified the field, when present.")),
  type: s.string("The field value type."),
  show: s.nullable(s.integer("Whether Sender displays the field, when present.")),
  field_name: s.string("The Sender template field name."),
  position: s.nullable(s.integer("The field display position, when present.")),
  default: s.boolean("Whether this is a default Sender field."),
});

const campaignSchema = s.looseObject("A Sender campaign record.", {
  id: s.string("The Sender campaign ID."),
  subject: s.string("The campaign subject."),
  reply_to: s.string("The reply-to email address."),
  language: s.string("The campaign language."),
  recipient_count: s.integer("The campaign recipient count."),
  from: s.string("The campaign sender name."),
  schedule_time: s.nullable(s.string("When the campaign is scheduled, when present.")),
  last_action: s.string("The last campaign action recorded by Sender."),
  sent_time: s.nullable(s.string("When the campaign was sent, when present.")),
  status: s.string("The campaign status."),
  created: s.string("When Sender created the campaign."),
  modified: s.string("When Sender last modified the campaign."),
  title: s.string("The campaign title."),
  domain_id: s.string("The Sender sending domain ID."),
  preheader: s.string("The campaign preheader text."),
  opens: s.integer("Total opens reported by Sender."),
  clicks: s.integer("Total clicks reported by Sender."),
  bounces_count: s.integer("Total bounces reported by Sender."),
  sent_count: s.integer("Total sent emails reported by Sender."),
  campaign_groups: s.array("Group IDs targeted by the campaign.", s.string("A Sender group ID.")),
  segments: s.array("Segment IDs targeted by the campaign.", s.string("A Sender segment ID.")),
});

const workflowReportSchema = s.looseObject("Sender workflow report metrics.", {
  sent: s.integer("Number of workflow emails sent."),
  opened: s.integer("Number of workflow emails opened."),
  clicked: s.integer("Number of workflow emails clicked."),
  open_rate: s.number("Workflow open rate."),
  click_rate: s.number("Workflow click rate."),
});

const workflowSchema = s.looseObject("A Sender workflow record.", {
  id: s.string("The Sender workflow ID."),
  user_id: s.integer("The Sender user ID."),
  account_id: s.integer("The Sender account ID."),
  title: s.string("The workflow title."),
  status: s.string("The workflow status."),
  created: s.string("When Sender created the workflow."),
  modified: s.string("When Sender last modified the workflow."),
  emails_sent: s.integer("Number of emails sent by the workflow."),
  type: s.string("The workflow type."),
  description: s.string("The workflow description."),
  thumbnail: s.nullable(s.string("The workflow thumbnail URL, when present.")),
  workflow_category_id: s.integer("The Sender workflow category ID."),
  index_report: workflowReportSchema,
  report: workflowReportSchema,
});

const customFieldsSchema = s.record(
  "Custom field values keyed by Sender field name.",
  s.unknown("A custom field value accepted by Sender."),
);
const subscriberStatusValue = s.stringEnum("A Sender subscriber status value.", [
  "ACTIVE",
  "UNSUBSCRIBED",
  "BOUNCED",
  "SPAM_REPORTED",
]);

const subscriberMutationInputFields = {
  firstname: s.nonEmptyString("The subscriber first name."),
  lastname: s.nonEmptyString("The subscriber last name."),
  groups: s.array("Sender group IDs assigned to the subscriber.", s.nonEmptyString("A Sender group ID."), {
    minItems: 1,
  }),
  fields: customFieldsSchema,
  phone: s.nonEmptyString("The subscriber phone number with country code."),
  trigger_automation: s.boolean("Whether Sender should trigger automations for this change."),
};

const createSubscriberInputSchema = s.object(
  "Input for creating a Sender subscriber.",
  {
    email: s.email("The subscriber email address."),
    ...subscriberMutationInputFields,
  },
  {
    optional: ["firstname", "lastname", "groups", "fields", "phone", "trigger_automation"],
  },
);

const updateSubscriberInputSchema = s.object(
  "Input for updating a Sender subscriber by email, phone number, or ID.",
  {
    identifier: s.nonEmptyString("The subscriber email address, phone number, or Sender ID."),
    ...subscriberMutationInputFields,
    subscriber_status: subscriberStatusValue,
    sms_status: subscriberStatusValue,
    transactional_email_status: subscriberStatusValue,
  },
  {
    optional: [
      "firstname",
      "lastname",
      "groups",
      "fields",
      "phone",
      "trigger_automation",
      "subscriber_status",
      "sms_status",
      "transactional_email_status",
    ],
  },
);

const subscriberMutationOutputSchema = s.object(
  "A Sender subscriber mutation response.",
  {
    success: s.boolean("Whether Sender accepted the subscriber change."),
    message: s.unknown("The message returned by Sender."),
    subscriber: subscriberSchema,
  },
  { optional: ["subscriber"] },
);

const groupMembershipOutputSchema = s.object("A Sender group membership mutation response.", {
  success: s.boolean("Whether Sender accepted the group membership change."),
  message: s.unknown("The message returned by Sender."),
});

const campaignStatusSchema = s.stringEnum("A Sender campaign status filter.", [
  "SCHEDULED",
  "SENDING",
  "SENT",
  "DRAFT",
]);
const workflowStatusSchema = s.stringEnum("A Sender workflow status filter.", ["DRAFT", "ACTIVE", "PAUSED"]);
const subscriberIdentifierInputSchema = s.object(
  "Input for getting one Sender subscriber.",
  {
    identifier: s.nonEmptyString("The subscriber email address, phone number, or Sender ID."),
  },
  { required: ["identifier"] },
);

export const senderActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_subscribers",
    description: "List Sender subscribers with pagination.",
    inputSchema: s.object("Input for listing Sender subscribers.", paginationFields, {
      optional: ["page", "limit"],
    }),
    outputSchema: paginatedOutputSchema("A page of Sender subscribers.", "subscribers", subscriberSchema),
  }),
  defineProviderAction(service, {
    name: "get_subscriber",
    description: "Get one Sender subscriber by email address, phone number, or ID.",
    inputSchema: subscriberIdentifierInputSchema,
    outputSchema: s.object("A Sender subscriber detail response.", {
      subscriber: subscriberSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_subscriber",
    description: "Create a Sender subscriber with optional groups and custom fields.",
    inputSchema: createSubscriberInputSchema,
    outputSchema: subscriberMutationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_subscriber",
    description: "Update a Sender subscriber by email address, phone number, or ID.",
    inputSchema: updateSubscriberInputSchema,
    outputSchema: subscriberMutationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "add_subscribers_to_group",
    description: "Add subscribers or a Sender conditions selection to a group.",
    inputSchema: groupMembershipInputSchema("Input for adding subscribers to a Sender group.", true),
    outputSchema: groupMembershipOutputSchema,
  }),
  defineProviderAction(service, {
    name: "remove_subscribers_from_group",
    description: "Remove subscribers or a Sender conditions selection from a group.",
    inputSchema: groupMembershipInputSchema("Input for removing subscribers from a Sender group.", false),
    outputSchema: groupMembershipOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_groups",
    description: "List Sender groups with pagination.",
    inputSchema: s.object("Input for listing Sender groups.", paginationFields, {
      optional: ["page", "limit"],
    }),
    outputSchema: paginatedOutputSchema("A page of Sender groups.", "groups", groupSchema),
  }),
  defineProviderAction(service, {
    name: "get_group",
    description: "Get one Sender group by ID.",
    inputSchema: idInputSchema("Input for getting one Sender group.", "The Sender group ID."),
    outputSchema: s.object("A Sender group detail response.", {
      group: groupSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_fields",
    description: "List Sender custom subscriber fields with pagination.",
    inputSchema: s.object("Input for listing Sender custom fields.", paginationFields, {
      optional: ["page", "limit"],
    }),
    outputSchema: paginatedOutputSchema("A page of Sender fields.", "fields", fieldSchema),
  }),
  defineProviderAction(service, {
    name: "create_field",
    description: "Create a Sender custom subscriber field.",
    inputSchema: s.object(
      "Input for creating a Sender custom field.",
      {
        title: s.nonEmptyString("The display title of the custom field."),
        type: s.stringEnum("The Sender field type.", ["number", "text", "datetime"]),
      },
      { required: ["title", "type"] },
    ),
    outputSchema: s.object(
      "A Sender field mutation response.",
      {
        success: s.boolean("Whether Sender created the field."),
        message: s.unknown("The message returned by Sender."),
        field: fieldSchema,
      },
      { optional: ["field"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_campaigns",
    description: "List Sender campaigns with pagination and an optional status filter.",
    inputSchema: s.object(
      "Input for listing Sender campaigns.",
      {
        ...paginationFields,
        status: campaignStatusSchema,
      },
      { optional: ["page", "limit", "status"] },
    ),
    outputSchema: paginatedOutputSchema("A page of Sender campaigns.", "campaigns", campaignSchema),
  }),
  defineProviderAction(service, {
    name: "get_campaign",
    description: "Get one Sender campaign by ID.",
    inputSchema: idInputSchema("Input for getting one Sender campaign.", "The Sender campaign ID."),
    outputSchema: s.object("A Sender campaign detail response.", {
      campaign: campaignSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_workflows",
    description: "List Sender automation workflows with pagination and filters.",
    inputSchema: s.object(
      "Input for listing Sender workflows.",
      {
        page: pageField,
        limit: workflowLimitField,
        status: workflowStatusSchema,
        title: s.nonEmptyString("Only return workflows whose title starts with this string."),
      },
      { optional: ["page", "limit", "status", "title"] },
    ),
    outputSchema: paginatedOutputSchema("A page of Sender workflows.", "workflows", workflowSchema),
  }),
  defineProviderAction(service, {
    name: "get_workflow",
    description: "Get one Sender automation workflow by ID.",
    inputSchema: idInputSchema("Input for getting one Sender workflow.", "The Sender workflow ID."),
    outputSchema: s.object("A Sender workflow detail response.", {
      workflow: workflowSchema,
    }),
  }),
];

function paginatedOutputSchema(description: string, key: string, itemSchema: JsonSchema): JsonSchema {
  return s.object(
    description,
    {
      [key]: s.array(`The Sender ${key} returned for this page.`, itemSchema),
      links: linksSchema,
      meta: metaSchema,
      hasMoreResources: s.boolean("Whether Sender reports another page after this one."),
    },
    { optional: ["links", "meta", "hasMoreResources"] },
  );
}

function groupMembershipInputSchema(description: string, includeAutomation: boolean): JsonSchema {
  const properties: Record<string, JsonSchema> = {
    groupId: s.nonEmptyString("The Sender group ID."),
    subscribers: s.array("Email addresses to add or remove from the group.", s.email("A subscriber email address."), {
      minItems: 1,
    }),
    conditions: s.nonEmptyString("Sender conditions expression for selecting subscribers."),
  };
  if (includeAutomation) {
    properties.trigger_automation = s.boolean("Whether Sender should trigger automations for newly added subscribers.");
  }

  return {
    ...s.object(description, properties, {
      optional: includeAutomation ? ["subscribers", "conditions", "trigger_automation"] : ["subscribers", "conditions"],
    }),
    oneOf: [{ required: ["subscribers"] }, { required: ["conditions"] }],
  };
}

function idInputSchema(description: string, fieldDescription: string): JsonSchema {
  return s.object(
    description,
    {
      id: s.nonEmptyString(fieldDescription),
    },
    { required: ["id"] },
  );
}
