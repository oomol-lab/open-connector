import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "abyssale";

const rawResponseSchema = s.looseObject({}, { description: "The raw response object returned by Abyssale." });
const uuidField = (description: string) => s.string({ description, format: "uuid" });
const nonEmptyString = (description: string) => s.string({ description, minLength: 1 });

const designTypeSchema = s.stringEnum(["static", "animated", "printer", "printer_multipage"], {
  description: "The Abyssale design type.",
});

const designSummarySchema = s.object(
  {
    id: s.nullable(s.string({ description: "The unique identifier of the design." })),
    name: s.nullable(s.string({ description: "The display name of the design." })),
    type: s.nullable(designTypeSchema),
    previewUrl: s.nullable(s.url("The preview image URL of the first design format.")),
    createdAt: s.nullable(s.integer({ description: "The design creation timestamp in seconds since epoch." })),
    updatedAt: s.nullable(s.integer({ description: "The design update timestamp in seconds since epoch." })),
    raw: rawResponseSchema,
  },
  {
    required: ["id", "name", "type", "previewUrl", "createdAt", "updatedAt", "raw"],
    description: "A normalized Abyssale design summary.",
  },
);

const projectSchema = s.object(
  {
    id: s.nullable(s.string({ description: "The unique identifier of the project." })),
    name: s.nullable(s.string({ description: "The display name of the project." })),
    createdAt: s.nullable(s.integer({ description: "The project creation timestamp in seconds since epoch." })),
    raw: rawResponseSchema,
  },
  {
    required: ["id", "name", "createdAt", "raw"],
    description: "A normalized Abyssale project.",
  },
);

const fontSchema = s.object(
  {
    id: s.nullable(s.string({ description: "The unique identifier of the font when returned by Abyssale." })),
    name: s.nullable(s.string({ description: "The display name of the font." })),
    family: s.nullable(s.string({ description: "The font family name when returned by Abyssale." })),
    raw: rawResponseSchema,
  },
  {
    required: ["id", "name", "family", "raw"],
    description: "A normalized Abyssale font record.",
  },
);

const bannerSchema = s.object(
  {
    id: s.nullable(s.string({ description: "The unique identifier of the generated file." })),
    url: s.nullable(s.url("The public URL of the generated file.")),
    fileType: s.nullable(s.string({ description: "The generated file type when returned by Abyssale." })),
    createdAt: s.nullable(s.integer({ description: "The file creation timestamp in seconds since epoch." })),
    raw: rawResponseSchema,
  },
  {
    required: ["id", "url", "fileType", "createdAt", "raw"],
    description: "A normalized Abyssale generated file.",
  },
);

const formatSchema = s.object(
  {
    id: s.nullable(s.string({ description: "The format identifier." })),
    uid: s.nullable(s.string({ description: "The unique identifier of the format instance." })),
    width: s.nullable(s.integer({ description: "The width of the format." })),
    height: s.nullable(s.integer({ description: "The height of the format." })),
    unit: s.nullable(s.string({ description: "The unit used by width and height." })),
    previewUrl: s.nullable(s.url("The preview image URL for this format.")),
    dynamicImageUrl: s.nullable(s.url("The dynamic image URL for this format.")),
    raw: rawResponseSchema,
  },
  {
    required: ["id", "uid", "width", "height", "unit", "previewUrl", "dynamicImageUrl", "raw"],
    description: "A normalized Abyssale design format.",
  },
);

const elementsSchema = s.looseObject(
  {},
  { description: "Abyssale element overrides keyed by layer name and forwarded to the generation endpoint." },
);

