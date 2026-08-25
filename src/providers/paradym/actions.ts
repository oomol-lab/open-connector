import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "paradym";

const projectIdSchema = s.nonEmptyString("The unique identifier of the Paradym project.");
const issuanceIdSchema = s.nonEmptyString("The unique identifier of the OpenID4VC issuance session.");
const verificationIdSchema = s.nonEmptyString("The unique identifier of the OpenID4VC verification session.");
const credentialTemplateIdSchema = s.nonEmptyString("The unique identifier of the Paradym credential template.");
const presentationTemplateIdSchema = s.nonEmptyString("The unique identifier of the Paradym presentation template.");

const sortSchema = s.stringEnum("Sort order accepted by Paradym list endpoints.", [
  "id",
  "-id",
  "createdAt",
  "-createdAt",
  "updatedAt",
  "-updatedAt",
]);

const pageSizeSchema = s.integer("Maximum number of items to return per page.", { minimum: 1 });
const pageAfterSchema = s.nonEmptyString("Cursor for retrieving the page after this cursor.");
const pageBeforeSchema = s.nonEmptyString("Cursor for retrieving the page before this cursor.");
const filterIdSchema = s.nonEmptyString("Filter results by item ID.");
const filterStatusSchema = s.nonEmptyString("Filter results by status.");
const searchNameSchema = s.nonEmptyString("Search results by name.");

const credentialAttributeValueSchema = s.unknown("A credential attribute JSON value.");

const credentialAttributesSchema = s.record(
  "Credential attributes keyed by template-defined attribute name.",
  credentialAttributeValueSchema,
);

const issuedCredentialStatusSchema = s.stringEnum("Filter issued credentials by status.", [
  "offered",
  "deferred",
  "failed",
  "expired",
  "issued",
  "revoked",
]);

const issuedCredentialSortSchema = s.stringEnum("Sort order accepted by the Paradym issued credentials endpoint.", [
  "id",
  "-id",
]);

const credentialOfferItemSchema = s.object(
  "One credential to include in an OpenID4VC credential offer.",
  {
    credentialTemplateId: credentialTemplateIdSchema,
    attributes: credentialAttributesSchema,
  },
  {
    optional: ["attributes"],
  },
);

const rawObjectSchema = s.looseObject("The raw Paradym object returned by the API.");
const paginationSchema = s.nullable(s.looseObject("Pagination metadata returned by Paradym."));

const projectSchema = s.object("A normalized Paradym project.", {
  id: s.string("The project ID."),
  name: s.nullable(s.string("The project name returned by Paradym.")),
  description: s.nullable(s.string("The project description returned by Paradym.")),
  tags: s.array("Project tags returned by Paradym.", s.string("A project tag.")),
  createdAt: s.nullable(s.string("The project creation timestamp returned by Paradym.")),
  updatedAt: s.nullable(s.string("The project update timestamp returned by Paradym.")),
  raw: rawObjectSchema,
});

const credentialSummarySchema = s.looseObject("A credential item returned by Paradym.", {
  id: s.string("The credential ID."),
  status: s.string("The credential status returned by Paradym."),
  credentialTemplateId: s.string("The credential template ID used for this credential."),
  format: s.string("The credential format returned by Paradym."),
  exchange: s.string("The exchange protocol returned by Paradym."),
  revocable: s.boolean("Whether the credential can be revoked."),
});

const openid4vcOfferSchema = s.object("A normalized OpenID4VC credential offer.", {
  id: s.string("The credential offer ID."),
  status: s.nullable(s.string("The credential offer status returned by Paradym.")),
  offerUri: s.nullable(s.string("The URI that can be used to accept the credential offer.")),
  offerQrUri: s.nullable(s.string("The QR-code URI for accepting the credential offer.")),
  credentialCount: s.integer("The number of credentials included in the offer."),
  createdAt: s.nullable(s.string("The offer creation timestamp returned by Paradym.")),
  updatedAt: s.nullable(s.string("The offer update timestamp returned by Paradym.")),
  expiresAt: s.nullable(s.string("The offer expiration timestamp returned by Paradym.")),
  error: s.nullable(rawObjectSchema),
  credentials: s.array("Credentials included in the offer.", credentialSummarySchema),
  raw: rawObjectSchema,
});

const issuanceSessionSchema = s.looseObject("A normalized OpenID4VC issuance session.", {
  id: s.string("The issuance session ID."),
  status: s.string("The issuance session status returned by Paradym."),
  offerUri: s.string("The credential offer URI returned by Paradym."),
  offerQrUri: s.string("The credential offer QR-code URI returned by Paradym."),
  credentials: s.array("Credentials included in the issuance session.", credentialSummarySchema),
});

