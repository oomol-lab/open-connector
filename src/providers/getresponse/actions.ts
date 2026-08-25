import type { ActionDefinition } from "../../core/types.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "getresponse" as const;

const idSchema = s.nonEmptyString("A GetResponse resource identifier.");
const pageSchema = s.integer("The one-based result page to request.", { minimum: 1 });
const perPageSchema = s.integer("The maximum number of results per page.", {
  minimum: 1,
  maximum: 1000,
});
const sortOrderSchema = s.stringEnum("The sort direction.", ["ASC", "DESC"]);
const dateOrDateTimeSchema = s.anyOf("An ISO 8601 date or timestamp.", [
  s.date("An ISO 8601 calendar date."),
  s.dateTime("An ISO 8601 timestamp."),
]);
const ipAddressSchema = s.anyOf("A valid IPv4 or IPv6 address.", [
  s.string("A valid IPv4 address.", { format: "ipv4" }),
  s.string("A valid IPv6 address.", { format: "ipv6" }),
]);

function requireCompleteSort(schema: JsonSchema): JsonSchema {
  return {
    ...schema,
    dependentRequired: {
      sortBy: ["sortOrder"],
      sortOrder: ["sortBy"],
    },
  };
}

const paginationInputFields = {
  page: pageSchema,
  perPage: perPageSchema,
} as const;

const paginationOutputSchema = s.object("Pagination metadata returned by GetResponse.", {
  currentPage: s.nullable(s.integer("The current page reported by GetResponse.")),
  totalPages: s.nullable(s.integer("The total number of result pages reported by GetResponse.")),
  totalCount: s.nullable(s.integer("The total number of matching records reported by GetResponse.")),
});

const campaignSchema = s.object("A normalized GetResponse campaign, also known as a contact list.", {
  campaignId: idSchema,
  name: s.string("The campaign name."),
  languageCode: s.nullable(s.string("The campaign language code when returned by GetResponse.")),
  isDefault: s.nullable(s.boolean("Whether this is the account's default campaign.")),
  createdOn: s.nullable(s.string("The campaign creation timestamp when returned by GetResponse.")),
  raw: s.looseObject("The raw campaign object returned by GetResponse."),
});

const campaignReferenceSchema = s.object("A GetResponse campaign reference.", {
  campaignId: idSchema,
  name: s.nullable(s.string("The campaign name when returned by GetResponse.")),
});

const contactSchema = s.object("A normalized GetResponse contact.", {
  contactId: idSchema,
  email: s.email("The contact email address."),
  name: s.nullable(s.string("The contact name when present.")),
  campaign: s.nullable(campaignReferenceSchema),
  origin: s.nullable(s.string("How the contact was added to GetResponse.")),
  createdOn: s.nullable(s.string("The contact creation timestamp when returned by GetResponse.")),
  changedOn: s.nullable(s.string("The latest contact change timestamp when returned by GetResponse.")),
  raw: s.looseObject("The raw contact object returned by GetResponse."),
});

const newsletterSchema = s.object("A normalized GetResponse newsletter.", {
  newsletterId: idSchema,
  name: s.nullable(s.string("The internal newsletter name when returned by GetResponse.")),
  subject: s.nullable(s.string("The newsletter subject when returned by GetResponse.")),
  type: s.nullable(s.string("The GetResponse newsletter type.")),
  status: s.nullable(s.string("The GetResponse newsletter status.")),
  campaign: s.nullable(campaignReferenceSchema),
  sendOn: s.nullable(s.string("The scheduled or actual send timestamp when returned.")),
  createdOn: s.nullable(s.string("The newsletter creation timestamp when returned.")),
  raw: s.looseObject("The raw newsletter object returned by GetResponse."),
});

const newsletterStatisticSchema = s.object("A normalized GetResponse newsletter statistics row.", {
  timeInterval: s.nullable(s.string("The ISO 8601 time interval represented by this statistics row.")),
  sent: s.nullable(s.integer("The number of messages sent.")),
  totalOpened: s.nullable(s.integer("The total number of message opens.")),
  totalHumanOpened: s.nullable(s.integer("The total number of human message opens.")),
  uniqueOpened: s.nullable(s.integer("The number of contacts who opened the message.")),
  uniqueHumanOpened: s.nullable(s.integer("The number of contacts with a human message open.")),
  totalClicked: s.nullable(s.integer("The total number of tracked-link clicks.")),
  totalHumanClicked: s.nullable(s.integer("The total number of human tracked-link clicks.")),
  uniqueClicked: s.nullable(s.integer("The number of contacts who clicked a tracked link.")),
  uniqueHumanClicked: s.nullable(s.integer("The number of contacts with a human tracked-link click.")),
  goals: s.nullable(s.integer("The total number of completed goals.")),
  uniqueGoals: s.nullable(s.integer("The number of contacts who completed a goal.")),
  forwarded: s.nullable(s.integer("The number of message forwards.")),
  unsubscribed: s.nullable(s.integer("The number of unsubscribes.")),
  bounced: s.nullable(s.integer("The number of bounced messages.")),
  complaints: s.nullable(s.integer("The number of spam complaints.")),
  raw: s.looseObject("The raw newsletter statistics row returned by GetResponse."),
});

