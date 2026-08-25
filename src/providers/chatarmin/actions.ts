import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "chatarmin";

const trimmedString = (description: string): JsonSchema => s.string({ description, minLength: 1 });

const pageSchema = s.positiveInteger("The page number for pagination.");
const limitSchema = s.positiveInteger("The number of items to return per page.");
const contactIdSchema = trimmedString("The Chatarmin contact ID or externalId.");
const campaignIdSchema = trimmedString("The Chatarmin campaign ID.");
const flowIdSchema = trimmedString("The Chatarmin flow ID.");
const poolIdSchema = trimmedString("The Chatarmin voucher pool ID.");
const webhookIdSchema = trimmedString("The Chatarmin webhook ID.");
const contactConsentSchema = s.stringEnum("The Chatarmin consent state for the contact.", [
  "none",
  "optedOut",
  "transactional",
  "single",
  "double",
]);
const groupBySchema = s.stringEnum("The analytics grouping period.", ["day", "month"]);
const messageTypeSchema = s.stringEnum("The WhatsApp message type to send.", [
  "text",
  "image",
  "video",
  "document",
  "template",
]);
const webhookTopicSchema = s.stringEnum("The Chatarmin webhook topic.", [
  "contact/updated",
  "contact/created",
  "flow/enrolled",
  "contact/deleted",
  "message/updated",
  "error/occurred",
]);

const customPropertiesSchema = s.record(
  "Custom contact properties keyed by Chatarmin property name.",
  s.unknown("A custom property value accepted by Chatarmin."),
);
const templateMediaSchema = s.object("Template header media object.", {
  link: s.url("The public URL of the template header media."),
});
const templateParameterSchema = s.object(
  "A single WhatsApp template parameter value.",
  {
    type: s.stringEnum("The template parameter type.", ["text", "image", "video", "document"]),
    text: trimmedString("The text value for a text parameter."),
    image: templateMediaSchema,
    video: templateMediaSchema,
    document: templateMediaSchema,
  },
  { optional: ["text", "image", "video", "document"] },
);
const templateComponentSchema = s.object(
  "A WhatsApp template component with runtime parameters.",
  {
    type: s.stringEnum("The template component section.", ["header", "body", "button"]),
    sub_type: s.stringEnum("The button subtype when the component type is button.", ["url", "quick_reply"]),
    index: trimmedString("The zero-based template button index when type is button."),
    parameters: s.array("The runtime values to substitute into the template component.", templateParameterSchema, {
      minItems: 1,
    }),
  },
  { optional: ["sub_type", "index"] },
);
const contactInputFields = {
  phone: trimmedString("The contact phone number in international format."),
  email: s.email("The contact email address."),
  firstname: trimmedString("The contact first name."),
  lastname: trimmedString("The contact last name."),
  consent: contactConsentSchema,
  externalId: trimmedString("An external identifier to store on the contact."),
  properties: customPropertiesSchema,
};
const contactUpdateInputSchema = s.object(
  "Input for updating a Chatarmin contact.",
  {
    contactId: contactIdSchema,
    ...contactInputFields,
  },
  {
    optional: ["phone", "email", "firstname", "lastname", "consent", "externalId", "properties"],
  },
);
contactUpdateInputSchema.anyOf = Object.keys(contactInputFields).map((field) => ({ required: [field] }));

const sendMessageInputSchema = s.object(
  "Input for sending a WhatsApp message through Chatarmin. Provide exactly one of phone, email, or contactId.",
  {
    phone: trimmedString("The recipient phone number in international format."),
    email: s.email("The recipient email address used to look up the contact."),
    contactId: trimmedString("The Chatarmin contact ID or externalId of the recipient."),
    type: messageTypeSchema,
    text: trimmedString("The message body text. Required when type is text."),
    mediaUrl: s.url("The publicly accessible media URL. Required for image, video, and document messages."),
    caption: trimmedString("An optional media caption. Chatarmin supports captions up to 1024 characters."),
    fileName: trimmedString("An optional file name for document messages."),
    templateName: trimmedString("The exact approved WhatsApp template name."),
    language: trimmedString("The WhatsApp template language code approved for the template."),
    components: s.array("Template components used to fill dynamic template placeholders.", templateComponentSchema, {
      minItems: 1,
    }),
  },
  {
    optional: [
      "phone",
      "email",
      "contactId",
      "text",
      "mediaUrl",
      "caption",
      "fileName",
      "templateName",
      "language",
      "components",
    ],
  },
);
sendMessageInputSchema.oneOf = [{ required: ["phone"] }, { required: ["email"] }, { required: ["contactId"] }];
sendMessageInputSchema.allOf = [
  {
    if: { properties: { type: { const: "text" } }, required: ["type"] },
    then: { required: ["text"] },
  },
  {
    if: { properties: { type: { enum: ["image", "video", "document"] } }, required: ["type"] },
    then: { required: ["mediaUrl"] },
  },
  {
    if: { properties: { type: { const: "template" } }, required: ["type"] },
    then: { required: ["templateName", "language"] },
  },
];

