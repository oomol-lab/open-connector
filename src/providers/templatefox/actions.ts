import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "templatefox";

const templateIdSchema = s.string("The 12-character TemplateFox template ID.", {
  minLength: 12,
  maxLength: 12,
});
const templateDataSchema = s.looseObject("Template data keyed by TemplateFox variable names.");
const expirationSchema = s.integer("Signed URL expiration in seconds.", {
  minimum: 60,
  maximum: 604800,
});
const filenameSchema = s.string("Custom output filename without the file extension.", {
  minLength: 1,
  maxLength: 100,
});
const versionSchema = s.string(
  "Template version tag or version number. When omitted, TemplateFox uses the current draft.",
  { minLength: 1, maxLength: 50 },
);
const pdfVariantSchema = s.stringEnum("PDF standards-compliant output variant.", ["pdf/a-1b", "pdf/a-2b", "pdf/a-3b"]);
const imageFormatSchema = s.stringEnum("Generated image format.", ["png", "jpeg", "webp"]);
const pdfResultSchema = s.requiredObject("Generated PDF URL result returned by TemplateFox.", {
  url: s.url("Signed URL to download the generated PDF."),
  filename: s.string("Filename of the generated PDF."),
  creditsRemaining: s.integer("Remaining TemplateFox credits after the request."),
  expiresIn: s.integer("Seconds until the signed URL expires."),
});
const imageResultSchema = s.requiredObject("Generated image URL result returned by TemplateFox.", {
  url: s.url("Signed URL to download the generated image."),
  filename: s.string("Filename of the generated image."),
  creditsRemaining: s.integer("Remaining TemplateFox credits after the request."),
  expiresIn: s.integer("Seconds until the signed URL expires."),
  warnings: s.nullable(
    s.stringArray("Non-fatal warnings returned by TemplateFox.", {
      itemDescription: "A warning message.",
    }),
  ),
});
const templateSchema = s.looseRequiredObject("TemplateFox template summary.", {
  id: s.string("Template ID."),
  name: s.string("Template name."),
  kind: s.nullable(s.stringEnum("Template kind.", ["pdf", "image"])),
  createdAt: s.nullableString("Template creation timestamp."),
  updatedAt: s.nullableString("Template update timestamp."),
});
const templateFieldSpecSchema = s.looseRequiredObject("TemplateFox nested array field spec.", {
  name: s.string("Nested field name."),
  label: s.string("Nested field label."),
  type: s.string("Nested field type."),
});
const templateFieldSchema = s.looseRequiredObject("TemplateFox template field definition.", {
  key: s.string("Template field key."),
  label: s.string("Template field label."),
  type: s.string("Template field type."),
  required: s.boolean("Whether the field is required."),
  helpText: s.nullableString("Help text returned by TemplateFox."),
  spec: s.nullable(s.array("Nested field spec for array fields.", templateFieldSpecSchema)),
});
const accountSchema = s.requiredObject("TemplateFox account information.", {
  credits: s.integer("Remaining TemplateFox credits."),
  email: s.nullableString("Account email address returned by TemplateFox."),
});
const modificationSchema = s.object(
  "A single image template layer modification.",
  {
    name: s.string("Layer name to modify.", { minLength: 1, maxLength: 200 }),
    text: s.string("Replacement text for the layer.", { maxLength: 10000 }),
    imageUrl: s.string("Replacement image URL for the layer.", {
      format: "uri",
      maxLength: 2000,
    }),
    color: s.string("CSS text color applied to the layer.", { maxLength: 100 }),
    background: s.string("CSS background color applied to the layer.", { maxLength: 100 }),
    hidden: s.boolean("Whether the layer should be hidden."),
  },
  { optional: ["text", "imageUrl", "color", "background", "hidden"] },
);
const pdfUrlSchema = s.url("Public HTTPS URL for TemplateFox to download the PDF.");
const pageRotationSchema: JsonSchema = {
  type: "integer",
  enum: [0, 90, 180, 270],
  description: "Rotation in degrees for this page.",
};
const pageRotationsSchema: JsonSchema = {
  type: "object",
  propertyNames: {
    pattern: "^[1-9][0-9]*$",
  },
  additionalProperties: pageRotationSchema,
  description: "Per-page rotations keyed by 1-indexed page number.",
};
const rotationSchema: JsonSchema = {
  type: "integer",
  enum: [0, 90, 180, 270],
  description: "Rotation in degrees applied to every page.",
};

