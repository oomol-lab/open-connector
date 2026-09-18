import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "nutrient_document_web_services_api";

const rawObjectSchema = s.looseObject("The raw Nutrient DWS API object.");
const operationSchema = s.stringEnum("A Nutrient DWS Processor operation allowed for a JWT.", [
  "annotations_api",
  "compression_api",
  "data_extraction_api",
  "digital_signatures_api",
  "document_editor_api",
  "html_conversion_api",
  "image_conversion_api",
  "image_rendering_api",
  "email_conversion_api",
  "linearization_api",
  "ocr_api",
  "office_conversion_api",
  "pdfa_api",
  "pdf_to_office_conversion_api",
  "redaction_api",
]);

const usageSchema = s.requiredObject("Nutrient DWS credit usage values returned for the connected account.", {
  totalCredits: s.nullable(s.integer("The total credits available to the account.")),
  usedCredits: s.nullable(s.integer("The credits already used by the account.")),
});

const accountInfoSchema = s.requiredObject("Nutrient DWS account information.", {
  signedIn: s.nullable(s.boolean("Whether the API key maps to a signed-in account.")),
  subscriptionType: s.nullable(
    s.stringEnum("The subscription type reported by Nutrient DWS.", ["free", "paid", "enterprise"]),
  ),
  usage: usageSchema,
});

const requiredFeatureItemSchema = s.requiredObject(
  "A Nutrient DWS feature cost item required by the analyzed Build instructions.",
  {
    unitCost: s.nullable(s.number("The credit cost per feature unit.")),
    unitType: s.nullable(s.string("The billing unit type reported by Nutrient DWS.")),
    units: s.nullable(s.number("The number of units used by the feature.")),
    cost: s.nullable(s.number("The estimated feature cost in credits.")),
    usage: s.array(
      "The JSON paths in the instructions that triggered the feature.",
      s.string("A JSON path in the Build instructions."),
    ),
    raw: rawObjectSchema,
  },
);

const getAccountInfoAction = defineProviderAction(service, {
  name: "get_account_info",
  operationType: "read",
  description: "Retrieve sanitized account information for the connected Nutrient DWS API key.",
  inputSchema: s.object("Input for retrieving Nutrient DWS account information.", {}),
  outputSchema: s.requiredObject("A sanitized Nutrient DWS account information response.", {
    account: accountInfoSchema,
  }),
});

const analyzeBuildAction = defineProviderAction(service, {
  name: "analyze_build",
  operationType: "read",
  description:
    "Estimate Nutrient DWS Processor Build API credit usage and required features without executing the workflow.",
  inputSchema: s.requiredObject("Input for analyzing Nutrient DWS Build instructions.", {
    instructions: s.looseObject("The BuildInstructions JSON object accepted by Nutrient DWS /analyze_build."),
  }),
  outputSchema: s.requiredObject("The Nutrient DWS Build analysis response.", {
    cost: s.nullable(s.number("The total estimated credit cost if the request is executed.")),
    requiredFeatures: s.record(
      "The required features grouped by Nutrient DWS feature key.",
      s.array("The cost items for a required feature.", requiredFeatureItemSchema),
    ),
    raw: rawObjectSchema,
  }),
});

const createAuthTokenAction = defineProviderAction(service, {
  name: "create_auth_token",
  operationType: "write",
  description: "Create a Nutrient DWS JWT with optional operation, origin, and expiration restrictions.",
  inputSchema: s.object(
    "Input for creating a Nutrient DWS JWT.",
    {
      allowedOperations: s.array(
        "The Nutrient DWS operations the token may access. Omit to allow all operations.",
        operationSchema,
        { minItems: 1 },
      ),
      allowedOrigins: s.array(
        "The origins the token may be used from. Omit to allow all origins.",
        s.nonEmptyString("An allowed origin value accepted by Nutrient DWS."),
        { minItems: 1 },
      ),
      expirationTime: s.integer("The token lifetime in seconds. Nutrient DWS defaults to one hour when omitted.", {
        minimum: 1,
      }),
    },
    { optional: ["allowedOperations", "allowedOrigins", "expirationTime"] },
  ),
  outputSchema: s.requiredObject("The Nutrient DWS token creation response.", {
    id: s.string("The Nutrient DWS token ID."),
    accessToken: s.string("The generated Nutrient DWS JWT."),
  }),
});

const deleteAuthTokenAction = defineProviderAction(service, {
  name: "delete_auth_token",
  operationType: "destructive",
  description: "Revoke a Nutrient DWS JWT by token ID.",
  inputSchema: s.requiredObject("Input for deleting a Nutrient DWS JWT.", {
    tokenId: s.nonEmptyString("The Nutrient DWS token ID to revoke."),
  }),
  outputSchema: s.requiredObject("The Nutrient DWS token deletion result.", {
    success: s.boolean("Whether the token deletion request completed successfully."),
  }),
});

export const nutrientDocumentWebServicesApiActions: ActionDefinition[] = [
  getAccountInfoAction,
  analyzeBuildAction,
  createAuthTokenAction,
  deleteAuthTokenAction,
];