const reminderSchema = s.object(
  "Low-voucher email reminder settings.",
  {
    reminderThreshold: s.positiveInteger("The remaining voucher count that triggers reminder emails."),
    reminderEmailAdresses: s.array(
      "Email addresses to notify when the reminder threshold is reached.",
      s.email("An email address to notify."),
      { minItems: 1 },
    ),
  },
  { optional: ["reminderThreshold", "reminderEmailAdresses"] },
);
const emptyOptionsSchema = s.object(
  "Behavior settings for an empty voucher pool.",
  {
    emptyMessage: trimmedString("Fallback text sent when the voucher pool is empty."),
    doNotSendWhenEmpty: s.boolean("Whether Chatarmin should skip sending when the pool is empty."),
  },
  { optional: ["emptyMessage", "doNotSendWhenEmpty"] },
);
const voucherCodesSchema = s.array(
  "Voucher code strings to add to the pool.",
  trimmedString("A voucher code string."),
  {
    minItems: 1,
  },
);
const voucherPoolInputFields = {
  poolName: trimmedString("The display name of the voucher pool."),
  vouchers: voucherCodesSchema,
  reuseCodes: s.boolean("Whether contacts who already received a code should get the same code again."),
  reminder: reminderSchema,
  emptyOptions: emptyOptionsSchema,
};
const updateVoucherPoolInputSchema = s.object(
  "Input for updating an existing Chatarmin voucher pool.",
  {
    poolId: poolIdSchema,
    ...voucherPoolInputFields,
  },
  { optional: ["poolName", "vouchers", "reuseCodes", "reminder", "emptyOptions"] },
);
updateVoucherPoolInputSchema.anyOf = Object.keys(voucherPoolInputFields).map((field) => ({ required: [field] }));

const addOrReplaceVoucherCodesInputSchema = s.object(
  "Input for adding voucher codes or replacing an unused voucher code.",
  {
    poolId: poolIdSchema,
    codes: voucherCodesSchema,
    replaceCode: s.object("An unused voucher code replacement.", {
      id: trimmedString("The ID of the existing voucher code to replace."),
      newCode: trimmedString("The replacement voucher code string."),
    }),
  },
  { optional: ["codes", "replaceCode"] },
);
addOrReplaceVoucherCodesInputSchema.anyOf = [{ required: ["codes"] }, { required: ["replaceCode"] }];

const updateWebhookInputSchema = s.object(
  "Input for updating an existing Chatarmin webhook.",
  {
    webhookId: webhookIdSchema,
    url: s.url("The webhook target URL."),
    topic: webhookTopicSchema,
  },
  { optional: ["url", "topic"] },
);
updateWebhookInputSchema.anyOf = [{ required: ["url"] }, { required: ["topic"] }];

const paginationOutputSchema = s.looseObject("Pagination metadata returned by Chatarmin.", {
  page: s.integer("The current page number returned by Chatarmin."),
  limit: s.integer("The page size returned by Chatarmin."),
  total: s.integer("The total number of matching records returned by Chatarmin."),
  totalPages: s.integer("The total number of pages returned by Chatarmin."),
});
const contactOutputSchema = s.looseObject("A Chatarmin contact object.", {
  id: s.string("The Chatarmin contact ID."),
  phone: s.string("The contact phone number."),
  email: s.string("The contact email address."),
  firstname: s.string("The contact first name."),
  lastname: s.string("The contact last name."),
  consent: s.string("The contact consent state."),
  externalId: s.string("The contact external identifier."),
});
const campaignOutputSchema = s.looseObject("A Chatarmin campaign analytics object.");
const flowOutputSchema = s.looseObject("A Chatarmin flow analytics object.");
const voucherPoolOutputSchema = s.looseObject("A Chatarmin voucher pool object.");
const webhookOutputSchema = s.looseObject("A Chatarmin webhook object.");
const messageOutputSchema = s.looseObject("The Chatarmin send message response.");
const deletionOutputSchema = s.object("The result of a successful Chatarmin deletion request.", {
  success: s.boolean("Whether the delete request succeeded."),
});
const listContactsOutputSchema = s.object("A page of Chatarmin contacts.", {
  data: s.array("The contacts returned by Chatarmin.", contactOutputSchema),
  pagination: s.nullable(paginationOutputSchema),
});
const listCampaignsOutputSchema = s.object("A page of Chatarmin campaigns.", {
  data: s.array("The campaigns returned by Chatarmin.", campaignOutputSchema),
  pagination: s.nullable(paginationOutputSchema),
});
const listFlowsOutputSchema = s.object("A page of Chatarmin flows.", {
  data: s.array("The flows returned by Chatarmin.", flowOutputSchema),
  pagination: s.nullable(paginationOutputSchema),
});
const listVoucherPoolsOutputSchema = s.object("A page of Chatarmin voucher pools.", {
  data: s.array("The voucher pools returned by Chatarmin.", voucherPoolOutputSchema),
  pagination: s.nullable(paginationOutputSchema),
});