const verificationSessionSchema = s.looseObject("A normalized OpenID4VC verification session.", {
  id: s.string("The verification session ID."),
  status: s.string("The verification status returned by Paradym."),
  presentationTemplateId: s.string("The presentation template ID used by this verification."),
  authorizationRequestUri: s.string("The authorization request URI returned by Paradym."),
  authorizationRequestQrUri: s.string("The authorization request QR-code URI returned by Paradym."),
  credentials: s.array("Credentials involved in the verification.", rawObjectSchema),
});

const listInputBaseSchema = {
  projectId: projectIdSchema,
  sort: sortSchema,
  filterId: filterIdSchema,
  pageSize: pageSizeSchema,
  pageAfter: pageAfterSchema,
  pageBefore: pageBeforeSchema,
};

const listInputBaseOptional = ["sort", "filterId", "pageSize", "pageAfter", "pageBefore"];

const createOpenid4vcCredentialOfferAction = defineProviderAction(service, {
  name: "create_openid4vc_credential_offer",
  description: "Create an OpenID4VC credential offer using one or more SD-JWT VC or mDoc credential templates.",
  requiredScopes: [],
  inputSchema: s.object("Request payload for creating an OpenID4VC credential offer.", {
    projectId: projectIdSchema,
    credentials: s.array(
      "Credentials to offer. Each item requires a credential template ID and JSON attributes.",
      credentialOfferItemSchema,
      { minItems: 1 },
    ),
  }),
  outputSchema: s.object("Paradym OpenID4VC credential offer response.", {
    offer: openid4vcOfferSchema,
    raw: rawObjectSchema,
  }),
});

const listProjectsAction = defineProviderAction(service, {
  name: "list_projects",
  description: "List Paradym projects accessible to the connected API key.",
  requiredScopes: [],
  inputSchema: s.object("Input parameters for listing Paradym projects.", {}),
  outputSchema: s.object("Paradym project list response.", {
    projects: s.array("Projects returned by Paradym.", projectSchema),
    raw: rawObjectSchema,
  }),
});

const getOpenid4vcIssuanceSessionAction = defineProviderAction(service, {
  name: "get_openid4vc_issuance_session",
  description: "Retrieve one OpenID4VC issuance session by ID.",
  requiredScopes: [],
  inputSchema: s.object("Request parameters for retrieving an OpenID4VC issuance session.", {
    projectId: projectIdSchema,
    openId4VcIssuanceId: issuanceIdSchema,
  }),
  outputSchema: s.object("Paradym OpenID4VC issuance session response.", {
    issuance: issuanceSessionSchema,
    raw: rawObjectSchema,
  }),
});

const listOpenid4vcIssuanceSessionsAction = defineProviderAction(service, {
  name: "list_openid4vc_issuance_sessions",
  description:
    "List OpenID4VC issuance sessions for a Paradym project with optional status, ID, cursor, and sort filters.",
  requiredScopes: [],
  inputSchema: s.object(
    "Request parameters for listing OpenID4VC issuance sessions.",
    {
      ...listInputBaseSchema,
      filterStatus: filterStatusSchema,
    },
    {
      optional: [...listInputBaseOptional, "filterStatus"],
    },
  ),
  outputSchema: s.object("Paradym OpenID4VC issuance session list response.", {
    issuances: s.array("Issuance sessions returned by Paradym.", issuanceSessionSchema),
    pagination: paginationSchema,
    raw: rawObjectSchema,
  }),
});

const createOpenid4vcVerificationRequestAction = defineProviderAction(service, {
  name: "create_openid4vc_verification_request",
  description: "Create an OpenID4VC verification request for a Paradym presentation template.",
  requiredScopes: [],
  inputSchema: s.object(
    "Request payload for creating an OpenID4VC verification request.",
    {
      projectId: projectIdSchema,
      presentationTemplateId: presentationTemplateIdSchema,
      requireResponseEncryption: s.boolean("Whether Paradym should require encrypted wallet presentation responses."),
    },
    { optional: ["requireResponseEncryption"] },
  ),
  outputSchema: s.object("Paradym OpenID4VC verification request response.", {
    verification: verificationSessionSchema,
    raw: rawObjectSchema,
  }),
});

const getOpenid4vcVerificationSessionAction = defineProviderAction(service, {
  name: "get_openid4vc_verification_session",
  description: "Retrieve one OpenID4VC verification session by ID.",
  requiredScopes: [],
  inputSchema: s.object("Request parameters for retrieving an OpenID4VC verification session.", {
    projectId: projectIdSchema,
    openId4VcVerificationId: verificationIdSchema,
  }),
  outputSchema: s.object("Paradym OpenID4VC verification session response.", {
    verification: verificationSessionSchema,
    raw: rawObjectSchema,
  }),
});

