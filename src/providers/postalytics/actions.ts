import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "postalytics";

const campaignRecordSchema = s.object(
  "A campaign record returned by Postalytics.",
  {
    audience: s.integer("The number of contacts targeted by the campaign."),
    campaign_id: s.integer("The Postalytics campaign identifier."),
    campaign_type: s.integer("The Postalytics campaign type code."),
    conversions: s.integer("The number of conversions attributed to the campaign."),
    created_date: s.string("The campaign creation timestamp returned by Postalytics."),
    creative_type: s.integer("The Postalytics creative type code."),
    delivered: s.integer("The number of delivered mail pieces."),
    drop_id: s.integer("The Postalytics direct-mail drop identifier."),
    endpoint: s.nullableString("The triggered-drip endpoint when available."),
    in_local_area: s.integer("The number of mail pieces in the local delivery area."),
    in_transit: s.integer("The number of mail pieces in transit."),
    is_live_mode: s.integer("Whether the campaign is in live mode as a Postalytics numeric flag."),
    name: s.nullableString("The campaign name when available."),
    pageviews: s.integer("The total number of tracked page views."),
    processed_for_delivery: s.integer("The number of mail pieces processed for delivery."),
    returned: s.integer("The number of returned mail pieces."),
    send_date: s.string("The campaign send timestamp returned by Postalytics."),
    status: s.integer("The Postalytics campaign status code."),
    thumbnail: s.nullableString("The front thumbnail URL when available."),
    thumbnail_back: s.nullableString("The back thumbnail URL when available."),
    unique_pageviews: s.integer("The number of unique tracked page views."),
    unique_visitors: s.integer("The number of unique tracked visitors."),
  },
  { required: [], additionalProperties: true },
);

const campaignDetailSchema = s.object(
  "The basic campaign details returned by Postalytics.",
  {
    ContactListId: s.integer("The contact list identifier used by the campaign."),
    DirectMailDropId: s.integer("The Postalytics direct-mail drop identifier."),
    DirectMailName: s.nullableString("The direct-mail campaign name when available."),
    EndPointId: s.nullableString("The campaign endpoint identifier when available."),
    Status: s.integer("The Postalytics campaign status code."),
  },
  { required: [], additionalProperties: true },
);

const contactListSchema = s.object(
  "A contact list returned by Postalytics.",
  {
    contact_list_id: s.integer("The Postalytics contact list identifier."),
    count: s.integer("The number of contacts in the list."),
    created_date: s.nullableString("The contact list creation timestamp when available."),
    name: s.nullableString("The contact list name when available."),
  },
  { required: [], additionalProperties: true },
);

const contactRecordSchema = s.object(
  "A contact record returned by Postalytics.",
  {
    address_city: s.nullableString("The contact city when available."),
    address_state: s.nullableString("The contact state or region when available."),
    address_street: s.nullableString("The contact street address when available."),
    address_street2: s.nullableString("The second contact address line when available."),
    address_zip: s.nullableString("The contact postal code when available."),
    company: s.nullableString("The contact company when available."),
    contact_id: s.integer("The Postalytics contact identifier."),
    contact_list_id: s.integer("The Postalytics contact list identifier."),
    created_date: s.nullableString("The contact creation timestamp when available."),
    email_address: s.nullableString("The contact email address when available."),
    first_name: s.nullableString("The contact first name when available."),
    last_name: s.nullableString("The contact last name when available."),
    mobile_phone: s.nullableString("The contact mobile phone number when available."),
    occupation: s.nullableString("The contact occupation when available."),
    phone: s.nullableString("The contact phone number when available."),
    row: s.integer("The one-based row number returned by Postalytics."),
    website: s.nullableString("The contact website when available."),
  },
  { required: [], additionalProperties: true },
);

const contactDetailSchema = s.object(
  "The contact details returned by Postalytics.",
  {
    Address: s.nullableString("The contact street address when available."),
    Address2: s.nullableString("The second contact address line when available."),
    AddressStatusId: s.integer("The Postalytics address validation status identifier."),
    City: s.nullableString("The contact city when available."),
    Company: s.nullableString("The contact company when available."),
    ContactListId: s.integer("The Postalytics contact list identifier."),
    EmailId: s.nullableString("The contact email address when available."),
    FirstName: s.nullableString("The contact first name when available."),
    Id: s.integer("The Postalytics contact identifier."),
    LastName: s.nullableString("The contact last name when available."),
    Mobile: s.nullableString("The contact mobile phone number when available."),
    Occupation: s.nullableString("The contact occupation when available."),
    Phone: s.nullableString("The contact phone number when available."),
    State: s.nullableString("The contact state or region when available."),
    Website: s.nullableString("The contact website when available."),
    Zip: s.nullableString("The contact postal code when available."),
  },
  { required: [], additionalProperties: true },
);

