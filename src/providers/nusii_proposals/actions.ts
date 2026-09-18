import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "nusii_proposals";

const resourceIdSchema = (description: string) =>
  s.anyOf(description, [
    s.nonWhitespaceString(`${description} as a string.`),
    s.positiveInteger(`${description} as a positive integer.`),
  ]);

const pageSchema = s.positiveInteger("The Nusii page number to retrieve.");
const perSchema = s.positiveInteger("The number of Nusii records to return per page.");
const jsonApiAttributesSchema = s.looseObject("The provider-defined attributes returned for this Nusii resource.");
const jsonApiRelationshipsSchema = s.looseObject("The JSON API relationships returned for this Nusii resource.");
const jsonApiIncludedResourceSchema = s.looseObject("An included JSON API resource returned by Nusii.");
const jsonApiResourceSchema = s.looseRequiredObject(
  "A Nusii JSON API resource.",
  {
    id: s.string("The Nusii resource identifier."),
    type: s.string("The Nusii JSON API resource type."),
    attributes: jsonApiAttributesSchema,
    relationships: jsonApiRelationshipsSchema,
  },
  { optional: ["relationships"] },
);
const jsonApiMetaSchema = s.looseObject(
  "Pagination metadata returned by Nusii, whose keys may use underscores or hyphens.",
);

const pagedInputSchema = (description: string) =>
  s.object(
    description,
    {
      page: pageSchema,
      per: perSchema,
    },
    { optional: ["page", "per"] },
  );

const resourceInputSchema = (resourceName: string) =>
  s.requiredObject(`The input payload for reading one Nusii ${resourceName}.`, {
    id: resourceIdSchema(`The Nusii ${resourceName} ID`),
  });

const jsonApiResourceOutputSchema = (description: string) =>
  s.looseRequiredObject(
    description,
    {
      data: jsonApiResourceSchema,
      included: s.array("Related JSON API resources included by Nusii.", jsonApiIncludedResourceSchema),
    },
    { optional: ["included"] },
  );

const jsonApiListOutputSchema = (description: string) =>
  s.looseRequiredObject(
    description,
    {
      data: s.array("The Nusii JSON API resources in this page.", jsonApiResourceSchema),
      meta: jsonApiMetaSchema,
      included: s.array("Related JSON API resources included by Nusii.", jsonApiIncludedResourceSchema),
    },
    { optional: ["meta", "included"] },
  );

const clientFields = {
  email: s.email("The client's email address."),
  name: s.nonWhitespaceString("The client's first name."),
  surname: s.nonWhitespaceString("The client's surname."),
  currency: s.nonWhitespaceString("The client's currency code."),
  business: s.nonWhitespaceString("The client's company or business name."),
  locale: s.nonWhitespaceString("The client's locale code used for proposals."),
  pdf_page_size: s.nonWhitespaceString("The PDF page size used for the client's proposals."),
  web: s.nonWhitespaceString("The client's website as accepted by Nusii."),
  telephone: s.nonWhitespaceString("The client's telephone number."),
  address: s.nonWhitespaceString("The client's street address."),
  city: s.nonWhitespaceString("The client's city."),
  postcode: s.nonWhitespaceString("The client's postal code."),
  country: s.nonWhitespaceString("The client's country name."),
  state: s.nonWhitespaceString("The client's state, province, or region."),
};

const proposalFields = {
  title: s.nonWhitespaceString("The proposal title."),
  client_id: resourceIdSchema("The existing Nusii client ID"),
  client_email: s.email("The client email to resolve or create when client_id is not provided."),
  template_id: resourceIdSchema("The Nusii template ID whose sections should be copied"),
  document_section_title: s.nonWhitespaceString("The proposal's document section title."),
  prepared_by_id: resourceIdSchema("The Nusii user ID that prepared the proposal"),
  expires_at: s.dateTime("The proposal expiration timestamp in ISO 8601 format."),
  display_date: s.dateTime("The proposal display timestamp in ISO 8601 format."),
  report: s.boolean("Whether Nusii should create the proposal as a report."),
  exclude_total: s.boolean("Whether the proposal should hide its total."),
  exclude_total_in_pdf: s.boolean("Whether the proposal PDF should hide its total."),
  theme: s.nonWhitespaceString("The Nusii theme identifier for the proposal."),
};

