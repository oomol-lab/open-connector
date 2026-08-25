import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "boldsign";

const rawObjectSchema = s.looseObject("The raw object returned by the BoldSign API.");

const documentStatusSchema = s.stringEnum("The current BoldSign document status.", [
  "InProgress",
  "Completed",
  "Declined",
  "Expired",
  "Revoked",
  "Draft",
  "Scheduled",
]);

const documentListStatusSchema = s.stringEnum("A BoldSign document list status filter.", [
  "None",
  "WaitingForMe",
  "WaitingForOthers",
  "NeedAttention",
  "Completed",
  "Declined",
  "Revoked",
  "Expired",
  "Draft",
  "Scheduled",
]);

const paginationSchema = s.object("Normalized BoldSign pagination details.", {
  page: s.nullable(s.integer("The current page number.")),
  pageSize: s.nullable(s.integer("The number of records requested per page.")),
  totalRecords: s.nullable(s.integer("The total number of matching records.")),
  totalPages: s.nullable(s.integer("The total number of available pages.")),
});

const documentSummarySchema = s.object("A normalized BoldSign document summary.", {
  documentId: s.nonEmptyString("The BoldSign document identifier."),
  title: s.nullable(s.string("The document title.")),
  status: documentStatusSchema,
  createdAt: s.nullable(s.integer("The Unix timestamp when the document was created.")),
  activityAt: s.nullable(s.integer("The Unix timestamp of the latest document activity.")),
  expiryAt: s.nullable(s.integer("The Unix timestamp when the document expires.")),
  labels: s.array("Labels attached to the document.", s.string("A document label.")),
  cursor: s.nullable(s.integer("The cursor used for pagination beyond 10,000 records.")),
  raw: rawObjectSchema,
});

const documentDetailsSchema = s.object("Normalized details for one BoldSign document.", {
  documentId: s.nonEmptyString("The BoldSign document identifier."),
  title: s.nullable(s.string("The document title.")),
  description: s.nullable(s.string("The document description.")),
  status: documentStatusSchema,
  createdAt: s.nullable(s.integer("The Unix timestamp when the document was created.")),
  expiryAt: s.nullable(s.integer("The Unix timestamp when the document expires.")),
  labels: s.array("Labels attached to the document.", s.string("A document label.")),
  signers: s.array("Signer details returned by BoldSign.", rawObjectSchema),
  raw: rawObjectSchema,
});

const templateSummarySchema = s.object("A normalized BoldSign template summary.", {
  templateId: s.nonEmptyString("The BoldSign template identifier."),
  name: s.nullable(s.string("The template name.")),
  description: s.nullable(s.string("The template description.")),
  createdAt: s.nullable(s.integer("The Unix timestamp when the template was created.")),
  activityAt: s.nullable(s.integer("The Unix timestamp of the latest template activity.")),
  labels: s.array("Labels attached to the template.", s.string("A template label.")),
  accessType: s.nullable(s.string("The connected account's access level for the template.")),
  raw: rawObjectSchema,
});

const templateDetailsSchema = s.object("Normalized details for one BoldSign template.", {
  templateId: s.nonEmptyString("The BoldSign template identifier."),
  title: s.nullable(s.string("The template title.")),
  description: s.nullable(s.string("The template description.")),
  documentTitle: s.nullable(s.string("The default title used for documents from this template.")),
  documentMessage: s.nullable(s.string("The default recipient message used for documents from this template.")),
  createdAt: s.nullable(s.integer("The Unix timestamp when the template was created.")),
  labels: s.array("Labels attached to the template.", s.string("A template label.")),
  roles: s.array("Roles configured on the template.", rawObjectSchema),
  files: s.array("Files configured on the template.", rawObjectSchema),
  raw: rawObjectSchema,
});

const pageInputProperties = {
  page: s.integer("The page number to return. Defaults to 1.", { minimum: 1 }),
  pageSize: s.integer("The number of records to return per page.", { minimum: 1 }),
};