const listOpenid4vcVerificationSessionsAction = defineProviderAction(service, {
  name: "list_openid4vc_verification_sessions",
  description:
    "List OpenID4VC verification sessions for a Paradym project with optional status, template, ID, cursor, and sort filters.",
  requiredScopes: [],
  inputSchema: s.object(
    "Request parameters for listing OpenID4VC verification sessions.",
    {
      ...listInputBaseSchema,
      filterStatus: filterStatusSchema,
      filterPresentationTemplateId: presentationTemplateIdSchema,
    },
    {
      optional: [...listInputBaseOptional, "filterStatus", "filterPresentationTemplateId"],
    },
  ),
  outputSchema: s.object("Paradym OpenID4VC verification session list response.", {
    verifications: s.array("Verification sessions returned by Paradym.", verificationSessionSchema),
    pagination: paginationSchema,
    raw: rawObjectSchema,
  }),
});

const credentialTemplateListInputSchema = s.object(
  "Request parameters for listing Paradym credential templates.",
  {
    ...listInputBaseSchema,
    filterType: s.nonEmptyString("Filter templates by credential type."),
    searchName: searchNameSchema,
    filterArchived: s.boolean("Filter templates by archived status."),
    filterRevocable: s.boolean("Filter templates by revocable status."),
  },
  {
    optional: [...listInputBaseOptional, "filterType", "searchName", "filterArchived", "filterRevocable"],
  },
);

const templateListOutputSchema = s.object("Paradym template list response.", {
  templates: s.array("Templates returned by Paradym.", rawObjectSchema),
  pagination: paginationSchema,
  raw: rawObjectSchema,
});

const listSdJwtVcCredentialTemplatesAction = defineProviderAction(service, {
  name: "list_sd_jwt_vc_credential_templates",
  description: "List SD-JWT VC credential templates for a Paradym project with optional filters.",
  requiredScopes: [],
  inputSchema: credentialTemplateListInputSchema,
  outputSchema: templateListOutputSchema,
});

const listMdocCredentialTemplatesAction = defineProviderAction(service, {
  name: "list_mdoc_credential_templates",
  description: "List mDoc credential templates for a Paradym project with optional filters.",
  requiredScopes: [],
  inputSchema: credentialTemplateListInputSchema,
  outputSchema: templateListOutputSchema,
});

const listPresentationTemplatesAction = defineProviderAction(service, {
  name: "list_presentation_templates",
  description: "List Paradym presentation templates for a project with optional ID, name, cursor, and sort filters.",
  requiredScopes: [],
  inputSchema: s.object(
    "Request parameters for listing presentation templates.",
    {
      ...listInputBaseSchema,
      searchName: searchNameSchema,
    },
    { optional: [...listInputBaseOptional, "searchName"] },
  ),
  outputSchema: templateListOutputSchema,
});

const listIssuedCredentialsAction = defineProviderAction(service, {
  name: "list_issued_credentials",
  description: "List issued credential metadata for a Paradym project.",
  requiredScopes: [],
  inputSchema: s.object(
    "Request parameters for listing issued credentials.",
    {
      projectId: projectIdSchema,
      filterStatus: issuedCredentialStatusSchema,
      filterFormat: s.nonEmptyString("Filter issued credentials by credential format."),
      filterCredentialTemplateId: credentialTemplateIdSchema,
      filterExchange: s.nonEmptyString(
        "Filter issued credentials by exchange protocol, or use the string null for direct issuance.",
      ),
      sort: issuedCredentialSortSchema,
      pageSize: pageSizeSchema,
      pageAfter: pageAfterSchema,
      pageBefore: pageBeforeSchema,
    },
    {
      optional: [
        "filterStatus",
        "filterFormat",
        "filterCredentialTemplateId",
        "filterExchange",
        "sort",
        "pageSize",
        "pageAfter",
        "pageBefore",
      ],
    },
  ),
  outputSchema: s.object("Paradym issued credential list response.", {
    credentials: s.array("Issued credentials returned by Paradym.", rawObjectSchema),
    pagination: paginationSchema,
    raw: rawObjectSchema,
  }),
});

export const paradymActions: ActionDefinition[] = [
  listProjectsAction,
  createOpenid4vcCredentialOfferAction,
  getOpenid4vcIssuanceSessionAction,
  listOpenid4vcIssuanceSessionsAction,
  createOpenid4vcVerificationRequestAction,
  getOpenid4vcVerificationSessionAction,
  listOpenid4vcVerificationSessionsAction,
  listSdJwtVcCredentialTemplatesAction,
  listMdocCredentialTemplatesAction,
  listPresentationTemplatesAction,
  listIssuedCredentialsAction,
];