const updateProposalFields = {
  title: proposalFields.title,
  client_id: proposalFields.client_id,
  client_email: proposalFields.client_email,
  document_section_title: proposalFields.document_section_title,
  prepared_by_id: proposalFields.prepared_by_id,
  expires_at: proposalFields.expires_at,
  display_date: proposalFields.display_date,
  report: proposalFields.report,
  exclude_total: proposalFields.exclude_total,
  exclude_total_in_pdf: proposalFields.exclude_total_in_pdf,
  theme: proposalFields.theme,
};

const getAccountAction = defineProviderAction(service, {
  name: "get_account",
  operationType: "read",
  description: "Get the Nusii account associated with the connected API token.",
  requiredScopes: [],
  inputSchema: s.object("No input parameters are required to get the Nusii account.", {}),
  outputSchema: jsonApiResourceOutputSchema("The Nusii account JSON API response."),
});

const listClientsAction = defineProviderAction(service, {
  name: "list_clients",
  operationType: "read",
  description: "List clients in the connected Nusii account with optional pagination.",
  requiredScopes: [],
  inputSchema: pagedInputSchema("Pagination parameters for listing Nusii clients."),
  outputSchema: jsonApiListOutputSchema("The paginated Nusii clients JSON API response."),
});

const getClientAction = defineProviderAction(service, {
  name: "get_client",
  operationType: "read",
  description: "Get one Nusii client by ID.",
  requiredScopes: [],
  inputSchema: resourceInputSchema("client"),
  outputSchema: jsonApiResourceOutputSchema("The Nusii client JSON API response."),
});

const createClientAction = defineProviderAction(service, {
  name: "create_client",
  operationType: "write",
  description: "Create a client in the connected Nusii account.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for creating a Nusii client.", clientFields, {
    optional: [
      "surname",
      "currency",
      "business",
      "locale",
      "pdf_page_size",
      "web",
      "telephone",
      "address",
      "city",
      "postcode",
      "country",
      "state",
    ],
  }),
  outputSchema: jsonApiResourceOutputSchema("The created Nusii client JSON API response."),
});

const listProposalsAction = defineProviderAction(service, {
  name: "list_proposals",
  operationType: "read",
  description: "List Nusii proposals with pagination and optional status, archive, or recipient filters.",
  requiredScopes: [],
  inputSchema: s.object(
    "Pagination and filter parameters for listing Nusii proposals.",
    {
      page: pageSchema,
      per: perSchema,
      status: s.stringEnum("The proposal lifecycle status to filter by.", [
        "draft",
        "pending",
        "accepted",
        "rejected",
        "clarification",
      ]),
      archived: s.boolean("Whether to return archived proposals instead of active proposals."),
      recipient_email: s.email("A single proposal recipient email address to match."),
      recipient_emails: s.array(
        "Proposal recipient email addresses to match; Nusii accepts up to 30.",
        s.email("A proposal recipient email address."),
        { minItems: 1, maxItems: 30 },
      ),
    },
    {
      optional: ["page", "per", "status", "archived", "recipient_email", "recipient_emails"],
    },
  ),
  outputSchema: jsonApiListOutputSchema("The paginated Nusii proposals JSON API response."),
});

const getProposalAction = defineProviderAction(service, {
  name: "get_proposal",
  operationType: "read",
  description: "Get one Nusii proposal by ID, including any recipient resources Nusii returns.",
  requiredScopes: [],
  inputSchema: resourceInputSchema("proposal"),
  outputSchema: jsonApiResourceOutputSchema("The Nusii proposal JSON API response."),
});

const createProposalAction = defineProviderAction(service, {
  name: "create_proposal",
  operationType: "write",
  description: "Create a Nusii proposal, optionally resolving a client and copying sections from a template.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for creating a Nusii proposal.", proposalFields),
  outputSchema: jsonApiResourceOutputSchema("The created Nusii proposal JSON API response."),
});

const updateProposalAction = defineProviderAction(service, {
  name: "update_proposal",
  operationType: "write",
  description: "Update one or more documented fields on a Nusii proposal.",
  requiredScopes: [],
  inputSchema: s.object(
    "The proposal ID and fields to update in Nusii.",
    {
      id: resourceIdSchema("The Nusii proposal ID"),
      ...updateProposalFields,
    },
    { required: ["id"] },
  ),
  outputSchema: jsonApiResourceOutputSchema("The updated Nusii proposal JSON API response."),
});

const archiveProposalAction = defineProviderAction(service, {
  name: "archive_proposal",
  operationType: "destructive",
  description: "Archive a Nusii proposal by ID.",
  requiredScopes: [],
  inputSchema: resourceInputSchema("proposal"),
  outputSchema: jsonApiResourceOutputSchema("The archived Nusii proposal JSON API response."),
});

