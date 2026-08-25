import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "dropbox_sign";

const rawObjectSchema = s.looseObject("The raw Dropbox Sign API object.");

const pageInputProperties = {
  accountId: s.string("The Dropbox Sign account ID to list resources for. Use all to include all team members.", {
    minLength: 1,
  }),
  page: s.integer("The page number to return. Dropbox Sign defaults to 1.", { minimum: 1 }),
  pageSize: s.integer("The number of objects per page. Dropbox Sign supports 1 through 100.", {
    minimum: 1,
    maximum: 100,
  }),
  query: s.string("Search terms or field filters accepted by Dropbox Sign search.", {
    minLength: 1,
  }),
};

const listInfoSchema = s.object("Dropbox Sign pagination metadata.", {
  page: s.nullable(s.integer("The current page number returned by Dropbox Sign.")),
  numPages: s.nullable(s.integer("The total number of pages returned by Dropbox Sign.")),
  numResults: s.nullable(s.integer("The total number of matching resources.")),
  pageSize: s.nullable(s.integer("The requested or returned page size.")),
});

const accountSchema = s.object("A normalized Dropbox Sign account.", {
  accountId: s.nullable(s.string("The Dropbox Sign account ID.")),
  emailAddress: s.nullable(s.string("The email address associated with the account.")),
  isLocked: s.nullable(s.boolean("Whether the account is locked.")),
  isPaidSign: s.nullable(s.boolean("Whether the account has a paid Dropbox Sign plan.")),
  isPaidFax: s.nullable(s.boolean("Whether the account has a paid Dropbox Fax plan.")),
  callbackUrl: s.nullable(s.string("The configured account callback URL.")),
  roleCode: s.nullable(s.string("The account role code within a team.")),
  teamId: s.nullable(s.string("The Dropbox Sign team ID when present.")),
  raw: rawObjectSchema,
});

const signatureRequestSchema = s.object("A normalized Dropbox Sign signature request.", {
  signatureRequestId: s.nullable(s.string("The Dropbox Sign signature request ID.")),
  title: s.nullable(s.string("The signature request title.")),
  subject: s.nullable(s.string("The email subject used for the signature request.")),
  message: s.nullable(s.string("The message used for the signature request.")),
  isComplete: s.nullable(s.boolean("Whether all required signers have completed the request.")),
  isDeclined: s.nullable(s.boolean("Whether a signer declined the request.")),
  hasError: s.nullable(s.boolean("Whether Dropbox Sign reported an error on the request.")),
  testMode: s.nullable(s.boolean("Whether the request was created in test mode.")),
  createdAt: s.nullable(s.integer("The creation timestamp returned by Dropbox Sign.")),
  expiresAt: s.nullable(s.integer("The expiration timestamp returned by Dropbox Sign.")),
  raw: rawObjectSchema,
});

const templateSchema = s.object("A normalized Dropbox Sign template.", {
  templateId: s.nullable(s.string("The Dropbox Sign template ID.")),
  title: s.nullable(s.string("The template title.")),
  message: s.nullable(s.string("The default template message.")),
  signerRoles: s.array("The raw signer roles configured on the template.", rawObjectSchema),
  ccRoles: s.array("The raw CC roles configured on the template.", rawObjectSchema),
  isCreator: s.nullable(s.boolean("Whether the connected account created the template.")),
  canEdit: s.nullable(s.boolean("Whether the connected account can edit the template.")),
  createdAt: s.nullable(s.integer("The creation timestamp returned by Dropbox Sign.")),
  raw: rawObjectSchema,
});

export const dropboxSignActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account",
    description:
      "Retrieve Dropbox Sign account properties and settings for the connected account or a specified account.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for retrieving a Dropbox Sign account.",
      {
        accountId: s.string("The Dropbox Sign account ID to retrieve.", { minLength: 1 }),
        emailAddress: s.email("The email address of the Dropbox Sign account to retrieve."),
      },
      { optional: ["accountId", "emailAddress"] },
    ),
    outputSchema: s.object("A Dropbox Sign account response.", {
      account: accountSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_signature_requests",
    description:
      "List Dropbox Sign signature requests accessible to the connected account with optional search and pagination.",
    requiredScopes: [],
    inputSchema: s.object("Input for listing Dropbox Sign signature requests.", pageInputProperties, {
      optional: ["accountId", "page", "pageSize", "query"],
    }),
    outputSchema: s.object("A page of Dropbox Sign signature requests.", {
      signatureRequests: s.array("Signature requests returned by Dropbox Sign.", signatureRequestSchema),
      listInfo: listInfoSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_signature_request",
    description: "Retrieve one Dropbox Sign signature request by ID.",
    requiredScopes: [],
    inputSchema: s.object("Input for retrieving a Dropbox Sign signature request.", {
      signatureRequestId: s.string("The Dropbox Sign signature request ID.", { minLength: 1 }),
    }),
    outputSchema: s.object("A Dropbox Sign signature request response.", {
      signatureRequest: signatureRequestSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_templates",
    description: "List Dropbox Sign templates accessible to the connected account with optional search and pagination.",
    requiredScopes: [],
    inputSchema: s.object("Input for listing Dropbox Sign templates.", pageInputProperties, {
      optional: ["accountId", "page", "pageSize", "query"],
    }),
    outputSchema: s.object("A page of Dropbox Sign templates.", {
      templates: s.array("Templates returned by Dropbox Sign.", templateSchema),
      listInfo: listInfoSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_template",
    description: "Retrieve one Dropbox Sign template by ID.",
    requiredScopes: [],
    inputSchema: s.object("Input for retrieving a Dropbox Sign template.", {
      templateId: s.string("The Dropbox Sign template ID.", { minLength: 1 }),
    }),
    outputSchema: s.object("A Dropbox Sign template response.", {
      template: templateSchema,
    }),
  }),
];