const contactTagInputSchema = s.object("A tag to assign to a GetResponse contact.", {
  tagId: idSchema,
});

const contactCustomFieldInputSchema = s.object("A custom field value to assign to a GetResponse contact.", {
  customFieldId: idSchema,
  values: s.array("The values to assign to the custom field.", s.string("A custom field value.")),
});

const contactSharedWritableFields = {
  email: s.email("The contact email address."),
  name: s.nonWhitespaceString("The contact name.", { maxLength: 128 }),
  campaignId: idSchema,
  dayOfCycle: s.nullable(
    s.nonWhitespaceString("The autoresponder cycle day, or null to remove the contact from the cycle."),
  ),
  scoring: s.nullable(s.number("The contact score, or null to remove the score.")),
  tags: s.array("Tags that replace the contact's current tag assignments.", contactTagInputSchema),
  customFields: s.array(
    "Custom fields that replace the contact's current custom field assignments.",
    contactCustomFieldInputSchema,
  ),
} as const;

const listCampaignsAction = defineProviderAction(service, {
  name: "list_campaigns",
  description: "List GetResponse campaigns, which represent contact lists.",
  requiredScopes: [],
  inputSchema: requireCompleteSort(
    s.object(
      "Filters and pagination for listing GetResponse campaigns.",
      {
        name: s.nonEmptyString("Filter campaigns by name."),
        isDefault: s.boolean("Filter campaigns by default-list status."),
        sortBy: s.stringEnum("The campaign field to sort by.", ["name", "createdOn"]),
        sortOrder: sortOrderSchema,
        ...paginationInputFields,
      },
      { optional: ["name", "isDefault", "sortBy", "sortOrder", "page", "perPage"] },
    ),
  ),
  outputSchema: s.object("The normalized GetResponse campaign list response.", {
    campaigns: s.array("Campaigns returned by GetResponse.", campaignSchema),
    pagination: paginationOutputSchema,
  }),
});

const getCampaignAction = defineProviderAction(service, {
  name: "get_campaign",
  description: "Retrieve one GetResponse campaign by ID.",
  requiredScopes: [],
  inputSchema: s.object("The campaign to retrieve.", {
    campaignId: idSchema,
  }),
  outputSchema: s.object("The normalized GetResponse campaign response.", {
    campaign: campaignSchema,
  }),
});

const createCampaignAction = defineProviderAction(service, {
  name: "create_campaign",
  description: "Create a GetResponse campaign for organizing contacts.",
  requiredScopes: [],
  inputSchema: s.object(
    "The new GetResponse campaign fields.",
    {
      name: s.string("A unique campaign name between 3 and 64 characters.", {
        minLength: 3,
        maxLength: 64,
      }),
      languageCode: s.nonEmptyString("The campaign language code, such as EN."),
      apiOptIn: s.stringEnum("The opt-in mode for contacts added through the API.", ["single", "double"]),
    },
    { optional: ["languageCode", "apiOptIn"] },
  ),
  outputSchema: s.object("The normalized GetResponse campaign creation response.", {
    campaign: campaignSchema,
  }),
});

const updateCampaignInputSchema = s.object(
  "Fields to update on a GetResponse campaign.",
  {
    campaignId: idSchema,
    name: s.string("The current or new unique campaign name between 3 and 64 characters.", {
      minLength: 3,
      maxLength: 64,
    }),
    languageCode: s.nonEmptyString("The campaign language code, such as EN."),
    apiOptIn: s.stringEnum("The opt-in mode for contacts added through the API.", ["single", "double"]),
  },
  { optional: ["languageCode", "apiOptIn"] },
);

const updateCampaignAction = defineProviderAction(service, {
  name: "update_campaign",
  description: "Update mutable fields on a GetResponse campaign.",
  requiredScopes: [],
  inputSchema: updateCampaignInputSchema,
  outputSchema: s.object("The normalized GetResponse campaign update response.", {
    campaign: campaignSchema,
  }),
});