const recipientSchema = s.object(
  "A recipient for a Nusii proposal email.",
  {
    name: s.nonWhitespaceString("The recipient's display name."),
    email: s.email("The recipient's email address."),
    eligible_to_sign: s.boolean("Whether the recipient may sign the proposal."),
  },
  { optional: ["eligible_to_sign"] },
);

const sendProposalAction = defineProviderAction(service, {
  name: "send_proposal",
  operationType: "write",
  description: "Send a Nusii proposal to one legacy email address or up to 10 structured recipients.",
  requiredScopes: [],
  inputSchema: s.object(
    "The proposal ID and email delivery fields for sending a Nusii proposal.",
    {
      id: resourceIdSchema("The Nusii proposal ID"),
      email: s.email("The single recipient email used when recipients is not provided."),
      recipients: s.array("Structured recipients; when provided, Nusii ignores email.", recipientSchema, {
        minItems: 1,
        maxItems: 10,
      }),
      cc: s.nonWhitespaceString("Comma-separated CC email addresses."),
      bcc: s.nonWhitespaceString("Comma-separated BCC email addresses."),
      subject: s.nonWhitespaceString("The proposal email subject."),
      message: s.nonWhitespaceString("The proposal email body."),
      save_email_template: s.boolean("Whether Nusii should overwrite the saved email template."),
      sender_id: resourceIdSchema("The Nusii sender user ID"),
      sender_email: s.email(
        "The sender email to resolve when sender_id is not provided; the account owner is used when both are omitted.",
      ),
    },
    {
      optional: [
        "email",
        "recipients",
        "cc",
        "bcc",
        "subject",
        "message",
        "save_email_template",
        "sender_id",
        "sender_email",
      ],
    },
  ),
  outputSchema: s.looseRequiredObject("The Nusii proposal send result.", {
    status: s.string("The send status returned by Nusii."),
    sent_at: s.dateTime("The timestamp when Nusii sent the proposal."),
    sender_id: resourceIdSchema("The Nusii user ID that sent the proposal"),
    sender_name: s.string("The name of the Nusii user that sent the proposal."),
  }),
});

const listTemplatesAction = defineProviderAction(service, {
  name: "list_templates",
  operationType: "read",
  description: "List account or public Nusii templates with optional pagination.",
  requiredScopes: [],
  inputSchema: s.object(
    "Pagination and visibility parameters for listing Nusii templates.",
    {
      page: pageSchema,
      per: perSchema,
      public_templates: s.boolean("Whether to return Nusii public templates instead of account templates."),
    },
    { optional: ["page", "per", "public_templates"] },
  ),
  outputSchema: jsonApiListOutputSchema("The paginated Nusii templates JSON API response."),
});

const getTemplateAction = defineProviderAction(service, {
  name: "get_template",
  operationType: "read",
  description: "Get one Nusii proposal template by ID.",
  requiredScopes: [],
  inputSchema: resourceInputSchema("template"),
  outputSchema: jsonApiResourceOutputSchema("The Nusii template JSON API response."),
});

const listUsersAction = defineProviderAction(service, {
  name: "list_users",
  operationType: "read",
  description: "List Nusii account users for prepared-by and sender selection.",
  requiredScopes: [],
  inputSchema: pagedInputSchema("Pagination parameters for listing Nusii users."),
  outputSchema: jsonApiListOutputSchema("The paginated Nusii users JSON API response."),
});

const listThemesAction = defineProviderAction(service, {
  name: "list_themes",
  operationType: "read",
  description: "List the proposal themes available in Nusii.",
  requiredScopes: [],
  inputSchema: s.object("No input parameters are required to list Nusii themes.", {}),
  outputSchema: s.array(
    "The proposal themes returned by Nusii.",
    s.looseRequiredObject("A Nusii proposal theme.", {
      id: s.string("The Nusii theme identifier."),
      name: s.string("The human-readable Nusii theme name."),
    }),
  ),
});

export const nusiiProposalsActions: ProviderActionDefinition[] = [
  getAccountAction,
  listClientsAction,
  getClientAction,
  createClientAction,
  listProposalsAction,
  getProposalAction,
  createProposalAction,
  updateProposalAction,
  archiveProposalAction,
  sendProposalAction,
  listTemplatesAction,
  getTemplateAction,
  listUsersAction,
  listThemesAction,
];