export const chatarminActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_contacts",
    description: "Retrieve a paginated list of Chatarmin contacts with optional text search.",
    inputSchema: s.object(
      "Input for listing Chatarmin contacts.",
      {
        page: pageSchema,
        limit: limitSchema,
        search: trimmedString(
          "Optional search text matched by Chatarmin against firstname, lastname, email, and phone.",
        ),
      },
      { optional: ["page", "limit", "search"] },
    ),
    outputSchema: listContactsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_contact",
    description: "Retrieve one Chatarmin contact by contact ID or externalId.",
    inputSchema: s.object(
      "Input for retrieving one Chatarmin contact.",
      {
        contactId: contactIdSchema,
      },
      { required: ["contactId"] },
    ),
    outputSchema: s.object("The retrieved Chatarmin contact.", {
      contact: contactOutputSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_contact",
    description: "Create a new Chatarmin contact.",
    inputSchema: s.object("Input for creating a Chatarmin contact.", contactInputFields, {
      optional: ["email", "lastname", "externalId", "properties"],
    }),
    outputSchema: s.object("The created Chatarmin contact.", {
      contact: contactOutputSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_contact",
    description: "Update an existing Chatarmin contact by contact ID or externalId.",
    inputSchema: contactUpdateInputSchema,
    outputSchema: s.object("The updated Chatarmin contact.", {
      contact: contactOutputSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_contact",
    description: "Delete a Chatarmin contact by contact ID or externalId.",
    inputSchema: s.object(
      "Input for deleting a Chatarmin contact.",
      {
        contactId: contactIdSchema,
      },
      { required: ["contactId"] },
    ),
    outputSchema: deletionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "send_message",
    description: "Send a WhatsApp text, media, document, or template message to a Chatarmin contact.",
    inputSchema: sendMessageInputSchema,
    outputSchema: s.object("The Chatarmin message send result.", {
      message: messageOutputSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_campaigns",
    description: "Retrieve a paginated list of Chatarmin campaigns with optional day or month metrics.",
    inputSchema: s.object(
      "Input for listing Chatarmin campaigns.",
      {
        page: pageSchema,
        limit: limitSchema,
        groupBy: groupBySchema,
        startDate: s.date("The start date for grouped campaign metrics."),
        endDate: s.date("The end date for grouped campaign metrics."),
      },
      { optional: ["page", "limit", "groupBy", "startDate", "endDate"] },
    ),
    outputSchema: listCampaignsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_campaign",
    description: "Retrieve one Chatarmin campaign by campaign ID.",
    inputSchema: s.object(
      "Input for retrieving one Chatarmin campaign.",
      {
        campaignId: campaignIdSchema,
      },
      { required: ["campaignId"] },
    ),
    outputSchema: s.object("The retrieved Chatarmin campaign.", {
      campaign: campaignOutputSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_flows",
    description: "Retrieve a paginated list of Chatarmin flows with optional day or month metrics.",
    inputSchema: s.object(
      "Input for listing Chatarmin flows.",
      {
        page: pageSchema,
        limit: limitSchema,
        groupBy: groupBySchema,
        startDate: s.date("The start date for grouped flow metrics."),
        endDate: s.date("The end date for grouped flow metrics."),
      },
      { optional: ["page", "limit", "groupBy", "startDate", "endDate"] },
    ),
    outputSchema: listFlowsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_flow",
    description: "Retrieve one Chatarmin flow by flow ID.",
    inputSchema: s.object(
      "Input for retrieving one Chatarmin flow.",
      {
        flowId: flowIdSchema,
      },
      { required: ["flowId"] },
    ),
    outputSchema: s.object("The retrieved Chatarmin flow.", {
      flow: flowOutputSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_flow_analytics",
    description: "Retrieve paginated Chatarmin flow analytics for a flow.",
    inputSchema: s.object(
      "Input for retrieving paginated Chatarmin flow analytics.",
      {
        flowId: flowIdSchema,
        page: pageSchema,
        limit: limitSchema,
        start: s.dateTime("The analytics start timestamp in ISO 8601 format."),
        end: s.dateTime("The analytics end timestamp in ISO 8601 format."),
      },
      { optional: ["page", "limit", "start", "end"] },
    ),
    outputSchema: s.object("A page of Chatarmin flow analytics.", {
      data: s.array(
        "The flow analytics records returned by Chatarmin.",
        s.looseObject("A Chatarmin flow analytics record."),
      ),
      pagination: s.nullable(paginationOutputSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_flow_contact_analytics",
    description: "Retrieve Chatarmin flow analytics for specific contacts.",
    inputSchema: s.object(
      "Input for retrieving Chatarmin flow analytics for specific contacts.",
      {
        flowId: flowIdSchema,
        contactIds: s.array("Contact IDs to fetch analytics for.", trimmedString("A Chatarmin contact ID."), {
          minItems: 1,
        }),
        start: s.dateTime("The analytics start timestamp in ISO 8601 format."),
        end: s.dateTime("The analytics end timestamp in ISO 8601 format."),
      },
      { optional: ["start", "end"] },
    ),
    outputSchema: s.object("Chatarmin flow analytics keyed by contact ID.", {
      data: s.record(
        "Flow analytics keyed by Chatarmin contact ID.",
        s.looseObject("Analytics for one Chatarmin contact in the flow."),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "list_voucher_pools",
    description: "Retrieve a paginated list of Chatarmin voucher pools with voucher codes.",
    inputSchema: s.object(
      "Input for listing Chatarmin voucher pools.",
      {
        page: pageSchema,
        limit: limitSchema,
      },
      { optional: ["page", "limit"] },
    ),
    outputSchema: listVoucherPoolsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_voucher_pool",
    description: "Retrieve one Chatarmin voucher pool by voucher pool ID.",
    inputSchema: s.object(
      "Input for retrieving one Chatarmin voucher pool.",
      {
        poolId: poolIdSchema,
      },
      { required: ["poolId"] },
    ),
    outputSchema: s.object("The retrieved Chatarmin voucher pool.", {
      voucherPool: voucherPoolOutputSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_voucher_pool",
    description: "Create a Chatarmin voucher pool with an initial list of voucher codes.",
    inputSchema: s.object("Input for creating a Chatarmin voucher pool.", voucherPoolInputFields, {
      optional: ["reuseCodes", "reminder", "emptyOptions"],
    }),
    outputSchema: s.object("The created Chatarmin voucher pool.", {
      voucherPool: voucherPoolOutputSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_voucher_pool",
    description: "Update a Chatarmin voucher pool's name, settings, or unused voucher codes.",
    inputSchema: updateVoucherPoolInputSchema,
    outputSchema: s.object("The updated Chatarmin voucher pool.", {
      voucherPool: voucherPoolOutputSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "add_or_replace_voucher_codes",
    description: "Add new voucher codes to a Chatarmin pool or replace one unused code.",
    inputSchema: addOrReplaceVoucherCodesInputSchema,
    outputSchema: s.object("The Chatarmin voucher code update result.", {
      added: s.array("Voucher codes added by Chatarmin.", s.looseObject("A Chatarmin voucher code object.")),
      raw: s.looseObject("The raw Chatarmin voucher code update response."),
    }),
  }),
  defineProviderAction(service, {
    name: "remove_voucher_code",
    description: "Remove one unused voucher code from a Chatarmin voucher pool.",
    inputSchema: s.object(
      "Input for removing one Chatarmin voucher code.",
      {
        poolId: poolIdSchema,
        code: trimmedString("The voucher code string to remove."),
      },
      { required: ["poolId", "code"] },
    ),
    outputSchema: deletionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_voucher_pool",
    description: "Delete a Chatarmin voucher pool and its unused voucher codes.",
    inputSchema: s.object(
      "Input for deleting a Chatarmin voucher pool.",
      {
        poolId: poolIdSchema,
      },
      { required: ["poolId"] },
    ),
    outputSchema: deletionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_webhooks",
    description: "Retrieve all Chatarmin webhooks for the authenticated user.",
    inputSchema: s.object("Input for listing Chatarmin webhooks.", {}),
    outputSchema: s.object("Chatarmin webhooks for the authenticated user.", {
      webhooks: s.array("The webhooks returned by Chatarmin.", webhookOutputSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "create_webhook",
    description: "Create a Chatarmin webhook for one supported topic.",
    inputSchema: s.object("Input for creating a Chatarmin webhook.", {
      url: s.url("The webhook target URL."),
      topic: webhookTopicSchema,
    }),
    outputSchema: s.object("The created Chatarmin webhook.", {
      webhook: webhookOutputSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_webhook",
    description: "Update a Chatarmin webhook URL or topic.",
    inputSchema: updateWebhookInputSchema,
    outputSchema: s.object("The updated Chatarmin webhook.", {
      webhook: webhookOutputSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_webhook",
    description: "Delete a Chatarmin webhook by webhook ID.",
    inputSchema: s.object(
      "Input for deleting a Chatarmin webhook.",
      {
        webhookId: webhookIdSchema,
      },
      { required: ["webhookId"] },
    ),
    outputSchema: deletionOutputSchema,
  }),
] as const;
