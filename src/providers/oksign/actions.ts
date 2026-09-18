import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "oksign";

const activeDocument = s.object(
  {
    createdate: s.nonEmptyString("The ISO 8601 timestamp when the document was uploaded."),
    creator: s.nonEmptyString("The email address or identifier of the document creator."),
    docid: s.nonEmptyString("The source document identifier returned by OKSign."),
    filename: s.nonEmptyString("The filename of the active document."),
    nbrOfSigaturesRequired: s.nonNegativeInteger("The number of signatures required by the document workflow."),
    nbrOfSigaturesValid: s.nonNegativeInteger("The number of valid signatures currently placed on the document."),
    orgtoken: s.nonEmptyString("The organizational token used when the document was uploaded via the API."),
    reusable: s.boolean("Whether the document is marked as reusable."),
    signed_docid: s.nonEmptyString("The signed document identifier when the document has a signed copy."),
    status: s.nonNegativeInteger("The OKSign numeric status code for the document."),
    viaapi: s.boolean("Whether the document was uploaded via the REST API."),
  },
  { optional: ["orgtoken", "signed_docid"], description: "Summary fields returned for one active OKSign document." },
);

const metadataFieldValue = s.anyOf(
  [
    s.string("The completed value for a non-signature field."),
    s.looseObject("Signature metadata object returned for a completed CanvasSIG field."),
  ],
  { description: "The completed field value or signature metadata object returned by OKSign." },
);

const metadataField = s.object(
  {
    inputtype: s.nonEmptyString("The field type defined in the source form descriptor."),
    name: s.nonEmptyString("The field name defined in the source form descriptor."),
    pagenbr: s.nonNegativeInteger("The zero-based page number that contains the field."),
    metadata: s.object(
      {
        value: metadataFieldValue,
      },
      { description: "Completion metadata for the field when the field has been completed." },
    ),
  },
  { optional: ["metadata"], description: "One field entry from the OKSign metadata v2 response." },
);

const metadataSigner = s.object(
  {
    mobile: s.string("The signer mobile number as stored in OKSign, possibly empty."),
    name: s.nonEmptyString("The signer display name."),
    actingas: s.string("The signer role or qualification, possibly empty."),
    id: s.nonEmptyString("The immutable signer identifier used in form descriptors."),
    email: s.nonEmptyString("The signer email address."),
  },
  { description: "One signer reference returned by OKSign metadata v2." },
);

const metadataDocument = s.object(
  {
    filename: s.nonEmptyString("The filename of the signed document."),
    size: s.nonEmptyString("The human-readable signed document size returned by OKSign."),
    nbrOfSigaturesRequired: s.nonNegativeInteger("The number of required signatures defined on the source document."),
    nbrOfSigaturesValid: s.nonNegativeInteger("The number of signatures already placed on the signed document."),
    fields: s.array(metadataField, { description: "The field definitions and completion metadata." }),
    signersinfo: s.array(metadataSigner, {
      description: "The signer information array defined on the source document.",
    }),
  },
  { description: "The signed document metadata payload returned by OKSign metadata v2." },
);

const linkedDocument = s.object(
  {
    source_docid: s.nonEmptyString("The source document identifier tied to the lookup result."),
    signed_docid: s.nonEmptyString("The signed document identifier when a signed copy exists for the source document."),
    ts: s.nonEmptyString(
      "The timestamp when the document was first signed or uploaded when no signed copy exists yet.",
    ),
  },
  { optional: ["signed_docid"], description: "Linked source and signed document identifiers returned by OKSign." },
);

const user = s.object(
  {
    actingas: s.string("The user role or qualification as stored in OKSign."),
    email: s.nonEmptyString("The user email address."),
    language: s.nonEmptyString("The preferred language code configured for the user."),
    mobile: s.string("The user mobile number, possibly empty."),
    name: s.nonEmptyString("The user display name."),
    role: s.nonEmptyString("The account role assigned to the user."),
    signerid: s.nonEmptyString("The immutable signer identifier assigned to the user."),
    status: s.nonEmptyString("The current account status for the user."),
    ts: s.nonEmptyString("The timestamp when the user was created or updated."),
  },
  { description: "One user returned by the OKSign users endpoint." },
);

const noInput = s.actionInput({}, [], "No input is required for this action.");
const docIdInput = s.actionInput(
  {
    docId: s.nonEmptyString("The source_docid or signed_docid to send as x-oksign-docid."),
  },
  ["docId"],
  "Input parameters for an OKSign document identifier lookup.",
);

export type OksignActionName =
  | "get_credits"
  | "list_active_documents"
  | "get_document_metadata"
  | "get_linked_document"
  | "list_users";

export const oksignActions: ActionDefinition[] = [
  action(
    "get_credits",
    "read",
    "Get OKSign credits balance, expiry, and account storage details.",
    noInput,
    s.actionOutput(
      {
        accountSize: s.nonNegativeInteger("The current storage usage in bytes."),
        maxAccountSize: s.nonNegativeInteger("The maximum storage capacity in bytes."),
        paid: s.boolean("Whether the account is on a paid plan."),
        quantity: s.nonNegativeInteger("The current credit balance quantity."),
        subscription: s.nonEmptyString("The current OKSign subscription tier code."),
        validUntil: s.nonEmptyString("The ISO 8601 timestamp when the credit balance expires."),
      },
      "Credits and storage summary returned by OKSign.",
    ),
  ),
  action(
    "list_active_documents",
    "read",
    "List active OKSign documents visible in the current account.",
    noInput,
    s.actionOutput(
      {
        documents: s.array(activeDocument, { description: "The active documents visible in the account." }),
      },
      "Active document list returned by OKSign.",
    ),
  ),
  action(
    "get_document_metadata",
    "read",
    "Get OKSign metadata v2 for a signed document by signed_docid.",
    docIdInput,
    s.actionOutput(
      {
        document: metadataDocument,
      },
      "Metadata v2 response wrapper returned by OKSign.",
    ),
  ),
  action(
    "get_linked_document",
    "read",
    "Resolve the corresponding source_docid and signed_docid pair for an OKSign document identifier.",
    docIdInput,
    s.actionOutput(
      {
        document: s.nullable(linkedDocument),
      },
      "Linked document lookup response wrapper returned by OKSign.",
    ),
  ),
  action(
    "list_users",
    "read",
    "List the users configured in the current OKSign account.",
    noInput,
    s.actionOutput(
      {
        users: s.array(user, { description: "The users configured in the OKSign account." }),
      },
      "User list returned by OKSign.",
    ),
  ),
];

function action(
  name: OksignActionName,
  operationType: ActionDefinition["operationType"],
  description: string,
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
): ActionDefinition {
  return defineProviderAction(service, {
    name,
    operationType,
    description,
    requiredScopes: [],
    inputSchema,
    outputSchema,
  });
}