const templateRecordSchema = s.object(
  "A template record returned by Postalytics.",
  {
    back: s.nullableString("The full-size back image URL or letter back content when available."),
    count: s.integer("The number of pages in the template."),
    created_date: s.nullableString("The template creation timestamp when available."),
    font_family: s.nullableString("The template font family when available."),
    front: s.nullableString("The full-size front image URL or letter front content when available."),
    html: s.nullableString("The complete template HTML when available."),
    is_double_sided: s.boolean("Whether the template has a back side."),
    is_full_html: s.boolean("Whether the html field contains the complete template content."),
    is_proofed: s.boolean("Whether the template has been proofed."),
    name: s.nullableString("The template name when available."),
    size: s.nullableString("The template size when available."),
    template_id: s.integer("The Postalytics template identifier."),
    thumbnail: s.nullableString("The front thumbnail URL when available."),
    thumbnail_back: s.nullableString("The back thumbnail URL when available."),
  },
  { required: [], additionalProperties: true },
);

export const postalyticsActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_campaigns",
    description: "List all direct-mail campaigns in the authenticated Postalytics account.",
    inputSchema: s.actionInput({}, [], "The input payload for listing Postalytics campaigns."),
    outputSchema: s.array("The campaign records returned directly by Postalytics.", campaignRecordSchema),
  }),
  defineProviderAction(service, {
    name: "get_campaign",
    description: "Get basic details for one Postalytics campaign.",
    inputSchema: s.actionInput(
      {
        campaignId: s.positiveInteger("The Postalytics campaign identifier."),
      },
      ["campaignId"],
      "The input payload for retrieving a Postalytics campaign.",
    ),
    outputSchema: campaignDetailSchema,
  }),
  defineProviderAction(service, {
    name: "get_campaign_stats",
    description: "Get delivery and engagement statistics for one Postalytics campaign.",
    inputSchema: s.actionInput(
      {
        dropId: s.positiveInteger("The Postalytics campaign drop identifier."),
      },
      ["dropId"],
      "The input payload for retrieving Postalytics campaign statistics.",
    ),
    outputSchema: s.array("The campaign statistics records returned directly by Postalytics.", campaignRecordSchema),
  }),
  defineProviderAction(service, {
    name: "list_contact_lists",
    description: "List all contact lists in the authenticated Postalytics account.",
    inputSchema: s.actionInput({}, [], "The input payload for listing Postalytics contact lists."),
    outputSchema: s.array("The contact list records returned directly by Postalytics.", contactListSchema),
  }),
  defineProviderAction(service, {
    name: "list_contacts",
    description: "List a bounded page of contacts from one Postalytics contact list.",
    inputSchema: s.actionInput(
      {
        contactListId: s.positiveInteger("The Postalytics contact list identifier."),
        limit: s.integer("The maximum number of contacts to return, from 1 through 100.", {
          minimum: 1,
          maximum: 100,
        }),
        start: s.positiveInteger("The one-based row number at which to start the result page."),
      },
      ["contactListId"],
      "The input payload for listing contacts from a Postalytics contact list.",
    ),
    outputSchema: s.array("The contact records returned directly by Postalytics.", contactRecordSchema),
  }),
  defineProviderAction(service, {
    name: "get_contact",
    description: "Get details for one Postalytics contact.",
    inputSchema: s.actionInput(
      {
        contactId: s.positiveInteger("The Postalytics contact identifier."),
      },
      ["contactId"],
      "The input payload for retrieving a Postalytics contact.",
    ),
    outputSchema: contactDetailSchema,
  }),
  defineProviderAction(service, {
    name: "list_templates",
    description: "List all direct-mail templates in the authenticated Postalytics account.",
    inputSchema: s.actionInput({}, [], "The input payload for listing Postalytics templates."),
    outputSchema: s.array("The template records returned directly by Postalytics.", templateRecordSchema),
  }),
  defineProviderAction(service, {
    name: "get_template",
    description: "Get details for one Postalytics direct-mail template.",
    inputSchema: s.actionInput(
      {
        templateId: s.positiveInteger("The Postalytics template identifier."),
      },
      ["templateId"],
      "The input payload for retrieving a Postalytics template.",
    ),
    outputSchema: s.array("The template detail records returned directly by Postalytics.", templateRecordSchema),
  }),
];
