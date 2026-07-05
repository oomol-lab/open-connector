import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "esignatures_io";

const yesNoStringSchema = s.nullable(s.stringEnum("The yes or no flag returned by eSignatures.com.", ["yes", "no"]));
const rawObjectSchema = s.looseObject("The raw eSignatures.com API object.");

const signerSchema = s.object("A normalized eSignatures.com signer.", {
  id: s.nullableString("The eSignatures.com signer ID."),
  name: s.nullableString("The signer name."),
  email: s.nullableString("The signer email address."),
  mobile: s.nullableString("The signer mobile number."),
  companyName: s.nullableString("The signer company name."),
  signPageUrl: s.nullableString("The URL where this signer can review and sign."),
  signerFieldValues: s.nullable(s.looseObject("Values entered by the signer for template signer fields.")),
  raw: rawObjectSchema,
});

const contractSchema = s.object("A normalized eSignatures.com contract.", {
  id: s.nullableString("The eSignatures.com contract ID."),
  status: s.nullableString("The contract status returned by eSignatures.com."),
  title: s.nullableString("The contract title."),
  metadata: s.nullableString("The custom metadata attached to the contract."),
  source: s.nullableString("The source that created the contract, such as api or ui."),
  test: yesNoStringSchema,
  contractPdfUrl: s.nullable(s.url("The temporary URL for the finalized signed PDF when eSignatures.com returns one.")),
  labels: s.array("Labels assigned to the contract.", s.string("One contract label.")),
  signers: s.array("Signers attached to the contract.", signerSchema),
  raw: rawObjectSchema,
});

const templateSchema = s.object("A normalized eSignatures.com template.", {
  templateId: s.nullableString("The eSignatures.com template ID."),
  title: s.nullableString("The template title."),
  createdAt: s.nullableString("The template creation timestamp returned by eSignatures.com."),
  placeholderFields: s.array(
    "Placeholder field keys configured in the template.",
    s.string("One placeholder field key."),
  ),
  signerFields: s.array("Signer field IDs configured in the template.", s.string("One signer field ID.")),
  raw: rawObjectSchema,
});

const contractIdInputSchema = s.object("Input for selecting an eSignatures.com contract.", {
  contractId: s.nonEmptyString("The eSignatures.com contract ID."),
});

const templateIdInputSchema = s.object("Input for selecting an eSignatures.com template.", {
  templateId: s.nonEmptyString("The eSignatures.com template ID."),
});

const signerDeliveryMethodSchema = s.stringEnum(
  "How eSignatures.com should deliver the signature request to the signer.",
  ["email", "sms"],
);
const signedDocumentDeliveryMethodSchema = s.stringEnum(
  "How eSignatures.com should deliver the final signed document to the signer.",
  ["email", "sms", ""],
);
const multiFactorAuthenticationSchema = s.stringEnum(
  "A multi-factor authentication method eSignatures.com should require for the signer.",
  ["sms_verification_code", "email_verification_code", "photo_id"],
);

const signerInputSchema = {
  ...s.object(
    "One signer to add to a new eSignatures.com contract.",
    {
      name: s.nonEmptyString("The signer name."),
      email: s.email("The signer email address."),
      mobile: s.nonEmptyString("The signer mobile number, including country code when needed."),
      companyName: s.nonEmptyString("The signer company name."),
      signingOrder: s.positiveInteger(
        "The sequence number for signing. Signers with the same number are notified together.",
      ),
      autoSign: s.boolean("Whether eSignatures.com should automatically sign for this signer."),
      signatureRequestDeliveryMethods: s.array(
        "Delivery methods for the signature request. Use an empty array to skip sending.",
        signerDeliveryMethodSchema,
      ),
      signedDocumentDeliveryMethod: signedDocumentDeliveryMethodSchema,
      multiFactorAuthentications: s.array(
        "Multi-factor authentication methods required for this signer.",
        multiFactorAuthenticationSchema,
      ),
      redirectUrl: s.url("The URL eSignatures.com redirects the signer to after signing."),
    },
    {
      optional: [
        "email",
        "mobile",
        "companyName",
        "signingOrder",
        "autoSign",
        "signatureRequestDeliveryMethods",
        "signedDocumentDeliveryMethod",
        "multiFactorAuthentications",
        "redirectUrl",
      ],
    },
  ),
  anyOf: [{ required: ["email"] }, { required: ["mobile"] }],
} satisfies JsonSchema;

const placeholderFieldInputSchema = s.object(
  "One placeholder replacement for a new eSignatures.com contract.",
  {
    placeholderKey: s.nonEmptyString("The template placeholder key without surrounding braces."),
    replaceWithText: s.nonEmptyString("Plain text to replace the placeholder."),
    replaceWithMarkdown: s.nonEmptyString("Markdown content to replace the placeholder."),
    replaceWithTemplate: s.nonEmptyString("Template ID whose full content should replace the placeholder."),
  },
  { optional: ["replaceWithText", "replaceWithMarkdown", "replaceWithTemplate"] },
);

const signerFieldInputSchema = s.object("One signer field default value.", {
  signerFieldId: s.nonEmptyString("The signer field ID configured in the template editor."),
  defaultValue: s.nonEmptyString("The default value eSignatures.com should pre-fill."),
});