export const abyssaleActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_designs",
    operationType: "read",
    description: "List Abyssale designs available to the API key.",
    inputSchema: s.object({}, { description: "No input is required to list Abyssale designs." }),
    outputSchema: s.object(
      {
        designs: s.array(designSummarySchema, { description: "Designs returned by Abyssale." }),
        raw: s.array(rawResponseSchema, { description: "The raw Abyssale design records." }),
      },
      { required: ["designs", "raw"], description: "A page of Abyssale designs." },
    ),
  }),
  defineProviderAction(service, {
    name: "get_design",
    operationType: "read",
    description: "Retrieve Abyssale design details including formats, elements, and variables.",
    inputSchema: s.object(
      {
        designId: uuidField("The unique identifier of the design."),
      },
      { required: ["designId"], description: "Input for retrieving an Abyssale design." },
    ),
    outputSchema: s.object(
      {
        design: designSummarySchema,
        formats: s.array(rawResponseSchema, { description: "Formats available in the design." }),
        elements: s.array(rawResponseSchema, { description: "Customizable elements in the design." }),
        variables: s.looseObject({}, { description: "Variables used within text layers of the design." }),
        raw: rawResponseSchema,
      },
      {
        required: ["design", "formats", "elements", "variables", "raw"],
        description: "The normalized Abyssale design details.",
      },
    ),
  }),
  defineProviderAction(service, {
    name: "get_design_format",
    operationType: "read",
    description: "Retrieve detailed information for one Abyssale design format.",
    inputSchema: s.object(
      {
        designId: uuidField("The unique identifier of the design."),
        formatSpecifier: nonEmptyString("The format name or UID."),
      },
      { required: ["designId", "formatSpecifier"], description: "Input for retrieving an Abyssale design format." },
    ),
    outputSchema: s.object(
      {
        format: formatSchema,
        elements: s.array(rawResponseSchema, { description: "Customizable elements in the design format." }),
        variables: s.looseObject({}, { description: "Variables used within text layers of the format." }),
        raw: rawResponseSchema,
      },
      {
        required: ["format", "elements", "variables", "raw"],
        description: "The normalized Abyssale design format details.",
      },
    ),
  }),
  defineProviderAction(service, {
    name: "list_fonts",
    operationType: "read",
    description: "List custom and Google fonts available in Abyssale.",
    inputSchema: s.object({}, { description: "No input is required to list Abyssale fonts." }),
    outputSchema: s.object(
      {
        fonts: s.array(fontSchema, { description: "Fonts returned by Abyssale." }),
        raw: s.array(rawResponseSchema, { description: "The raw Abyssale font records." }),
      },
      { required: ["fonts", "raw"], description: "A list of Abyssale fonts." },
    ),
  }),
  defineProviderAction(service, {
    name: "list_projects",
    operationType: "read",
    description: "List Abyssale projects available to the API key.",
    inputSchema: s.object({}, { description: "No input is required to list Abyssale projects." }),
    outputSchema: s.object(
      {
        projects: s.array(projectSchema, { description: "Projects returned by Abyssale." }),
        raw: s.array(rawResponseSchema, { description: "The raw Abyssale project records." }),
      },
      { required: ["projects", "raw"], description: "A list of Abyssale projects." },
    ),
  }),
  defineProviderAction(service, {
    name: "create_project",
    operationType: "write",
    description: "Create an Abyssale project to organize templates and generated images.",
    inputSchema: s.object(
      {
        name: s.string({ description: "The project name.", minLength: 2, maxLength: 100 }),
      },
      { required: ["name"], description: "Input for creating an Abyssale project." },
    ),
    outputSchema: s.object(
      {
        project: projectSchema,
        raw: rawResponseSchema,
      },
      { required: ["project", "raw"], description: "The created Abyssale project." },
    ),
  }),
  defineProviderAction(service, {
    name: "generate_banner",
    operationType: "write",
    description:
      "Generate one Abyssale image from a design using JSON element overrides and return the generated file metadata.",
    inputSchema: s.object(
      {
        designId: uuidField("The unique identifier of the design."),
        elements: elementsSchema,
        templateFormatName: nonEmptyString("The format ID to generate when the design contains multiple formats."),
        fileCompressionLevel: s.integer({
          description: "The percentage of compression to apply.",
          minimum: 1,
          maximum: 100,
        }),
      },
      { required: ["designId", "elements"], description: "Input for generating an Abyssale banner from a design." },
    ),
    outputSchema: s.object(
      {
        banner: bannerSchema,
        raw: rawResponseSchema,
      },
      { required: ["banner", "raw"], description: "The normalized Abyssale generated file result." },
    ),
  }),
  defineProviderAction(service, {
    name: "get_banner",
    operationType: "read",
    description: "Retrieve metadata for an Abyssale generated file.",
    inputSchema: s.object(
      {
        bannerId: uuidField("The unique identifier of the generated file."),
      },
      { required: ["bannerId"], description: "Input for retrieving an Abyssale generated file." },
    ),
    outputSchema: s.object(
      {
        banner: bannerSchema,
        raw: rawResponseSchema,
      },
      { required: ["banner", "raw"], description: "The normalized Abyssale generated file." },
    ),
  }),
  defineProviderAction(service, {
    name: "create_dynamic_image_url",
    operationType: "write",
    description: "Create or retrieve the dynamic image URL for an Abyssale design.",
    inputSchema: s.object(
      {
        designId: uuidField("The unique identifier of the design."),
        enableRateLimit: s.boolean({ description: "Whether API rate limiting should be enabled for the image." }),
        enableProductionMode: s.boolean({ description: "Whether production mode should be enabled for the image." }),
      },
      { required: ["designId"], description: "Input for creating an Abyssale dynamic image URL." },
    ),
    outputSchema: s.object(
      {
        id: s.nullable(s.string({ description: "The dynamic image identifier when returned by Abyssale." })),
        url: s.nullable(s.url("The dynamic image URL.")),
        raw: rawResponseSchema,
      },
      { required: ["id", "url", "raw"], description: "The normalized Abyssale dynamic image URL result." },
    ),
  }),
];
