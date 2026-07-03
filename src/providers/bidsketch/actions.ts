import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "bidsketch";

const pageSchema = s.positiveInteger("The 1-based page number to request from BidSketch.");
const perPageSchema = s.integer("The maximum number of records to request per page.", {
  minimum: 1,
  maximum: 100,
});
const listInputSchema = s.object(
  "Pagination input for a BidSketch list endpoint.",
  {
    page: pageSchema,
    perPage: perPageSchema,
  },
  {
    optional: ["page", "perPage"],
  },
);
const clientIdInputSchema = s.object("Input for selecting one BidSketch client.", {
  clientId: s.positiveInteger("The BidSketch client ID."),
});
const proposalIdInputSchema = s.object("Input for selecting one BidSketch proposal.", {
  proposalId: s.positiveInteger("The BidSketch proposal ID."),
});
const listClientProposalsInputSchema = s.object(
  "Input for listing proposals that belong to one BidSketch client.",
  {
    clientId: s.positiveInteger("The BidSketch client ID."),
    page: pageSchema,
    perPage: perPageSchema,
  },
  {
    optional: ["page", "perPage"],
  },
);
const optionalString = (description: string) => s.string(description, { minLength: 1 });
const clientOtherContactSchema = s.looseRequiredObject(
  "A secondary contact attached to a BidSketch client.",
  {
    first_name: optionalString("The secondary contact first name."),
    last_name: optionalString("The secondary contact last name."),
    email: s.email("The secondary contact email address."),
    phone: optionalString("The secondary contact phone number."),
  },
  {
    optional: ["first_name", "last_name", "email", "phone"],
  },
);
const clientSchema = s.looseRequiredObject(
  "A BidSketch client.",
  {
    id: s.positiveInteger("The BidSketch client ID."),
    url: s.url("The API URL for the client."),
    app_url: s.url("The BidSketch app URL for the client."),
    created_at: s.dateTime("The timestamp when the client was created."),
    updated_at: s.dateTime("The timestamp when the client was last updated."),
    first_name: optionalString("The client first name."),
    last_name: optionalString("The client last name."),
    email: s.email("The client primary email address."),
    name: optionalString("The client company name or full display name."),
    phone: optionalString("The client primary phone number."),
    alt_phone: optionalString("The client alternate phone number."),
    website: optionalString("The client website."),
    address_field_one: optionalString("The first client address line."),
    address_field_two: optionalString("The second client address line."),
    city: optionalString("The client city."),
    state: optionalString("The client state or region."),
    postal_zip: optionalString("The client postal code."),
    country: optionalString("The client country."),
    notes: optionalString("The client notes."),
    other_contact: clientOtherContactSchema,
  },
  {
    optional: [
      "url",
      "app_url",
      "created_at",
      "updated_at",
      "first_name",
      "last_name",
      "email",
      "name",
      "phone",
      "alt_phone",
      "website",
      "address_field_one",
      "address_field_two",
      "city",
      "state",
      "postal_zip",
      "country",
      "notes",
      "other_contact",
    ],
  },
);
const proposalSummarySchema = s.looseRequiredObject(
  "A BidSketch proposal summary.",
  {
    id: s.positiveInteger("The BidSketch proposal ID."),
    url: s.url("The API URL for the proposal."),
    app_url: s.url("The BidSketch app URL for the proposal."),
    created_at: s.dateTime("The timestamp when the proposal was created."),
    updated_at: s.dateTime("The timestamp when the proposal was last updated."),
    name: optionalString("The proposal name."),
    description: optionalString("The proposal description."),
    status: optionalString("The proposal status."),
    is_draft: s.boolean("Whether the proposal is still a draft."),
  },
  {
    optional: ["url", "app_url", "created_at", "updated_at", "name", "description", "status", "is_draft"],
  },
);
const proposalContentCountsSchema = s.looseRequiredObject(
  "A BidSketch proposal content bucket summary.",
  {
    count: s.nonNegativeInteger("The number of items in this proposal content bucket."),
    url: s.url("The API URL for this proposal content bucket."),
  },
  {
    optional: ["count", "url"],
  },
);
const proposalDetailContentSchema = s.looseRequiredObject(
  "The BidSketch content summary attached to a proposal detail response.",
  {
    count: s.nonNegativeInteger("The total number of sections and fees in the proposal."),
    url: s.url("The API URL for the proposal content endpoint."),
    opening_sections: proposalContentCountsSchema,
    fees: proposalContentCountsSchema,
    closing_sections: proposalContentCountsSchema,
  },
  {
    optional: ["count", "url", "opening_sections", "fees", "closing_sections"],
  },
);
const proposalSettingsSchema = s.looseObject("The BidSketch proposal settings block.", {
  approval_message: optionalString("The approval message shown to the client."),
  optional_fees_note: optionalString("The note displayed for optional fees."),
  optional_fees_title: optionalString("The title used for optional fees."),
  proposal_fees_title: optionalString("The title used for proposal fees."),
  include_optional_fees_in_totals: s.boolean("Whether optional fees are included in BidSketch totals."),
  hide_monthly_total: s.boolean("Whether the monthly total is hidden."),
  hide_project_total: s.boolean("Whether the project total is hidden."),
  hide_yearly_total: s.boolean("Whether the yearly total is hidden."),
  hide_grand_total: s.boolean("Whether the grand total is hidden."),
});
const proposalClientSchema = s.looseRequiredObject(
  "The client summary nested under a BidSketch proposal.",
  {
    id: s.positiveInteger("The BidSketch client ID attached to the proposal."),
    name: optionalString("The client display name."),
    url: s.url("The API URL for the client."),
    app_url: s.url("The BidSketch app URL for the client."),
  },
  {
    optional: ["name", "url", "app_url"],
  },
);
const proposalDetailSchema = s.looseRequiredObject(
  "A BidSketch proposal detail record.",
  {
    id: s.positiveInteger("The BidSketch proposal ID."),
    url: s.url("The API URL for the proposal."),
    app_url: s.url("The BidSketch app URL for the proposal."),
    created_at: s.dateTime("The timestamp when the proposal was created."),
    updated_at: s.dateTime("The timestamp when the proposal was last updated."),
    proposal_date: s.nullable(s.dateTime("The explicit proposal date when BidSketch returns one.")),
    name: optionalString("The proposal name."),
    description: optionalString("The proposal description."),
    status: optionalString("The proposal status."),
    is_draft: s.boolean("Whether the proposal is still a draft."),
    user: optionalString("The BidSketch user who owns the proposal."),
    currency: optionalString("The proposal ISO currency code."),
    tax: s.number("The calculated primary tax value returned by BidSketch."),
    tax2: s.number("The calculated secondary tax value returned by BidSketch."),
    monthly_fees: s.number("The calculated monthly fee subtotal."),
    yearly_fees: s.number("The calculated yearly fee subtotal."),
    one_time_fees: s.number("The calculated one-time fee subtotal."),
    discount: s.number("The calculated discount amount."),
    total: s.number("The calculated total proposal value."),
    settings: proposalSettingsSchema,
    client: proposalClientSchema,
    content: proposalDetailContentSchema,
  },
  {
    optional: [
      "url",
      "app_url",
      "created_at",
      "updated_at",
      "proposal_date",
      "name",
      "description",
      "status",
      "is_draft",
      "user",
      "currency",
      "tax",
      "tax2",
      "monthly_fees",
      "yearly_fees",
      "one_time_fees",
      "discount",
      "total",
      "settings",
      "client",
      "content",
    ],
  },
);
const proposalSectionSchema = s.looseRequiredObject(
  "A BidSketch proposal section returned by the proposal content endpoint.",
  {
    id: s.positiveInteger("The BidSketch proposal section ID."),
    url: s.url("The API URL for the proposal section."),
    name: optionalString("The proposal section name."),
    description: optionalString("The proposal section HTML body."),
  },
  {
    optional: ["url", "name", "description"],
  },
);
const proposalFeeSchema = s.looseRequiredObject(
  "A BidSketch proposal fee returned by the proposal content endpoint.",
  {
    id: s.positiveInteger("The BidSketch proposal fee ID."),
    url: s.url("The API URL for the proposal fee."),
    name: optionalString("The proposal fee name."),
    optional: s.boolean("Whether the fee is optional."),
    feetype: optionalString("The BidSketch fee type."),
    unit: s.nullable(optionalString("The unit label associated with the fee.")),
    details: optionalString("The display-friendly fee details string."),
    currency: optionalString("The proposal fee ISO currency code."),
    amount: s.number("The base fee amount."),
    quantity: s.nullable(s.number("The fee quantity when BidSketch returns one.")),
    total: s.number("The total fee value."),
    description: optionalString("The proposal fee HTML description."),
  },
  {
    optional: [
      "url",
      "name",
      "optional",
      "feetype",
      "unit",
      "details",
      "currency",
      "amount",
      "quantity",
      "total",
      "description",
    ],
  },
);
const proposalContentSchema = s.looseRequiredObject(
  "A BidSketch proposal content response.",
  {
    id: s.positiveInteger("The BidSketch proposal ID."),
    url: s.url("The API URL for the proposal."),
    app_url: s.url("The BidSketch app URL for the proposal."),
    content: s.looseRequiredObject(
      "The full BidSketch proposal content grouped by section type and fees.",
      {
        opening_sections: s.array("The proposal opening sections in display order.", proposalSectionSchema),
        fees: s.array("The proposal fee rows in display order.", proposalFeeSchema),
        closing_sections: s.array("The proposal closing sections in display order.", proposalSectionSchema),
      },
      {
        optional: ["opening_sections", "fees", "closing_sections"],
      },
    ),
  },
  {
    optional: ["url", "app_url", "content"],
  },
);