const listContactsAction = defineProviderAction(service, {
  name: "list_contacts",
  description: "List and search GetResponse contacts with page-based pagination.",
  requiredScopes: [],
  inputSchema: requireCompleteSort(
    s.object(
      "Filters, sorting, and pagination for listing GetResponse contacts.",
      {
        email: s.nonEmptyString("Filter contacts by an exact address or partial email value."),
        name: s.nonEmptyString("Filter contacts by name."),
        campaignId: idSchema,
        exactMatch: s.boolean("Use exact matching for the email and name filters."),
        createdFrom: dateOrDateTimeSchema,
        createdTo: dateOrDateTimeSchema,
        changedFrom: dateOrDateTimeSchema,
        changedTo: dateOrDateTimeSchema,
        sortBy: s.stringEnum("The contact field to sort by.", [
          "email",
          "name",
          "createdOn",
          "changedOn",
          "campaignId",
        ]),
        sortOrder: sortOrderSchema,
        ...paginationInputFields,
      },
      {
        optional: [
          "email",
          "name",
          "campaignId",
          "exactMatch",
          "createdFrom",
          "createdTo",
          "changedFrom",
          "changedTo",
          "sortBy",
          "sortOrder",
          "page",
          "perPage",
        ],
      },
    ),
  ),
  outputSchema: s.object("The normalized GetResponse contact list response.", {
    contacts: s.array("Contacts returned by GetResponse.", contactSchema),
    pagination: paginationOutputSchema,
  }),
});

const getContactAction = defineProviderAction(service, {
  name: "get_contact",
  description: "Retrieve one GetResponse contact by ID.",
  requiredScopes: [],
  inputSchema: s.object("The contact to retrieve.", {
    contactId: idSchema,
  }),
  outputSchema: s.object("The normalized GetResponse contact response.", {
    contact: contactSchema,
  }),
});

const createContactAction = defineProviderAction(service, {
  name: "create_contact",
  description: "Queue a contact for creation in a GetResponse campaign.",
  requiredScopes: [],
  inputSchema: s.object(
    "The new GetResponse contact fields.",
    {
      ...contactSharedWritableFields,
      ipAddress: ipAddressSchema,
    },
    { optional: ["name", "dayOfCycle", "scoring", "tags", "customFields", "ipAddress"] },
  ),
  outputSchema: s.object("The GetResponse contact creation acceptance response.", {
    accepted: s.boolean("Whether GetResponse accepted the contact for asynchronous processing."),
  }),
});

const mutableContactFields = [
  "email",
  "name",
  "campaignId",
  "dayOfCycle",
  "scoring",
  "note",
  "tags",
  "customFields",
] as const;

const updateContactInputSchema: JsonSchema = {
  ...s.object(
    "Fields to update on a GetResponse contact. At least one mutable field is required.",
    {
      contactId: idSchema,
      ...contactSharedWritableFields,
      note: s.nullable(s.string("An optional note attached to the contact.", { maxLength: 255 })),
    },
    { optional: [...mutableContactFields] },
  ),
  anyOf: mutableContactFields.map((field) => ({
    description: `An update that includes the ${field} field.`,
    required: [field],
  })),
};

const updateContactAction = defineProviderAction(service, {
  name: "update_contact",
  description: "Update a GetResponse contact, replacing tag and custom-field assignments when supplied.",
  requiredScopes: [],
  inputSchema: updateContactInputSchema,
  outputSchema: s.object("The normalized GetResponse contact update response.", {
    contact: contactSchema,
  }),
});

const deleteContactAction = defineProviderAction(service, {
  name: "delete_contact",
  description: "Permanently delete a GetResponse contact by ID.",
  requiredScopes: [],
  inputSchema: s.object("The contact to delete.", {
    contactId: idSchema,
  }),
  outputSchema: s.object("The GetResponse contact deletion result.", {
    deleted: s.boolean("Whether the contact was deleted."),
    contactId: idSchema,
  }),
});

const listNewslettersAction = defineProviderAction(service, {
  name: "list_newsletters",
  description: "List GetResponse newsletters with filters and pagination.",
  requiredScopes: [],
  inputSchema: requireCompleteSort(
    s.object(
      "Filters, sorting, and pagination for listing GetResponse newsletters.",
      {
        name: s.nonEmptyString("Filter newsletters by internal name."),
        subject: s.nonEmptyString("Filter newsletters by subject."),
        status: s.stringEnum("Filter newsletters by status.", ["enabled", "disabled"]),
        type: s.stringEnum("Filter newsletters by type.", ["draft", "broadcast", "splittest", "automation"]),
        campaignId: idSchema,
        createdFrom: dateOrDateTimeSchema,
        createdTo: dateOrDateTimeSchema,
        sentFrom: s.date("Return newsletters sent on or after this date."),
        sentTo: s.date("Return newsletters sent on or before this date."),
        sortBy: s.stringEnum("The newsletter field to sort by.", ["createdOn", "sendOn"]),
        sortOrder: sortOrderSchema,
        ...paginationInputFields,
      },
      {
        optional: [
          "name",
          "subject",
          "status",
          "type",
          "campaignId",
          "createdFrom",
          "createdTo",
          "sentFrom",
          "sentTo",
          "sortBy",
          "sortOrder",
          "page",
          "perPage",
        ],
      },
    ),
  ),
  outputSchema: s.object("The normalized GetResponse newsletter list response.", {
    newsletters: s.array("Newsletters returned by GetResponse.", newsletterSchema),
    pagination: paginationOutputSchema,
  }),
});