const emailsInputSchema = s.object(
  "Custom email copy for eSignatures.com contract notifications.",
  {
    signatureRequestSubject: s.nonEmptyString("The email subject used to request a signature."),
    signatureRequestText: s.nonEmptyString("The email body used to request a signature."),
    finalContractSubject: s.nonEmptyString("The email subject used to send the signed contract."),
    finalContractText: s.nonEmptyString("The email body used to send the signed contract."),
    ccEmailAddresses: s.array(
      "Email addresses to CC when eSignatures.com sends the signed PDF.",
      s.email("One CC email address."),
    ),
    replyTo: s.email("The reply-to email address for contract emails."),
  },
  {
    optional: [
      "signatureRequestSubject",
      "signatureRequestText",
      "finalContractSubject",
      "finalContractText",
      "ccEmailAddresses",
      "replyTo",
    ],
  },
);

const customBrandingInputSchema = s.object(
  "Custom branding values for the eSignatures.com signing flow.",
  {
    companyName: s.nonEmptyString("The company name eSignatures.com should display as sender."),
    logoUrl: s.url("The URL of the custom logo image."),
  },
  { optional: ["companyName", "logoUrl"] },
);

export const esignaturesIoActions: Array<ProviderActionDefinition<EsignaturesIoActionName>> = [
  defineProviderAction(service, {
    name: "create_template",
    description: "Create an eSignatures.com template from a title, Markdown document content, and optional labels.",
    inputSchema: s.object(
      "Input for creating an eSignatures.com template.",
      {
        title: s.nonEmptyString("The title of the new template."),
        markdown: s.nonEmptyString("The Markdown document content for the template."),
        labels: s.array("Labels to assign to the template.", s.string("One template label.")),
      },
      { optional: ["labels"] },
    ),
    outputSchema: s.object("Created eSignatures.com template IDs.", {
      templates: s.array("Created template records returned by eSignatures.com.", templateSchema),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_templates",
    description: "List eSignatures.com templates available to the connected account.",
    inputSchema: s.object("Input for listing eSignatures.com templates.", {}),
    outputSchema: s.object("A list of eSignatures.com templates.", {
      templates: s.array("Templates returned by eSignatures.com.", templateSchema),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_template",
    description: "Retrieve one eSignatures.com template by ID.",
    inputSchema: templateIdInputSchema,
    outputSchema: s.object("An eSignatures.com template response.", {
      template: templateSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_template_content",
    description: "Retrieve the Markdown content for one eSignatures.com template.",
    inputSchema: templateIdInputSchema,
    outputSchema: s.object("The Markdown content of an eSignatures.com template.", {
      templateId: s.nullableString("The eSignatures.com template ID."),
      markdown: s.nullableString("The template Markdown content."),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_contract",
    description:
      "Create an eSignatures.com contract from an existing template and signer list, sending it unless saved as a draft.",
    inputSchema: s.object(
      "Input for creating an eSignatures.com contract.",
      {
        templateId: s.nonEmptyString("The template ID eSignatures.com should use for the contract."),
        signers: s.array("People required to sign the contract.", signerInputSchema, { minItems: 1 }),
        title: s.nonEmptyString("The contract title. Defaults to the template title when omitted."),
        locale: s.nonEmptyString("The language setting for signer pages and emails."),
        metadata: s.nonEmptyString("Custom metadata to attach to the contract."),
        expiresInHours: s.positiveInteger("The number of hours before the contract expires."),
        customWebhookUrl: s.url("A webhook URL eSignatures.com should notify for this contract."),
        assignedUserEmail: s.email("The eSignatures.com user email assigned to manage the contract."),
        labels: s.array("Labels to assign to the contract.", s.string("One contract label.")),
        test: s.boolean("Whether eSignatures.com should mark the contract as a test."),
        saveAsDraft: s.boolean("Whether eSignatures.com should save the contract as a draft instead of sending it."),
        placeholderFields: s.array(
          "Placeholder replacements to apply when creating the contract.",
          placeholderFieldInputSchema,
        ),
        signerFields: s.array("Signer field default values to pre-fill on the contract.", signerFieldInputSchema),
        emails: emailsInputSchema,
        customBranding: customBrandingInputSchema,
      },
      {
        optional: [
          "title",
          "locale",
          "metadata",
          "expiresInHours",
          "customWebhookUrl",
          "assignedUserEmail",
          "labels",
          "test",
          "saveAsDraft",
          "placeholderFields",
          "signerFields",
          "emails",
          "customBranding",
        ],
      },
    ),
    outputSchema: s.object("An eSignatures.com create contract response.", {
      status: s.nullableString("The operation status returned by eSignatures.com."),
      contract: contractSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_contract",
    description: "Retrieve one eSignatures.com contract by ID.",
    inputSchema: contractIdInputSchema,
    outputSchema: s.object("An eSignatures.com contract response.", {
      contract: contractSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_contract_content",
    description: "Retrieve the Markdown content for one eSignatures.com contract.",
    inputSchema: contractIdInputSchema,
    outputSchema: s.object("The Markdown content of an eSignatures.com contract.", {
      contractId: s.nullableString("The eSignatures.com contract ID."),
      markdown: s.nullableString("The contract Markdown content."),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "withdraw_contract",
    description: "Withdraw an eSignatures.com contract so it can no longer be signed while preserving query access.",
    inputSchema: contractIdInputSchema,
    outputSchema: s.object("An eSignatures.com withdraw contract response.", {
      status: s.nullableString("The operation status returned by eSignatures.com."),
      raw: rawObjectSchema,
    }),
  }),
];

export type EsignaturesIoActionName =
  | "create_template"
  | "list_templates"
  | "get_template"
  | "get_template_content"
  | "create_contract"
  | "get_contract"
  | "get_contract_content"
  | "withdraw_contract";