const createPdfInputSchema = s.object(
  "Input for generating a PDF from a TemplateFox template.",
  {
    templateId: templateIdSchema,
    data: templateDataSchema,
    expiration: expirationSchema,
    filename: filenameSchema,
    pdfVariant: pdfVariantSchema,
    version: versionSchema,
  },
  { optional: ["expiration", "filename", "pdfVariant", "version"] },
);

const createImageInputSchema = s.object(
  "Input for generating an image from a TemplateFox template.",
  {
    templateId: templateIdSchema,
    modifications: s.array("Layer modifications to apply before rendering.", modificationSchema, {
      maxItems: 100,
    }),
    data: templateDataSchema,
    format: imageFormatSchema,
    width: s.integer("Output width in pixels.", { minimum: 100, maximum: 4000 }),
    quality: s.integer("JPEG or WebP compression quality from 1 to 100.", {
      minimum: 1,
      maximum: 100,
    }),
    expiration: expirationSchema,
    filename: filenameSchema,
    version: versionSchema,
  },
  {
    optional: ["modifications", "data", "format", "width", "quality", "expiration", "filename", "version"],
  },
);

const pdfToolOptionsSchema = {
  expiration: expirationSchema,
  filename: filenameSchema,
};

const rotatePdfInputSchema: JsonSchema = {
  ...s.object(
    "Input for rotating pages in a PDF.",
    {
      pdfUrl: pdfUrlSchema,
      rotation: rotationSchema,
      pageRotations: pageRotationsSchema,
      ...pdfToolOptionsSchema,
    },
    { optional: ["rotation", "pageRotations", "expiration", "filename"] },
  ),
  oneOf: [
    { required: ["rotation"], not: { required: ["pageRotations"] } },
    { required: ["pageRotations"], not: { required: ["rotation"] } },
  ],
};

export const templatefoxActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_pdf",
    description: "Generate a PDF from a TemplateFox template and return a signed download URL.",
    inputSchema: createPdfInputSchema,
    outputSchema: pdfResultSchema,
  }),
  defineProviderAction(service, {
    name: "create_image",
    description: "Generate an image from a TemplateFox image template and return a signed download URL.",
    inputSchema: createImageInputSchema,
    outputSchema: imageResultSchema,
  }),
  defineProviderAction(service, {
    name: "merge_pdfs",
    description: "Merge multiple PDF URLs with TemplateFox and return a signed download URL for the result.",
    inputSchema: s.object(
      "Input for merging PDF URLs.",
      {
        pdfUrls: s.array("Ordered PDF URLs to merge.", pdfUrlSchema, { minItems: 2 }),
        ...pdfToolOptionsSchema,
      },
      { optional: ["expiration", "filename"] },
    ),
    outputSchema: pdfResultSchema,
  }),
  defineProviderAction(service, {
    name: "extract_pdf_pages",
    description: "Extract selected pages from a PDF URL with TemplateFox and return a signed download URL.",
    inputSchema: s.object(
      "Input for extracting pages from a PDF.",
      {
        pdfUrl: pdfUrlSchema,
        pages: s.nonEmptyString("1-indexed page selection such as `1-3, 5, 7-9`."),
        ...pdfToolOptionsSchema,
      },
      { optional: ["expiration", "filename"] },
    ),
    outputSchema: pdfResultSchema,
  }),
  defineProviderAction(service, {
    name: "rotate_pdf",
    description: "Rotate all pages or selected pages in a PDF URL with TemplateFox and return a signed download URL.",
    inputSchema: rotatePdfInputSchema,
    outputSchema: pdfResultSchema,
  }),
  defineProviderAction(service, {
    name: "list_templates",
    description: "List TemplateFox templates visible to the API key.",
    inputSchema: s.object(
      "Input for listing TemplateFox templates.",
      {
        kind: s.stringEnum("Filter templates by product kind.", ["pdf", "image"]),
      },
      { optional: ["kind"] },
    ),
    outputSchema: s.requiredObject("Template list returned by TemplateFox.", {
      templates: s.array("Templates visible to the API key.", templateSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_template_fields",
    description: "Get dynamic field definitions for a TemplateFox template.",
    inputSchema: s.requiredObject("Input for reading TemplateFox template fields.", {
      templateId: templateIdSchema,
    }),
    outputSchema: s.requiredObject("Template field definitions returned by TemplateFox.", {
      fields: s.array("Template fields.", templateFieldSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_account",
    description: "Get TemplateFox account information including remaining credits.",
    inputSchema: s.object("No input is required.", {}),
    outputSchema: s.requiredObject("TemplateFox account output.", {
      account: accountSchema,
    }),
  }),
];