const getNewsletterAction = defineProviderAction(service, {
  name: "get_newsletter",
  description: "Retrieve one GetResponse newsletter by ID.",
  requiredScopes: [],
  inputSchema: s.object("The newsletter to retrieve.", {
    newsletterId: idSchema,
  }),
  outputSchema: s.object("The normalized GetResponse newsletter response.", {
    newsletter: newsletterSchema,
  }),
});

const getNewsletterStatisticsAction = defineProviderAction(service, {
  name: "get_newsletter_statistics",
  description: "Retrieve delivery and engagement statistics for one GetResponse newsletter.",
  requiredScopes: [],
  inputSchema: s.object(
    "Filters and pagination for GetResponse newsletter statistics.",
    {
      newsletterId: idSchema,
      groupBy: s.stringEnum("The time interval used to group statistics.", ["total", "hour", "day", "month"]),
      createdFrom: dateOrDateTimeSchema,
      createdTo: dateOrDateTimeSchema,
      ...paginationInputFields,
    },
    { optional: ["groupBy", "createdFrom", "createdTo", "page", "perPage"] },
  ),
  outputSchema: s.object("The GetResponse newsletter statistics response.", {
    statistics: s.array("Statistics rows returned by GetResponse.", newsletterStatisticSchema),
    pagination: paginationOutputSchema,
  }),
});

const listCustomFieldsAction = defineProviderAction(service, {
  name: "list_custom_fields",
  description: "List GetResponse custom fields that can be assigned to contacts.",
  requiredScopes: [],
  inputSchema: s.object(
    "Filters and pagination for listing GetResponse custom fields.",
    {
      name: s.nonEmptyString("Filter custom fields by name."),
      sortOrder: s.describe(sortOrderSchema, "The sort direction applied to the custom field name."),
      ...paginationInputFields,
    },
    { optional: ["name", "sortOrder", "page", "perPage"] },
  ),
  outputSchema: s.object("The normalized GetResponse custom field list response.", {
    customFields: s.array(
      "Custom fields returned by GetResponse.",
      s.object("A normalized GetResponse custom field.", {
        customFieldId: idSchema,
        name: s.string("The custom field name."),
        type: s.nullable(s.string("The custom field value type when returned.")),
        format: s.nullable(s.string("The custom field input format when returned.")),
        raw: s.looseObject("The raw custom field object returned by GetResponse."),
      }),
    ),
    pagination: paginationOutputSchema,
  }),
});

const listTagsAction = defineProviderAction(service, {
  name: "list_tags",
  description: "List GetResponse tags that can be assigned to contacts.",
  requiredScopes: [],
  inputSchema: requireCompleteSort(
    s.object(
      "Filters, sorting, and pagination for listing GetResponse tags.",
      {
        name: s.nonEmptyString("Filter tags by name."),
        createdFrom: dateOrDateTimeSchema,
        createdTo: dateOrDateTimeSchema,
        sortBy: s.stringEnum("The tag field to sort by.", ["createdAt", "name"]),
        sortOrder: sortOrderSchema,
        ...paginationInputFields,
      },
      {
        optional: ["name", "createdFrom", "createdTo", "sortBy", "sortOrder", "page", "perPage"],
      },
    ),
  ),
  outputSchema: s.object("The normalized GetResponse tag list response.", {
    tags: s.array(
      "Tags returned by GetResponse.",
      s.object("A normalized GetResponse tag.", {
        tagId: idSchema,
        name: s.string("The tag name."),
        createdAt: s.nullable(s.string("The tag creation timestamp when returned.")),
        raw: s.looseObject("The raw tag object returned by GetResponse."),
      }),
    ),
    pagination: paginationOutputSchema,
  }),
});

export const getresponseActions: ActionDefinition[] = [
  listCampaignsAction,
  getCampaignAction,
  createCampaignAction,
  updateCampaignAction,
  listContactsAction,
  getContactAction,
  createContactAction,
  updateContactAction,
  deleteContactAction,
  listNewslettersAction,
  getNewsletterAction,
  getNewsletterStatisticsAction,
  listCustomFieldsAction,
  listTagsAction,
] satisfies ActionDefinition[];

export type GetresponseActionName = (typeof getresponseActions)[number]["name"];
