import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "craftmypdf";

const accountSchema = s.object(
  {
    username: s.nonEmptyString("The CraftMyPDF account username associated with the API key."),
    quotaCounter: s.number("The amount of quota already consumed by the account."),
    quotaMax: s.number("The maximum quota allocated to the account."),
    templateCounter: s.integer("The number of templates currently stored in the account."),
    templateMax: s.integer("The maximum number of templates allowed for the account."),
    createdAt: s.nonEmptyString("The ISO 8601 timestamp when the account was created."),
  },
  { required: ["username", "quotaCounter", "quotaMax", "templateCounter", "templateMax", "createdAt"] },
);

const templateSchema = s.object(
  {
    templateId: s.nonEmptyString("The template identifier."),
    name: s.nonEmptyString("The template display name."),
    status: s.nonEmptyString("The current upstream template status."),
    createdAt: s.nonEmptyString("The ISO 8601 timestamp when the template was created."),
    updatedAt: s.nullableString("The ISO 8601 timestamp when the template was last updated."),
    groupName: s.nullableString("The optional CraftMyPDF template group name."),
  },
  { required: ["templateId", "name", "status", "createdAt", "updatedAt", "groupName"] },
);

const anchorSchema = s.looseObject(
  {
    page: s.integer("The 1-based page number of the anchor."),
    text: s.string("The anchor text when present."),
    level: s.string("The hierarchical level reported by CraftMyPDF."),
    description: s.string("The optional anchor description."),
  },
  { description: "An anchor entry returned by CraftMyPDF for table-of-contents style output." },
);

export const craftmypdfActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account_info",
    description: "Get the current CraftMyPDF account details resolved by the provided API key.",
    inputSchema: s.object({}, { description: "No input parameters are required for this action." }),
    outputSchema: s.object({ account: accountSchema }, { required: ["account"] }),
  }),
  defineProviderAction(service, {
    name: "list_templates",
    description: "List CraftMyPDF templates with optional pagination and group-name filtering.",
    inputSchema: s.object(
      {
        limit: s.positiveInteger("The maximum number of templates to return."),
        offset: s.nonNegativeInteger("The number of templates to skip before returning results."),
        groupName: s.nonEmptyString("Filter templates by CraftMyPDF group_name."),
      },
      { optional: ["limit", "offset", "groupName"], description: "Input parameters for listing CraftMyPDF templates." },
    ),
    outputSchema: s.object(
      {
        templates: s.array("The CraftMyPDF templates returned for the request.", templateSchema),
      },
      { required: ["templates"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_template",
    description: "Get the raw CraftMyPDF template body and sample JSON for one template ID.",
    inputSchema: s.object(
      {
        templateId: s.nonEmptyString("The template identifier to retrieve."),
        version: s.nonEmptyString("The optional template version string. Omit it to retrieve the latest version."),
      },
      { required: ["templateId"], description: "Input parameters for retrieving one CraftMyPDF template." },
    ),
    outputSchema: s.object(
      {
        template: s.object(
          {
            name: s.nonEmptyString("The template display name."),
            body: s.nonEmptyString("The raw CraftMyPDF template body string."),
            sampleDataJson: s.nullableString("The sample JSON string stored with the template."),
          },
          { required: ["name", "body", "sampleDataJson"] },
        ),
      },
      { required: ["template"] },
    ),
  }),
  defineProviderAction(service, {
    name: "create_pdf",
    description: "Generate a PDF from a CraftMyPDF template and return the hosted file URL plus transaction metadata.",
    inputSchema: s.object(
      {
        templateId: s.nonEmptyString("The CraftMyPDF template_id value."),
        data: s.anyOf("The template data payload. CraftMyPDF accepts a JSON string or JSON object.", [
          s.nonEmptyString("A stringified JSON payload passed directly to CraftMyPDF."),
          s.looseObject("A JSON object payload passed directly to CraftMyPDF."),
        ]),
        loadDataFrom: s.nonEmptyString("An optional external URL for loading template data."),
        version: s.nonEmptyString("The optional template version string. Omit it to use the latest version."),
        expiration: s.integer("The file URL expiration time in minutes.", { minimum: 1, maximum: 10080 }),
        outputFile: s.nonEmptyString("The output PDF filename."),
        imageResampleResolution: s.positiveInteger("An optional DPI value for CraftMyPDF image downsampling."),
        directDownload: s.boolean("Whether the generated PDF should be marked for direct download."),
        cloudStorage: s.boolean("Whether CraftMyPDF should keep the generated PDF in its CDN-backed storage."),
        paging: s.stringEnum("The paging mode used when templateId contains multiple template IDs.", [
          "continuous",
          "reset",
        ]),
      },
      {
        required: ["templateId", "data"],
        optional: [
          "loadDataFrom",
          "version",
          "expiration",
          "outputFile",
          "imageResampleResolution",
          "directDownload",
          "cloudStorage",
          "paging",
        ],
        description: "Input parameters for generating a PDF with CraftMyPDF.",
      },
    ),
    outputSchema: s.object(
      {
        fileUrl: s.nonEmptyString("The hosted PDF URL returned by CraftMyPDF."),
        transactionRef: s.nonEmptyString("The CraftMyPDF transaction reference for this generation request."),
        anchors: s.array("The anchor metadata returned by CraftMyPDF when available.", anchorSchema),
      },
      { required: ["fileUrl", "transactionRef", "anchors"] },
    ),
  }),
];