export type BidsketchActionName =
  | "list_clients"
  | "get_client"
  | "list_proposals"
  | "list_client_proposals"
  | "get_proposal"
  | "get_proposal_content";

export const bidsketchActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_clients",
    description: "List clients available in the authenticated BidSketch account.",
    requiredScopes: [],
    inputSchema: listInputSchema,
    outputSchema: s.actionOutput(
      {
        clients: s.array("The clients returned by BidSketch.", clientSchema),
      },
      "The BidSketch client list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_client",
    description: "Get one BidSketch client by client ID.",
    requiredScopes: [],
    inputSchema: clientIdInputSchema,
    outputSchema: s.actionOutput(
      {
        client: clientSchema,
      },
      "The BidSketch client detail response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_proposals",
    description: "List proposals available in the authenticated BidSketch account.",
    requiredScopes: [],
    inputSchema: listInputSchema,
    outputSchema: s.actionOutput(
      {
        proposals: s.array("The proposal summaries returned by BidSketch.", proposalSummarySchema),
      },
      "The BidSketch proposal list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_client_proposals",
    description: "List proposals that belong to one BidSketch client.",
    requiredScopes: [],
    inputSchema: listClientProposalsInputSchema,
    outputSchema: s.actionOutput(
      {
        proposals: s.array("The proposal summaries returned by BidSketch.", proposalSummarySchema),
      },
      "The BidSketch client proposal list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_proposal",
    description: "Get one BidSketch proposal by proposal ID.",
    requiredScopes: [],
    inputSchema: proposalIdInputSchema,
    outputSchema: s.actionOutput(
      {
        proposal: proposalDetailSchema,
      },
      "The BidSketch proposal detail response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_proposal_content",
    description: "Get one BidSketch proposal with its grouped sections and fees.",
    requiredScopes: [],
    inputSchema: proposalIdInputSchema,
    outputSchema: s.actionOutput(
      {
        proposal: proposalContentSchema,
      },
      "The BidSketch proposal content response.",
    ),
  }),
];