const templateRoleInputSchema = s.object(
  "A template role mapped to a real signer.",
  {
    roleIndex: s.integer("The one-based role position from the template, from 1 through 50.", {
      minimum: 1,
      maximum: 50,
    }),
    signerName: s.nonEmptyString("The signer's display name."),
    signerEmail: s.email("The signer's email address."),
    signerOrder: s.integer("The signer's order when ordered signing is enabled.", {
      minimum: 1,
    }),
    privateMessage: s.string("A private message displayed only to this signer.", {
      maxLength: 5000,
    }),
    signerType: s.stringEnum("The signer's role in the signing workflow.", ["Signer", "Reviewer", "InPersonSigner"]),
    locale: s.stringEnum("The locale used for signer pages and emails.", [
      "EN",
      "NO",
      "FR",
      "DE",
      "ES",
      "BG",
      "CS",
      "DA",
      "IT",
      "NL",
      "PL",
      "PT",
      "RO",
      "RU",
      "SV",
      "JA",
      "TH",
      "ZH_CN",
      "ZH_TW",
      "KO",
    ]),
  },
  {
    optional: ["signerName", "signerEmail", "signerOrder", "privateMessage", "signerType", "locale"],
  },
);

export const boldSignActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_api_credits",
    description: "Get the remaining BoldSign API document credits for the connected account.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for retrieving BoldSign API credits.", {}),
    outputSchema: s.object("The connected account's remaining BoldSign API credits.", {
      balanceCredits: s.number("The remaining number of BoldSign API document credits."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_documents",
    description: "List BoldSign documents available to the connected account with filters and pagination.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters and pagination for listing BoldSign documents.",
      {
        ...pageInputProperties,
        sentBy: s.array("Sender email addresses to include.", s.email("A sender email address.")),
        recipients: s.array("Recipient email addresses to include.", s.email("A recipient email address.")),
        transmitType: s.stringEnum("Whether to include sent, received, or both document sets.", [
          "Sent",
          "Received",
          "Both",
        ]),
        dateFilterType: s.stringEnum("How the date range should be applied.", ["SentBetween", "Expiring"]),
        startDate: s.dateTime("The start of the document date range."),
        endDate: s.dateTime("The end of the document date range."),
        statuses: s.array("Document statuses to include.", documentListStatusSchema),
        searchKey: s.nonEmptyString("Text matched against document titles, IDs, senders, and recipients."),
        labels: s.array("Document labels to include.", s.nonEmptyString("A document label.")),
        nextCursor: s.integer("The cursor for results beyond 10,000 records.", { minimum: 0 }),
        brandIds: s.array("BoldSign brand IDs to include.", s.nonEmptyString("A brand ID.")),
      },
      {
        optional: [
          "page",
          "pageSize",
          "sentBy",
          "recipients",
          "transmitType",
          "dateFilterType",
          "startDate",
          "endDate",
          "statuses",
          "searchKey",
          "labels",
          "nextCursor",
          "brandIds",
        ],
      },
    ),
    outputSchema: s.object("A page of BoldSign documents.", {
      documents: s.array("Documents returned by BoldSign.", documentSummarySchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_document_details",
    description: "Get the status, signers, and full JSON details for one BoldSign document.",
    requiredScopes: [],
    inputSchema: s.object("The BoldSign document to retrieve.", {
      documentId: s.nonEmptyString("The BoldSign document identifier."),
    }),
    outputSchema: s.object("The requested BoldSign document.", {
      document: documentDetailsSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_templates",
    description: "List BoldSign templates available to the connected account with filters and pagination.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters and pagination for listing BoldSign templates.",
      {
        ...pageInputProperties,
        templateType: s.stringEnum("The template ownership set to include.", ["mytemplates", "sharedtemplate", "all"]),
        searchKey: s.nonEmptyString("Text matched against available templates."),
        onBehalfOf: s.array(
          "Sender identity emails used to filter templates.",
          s.email("A sender identity email address."),
        ),
        createdBy: s.array(
          "Creator email addresses used to filter templates.",
          s.email("A template creator email address."),
        ),
        labels: s.array("Template labels to include.", s.nonEmptyString("A template label.")),
        startDate: s.dateTime("The start of the template creation date range."),
        endDate: s.dateTime("The end of the template creation date range."),
        brandIds: s.array("BoldSign brand IDs to include.", s.nonEmptyString("A brand ID.")),
        sharedWithTeamIds: s.array(
          "BoldSign team IDs used to filter shared templates.",
          s.nonEmptyString("A team ID."),
        ),
      },
      {
        optional: [
          "page",
          "pageSize",
          "templateType",
          "searchKey",
          "onBehalfOf",
          "createdBy",
          "labels",
          "startDate",
          "endDate",
          "brandIds",
          "sharedWithTeamIds",
        ],
      },
    ),
    outputSchema: s.object("A page of BoldSign templates.", {
      templates: s.array("Templates returned by BoldSign.", templateSummarySchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_template_details",
    description: "Get roles, files, and full JSON details for one BoldSign template.",
    requiredScopes: [],
    inputSchema: s.object("The BoldSign template to retrieve.", {
      templateId: s.nonEmptyString("The BoldSign template identifier."),
    }),
    outputSchema: s.object("The requested BoldSign template.", {
      template: templateDetailsSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "send_document_from_template",
    description: "Send a BoldSign signature request from an existing template and return the new document ID.",
    requiredScopes: [],
    followUpActions: ["boldsign.get_document_details"],
    inputSchema: s.object(
      "A BoldSign template-based signature request.",
      {
        templateId: s.nonEmptyString("The existing BoldSign template identifier."),
        title: s.string("The title shown in BoldSign and signature request emails.", {
          maxLength: 256,
        }),
        message: s.string("A message sent to all recipients.", { maxLength: 5000 }),
        roles: s.array("Template roles mapped to real signers.", templateRoleInputSchema, {
          minItems: 1,
          maxItems: 50,
        }),
        fileUrls: s.array(
          "Public file URLs added when the template permits new files. BoldSign fetches these URLs.",
          s.url("A publicly accessible document URL."),
          { minItems: 1, maxItems: 25 },
        ),
        labels: s.array(
          "Labels attached to the created document.",
          s.string("A document label without whitespace.", { maxLength: 255 }),
        ),
        cc: s.array("Email addresses copied on the signature request.", s.email("A CC email.")),
        disableEmails: s.boolean("Whether to disable document-related emails."),
        disableSms: s.boolean("Whether to disable document-related SMS notifications."),
        enableSigningOrder: s.boolean("Whether signers must complete the document in order."),
        enableReassign: s.boolean("Whether signers may reassign the signature request."),
        enablePrintAndSign: s.boolean("Whether signers may print, sign, and upload the document."),
        expiryDateType: s.stringEnum("How the expiry value should be interpreted.", [
          "Days",
          "Hours",
          "SpecificDateTime",
        ]),
        expiryValue: s.integer("The expiry duration or Unix timestamp for the selected type.", {
          minimum: 1,
        }),
        onBehalfOf: s.email("The BoldSign user email to send on behalf of."),
        isSandbox: s.boolean("Whether to send the request in BoldSign sandbox mode."),
        metadata: s.record("Custom string metadata attached to the document.", s.string("A metadata value.")),
      },
      {
        optional: [
          "title",
          "message",
          "roles",
          "fileUrls",
          "labels",
          "cc",
          "disableEmails",
          "disableSms",
          "enableSigningOrder",
          "enableReassign",
          "enablePrintAndSign",
          "expiryDateType",
          "expiryValue",
          "onBehalfOf",
          "isSandbox",
          "metadata",
        ],
      },
    ),
    outputSchema: s.object("The document created from the BoldSign template.", {
      documentId: s.nonEmptyString("The new BoldSign document identifier used for status and details requests."),
    }),
  }),
];
