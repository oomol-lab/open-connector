import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "templated";

const nonEmptyString = (description: string) => s.nonEmptyString(description);
const nullableString = (description: string) => s.nullable(s.string(description));
const userSchema = s.looseObject("User summary returned by Templated.", {
  id: s.string("Unique identifier of the Templated user."),
  name: s.string("Display name of the Templated user."),
});
const accountSchema = s.looseObject("Templated account returned by the API.", {
  id: s.string("Unique identifier of the Templated account."),
  name: s.string("Display name of the Templated account."),
  email: s.string("Email address associated with the Templated account."),
  plan: nullableString("Current Templated plan name when available."),
  watermark: s.boolean("Whether generated renders include the Templated watermark."),
  createdAt: nullableString("Timestamp when the account was created."),
});
const templateSchema = s.looseObject("Templated template.", {
  id: s.string("Unique identifier of the template."),
  name: s.string("Template name."),
  description: nullableString("Template description."),
  width: s.nullableInteger("Template width in pixels."),
  height: s.nullableInteger("Template height in pixels."),
  thumbnail: nullableString("Template thumbnail URL."),
  background: nullableString("Template background color."),
  layersCount: s.nullableInteger("Number of editable layers in the template."),
  folderId: nullableString("Folder identifier that contains the template."),
  externalId: nullableString("External identifier associated with the template."),
  user: s.nullable(userSchema),
  layers: s.array("Template layers returned when includeLayers is enabled.", s.unknown("A template layer.")),
  pages: s.array("Template pages returned when includePages is enabled.", s.unknown("A template page.")),
  tags: s.stringArray("Template tags returned by Templated when available."),
});
const renderSchema = s.looseObject("Templated render.", {
  id: s.string("Unique identifier of the render."),
  url: nullableString("URL of the rendered asset."),
  width: s.nullableInteger("Rendered width in pixels."),
  height: s.nullableInteger("Rendered height in pixels."),
  name: nullableString("Render name."),
  status: s.stringEnum("Current render status reported by Templated.", ["PENDING", "COMPLETED", "FAILED"]),
  format: nullableString("Output format of the render."),
  templateId: nullableString("Template identifier used to generate the render."),
  templateName: nullableString("Template name used to generate the render."),
  createdAt: nullableString("Timestamp when the render was created."),
  externalId: nullableString("External identifier associated with the render."),
});
const layerOverrideSchema = s.looseObject("Layer override object forwarded to Templated.", {
  text: s.string("Replacement text for the layer."),
  image_url: s.url("Replacement image URL for an image layer."),
  color: s.string("Primary color override such as #FF0000."),
  color_2: s.string("Secondary text color override."),
  background: s.string("Background color override."),
  font_family: s.string("Primary font family override."),
  font_family_2: s.string("Secondary font family override."),
  font_size: s.string("Font size override such as 24px or 12pt."),
  font_weight: s.string("Font weight override."),
  letter_spacing: s.string("Letter spacing override."),
  line_height: s.string("Line height override."),
  text_stroke_width: s.number("Text stroke width in pixels."),
  text_stroke_color: s.string("Text stroke color override."),
  text_highlight_color: s.string("Text highlight color override."),
  padding_x: s.positiveInteger("Horizontal padding in pixels."),
  padding_y: s.positiveInteger("Vertical padding in pixels."),
  horizontal_align: s.string("Horizontal text alignment override."),
  vertical_align: s.string("Vertical text alignment override."),
  autofit: s.string("Auto-fit mode such as width or height."),
  border_width: s.nonNegativeInteger("Border width in pixels."),
  border_color: s.string("Border color override."),
  border_radius: s.string("Border radius override."),
  border_style: s.string("Border style override."),
  dash_length: s.number("Custom dash length for dashed borders."),
  dash_gap: s.number("Custom gap length for dashed borders."),
  fill: s.string("Fill color or gradient override."),
  stroke: s.string("Stroke color override."),
  preserve_ratio: s.boolean("Whether vector content keeps its aspect ratio."),
  hide: s.boolean("Whether the layer should be hidden."),
  opacity: s.number("Layer opacity between 0 and 1.", { minimum: 0, maximum: 1 }),
  link: s.url("Clickable URL applied to PDF renders."),
  x: s.integer("Layer X position in pixels."),
  y: s.integer("Layer Y position in pixels."),
  rotation: s.integer("Layer rotation in degrees."),
  width: s.positiveInteger("Layer width in pixels."),
  height: s.positiveInteger("Layer height in pixels."),
  flip_x: s.boolean("Whether the layer is flipped horizontally."),
  flip_y: s.boolean("Whether the layer is flipped vertically."),
  object_fit: s.string("Image object-fit override."),
  object_position: s.string("Image object-position override."),
  crop_x: s.number("Crop X percentage.", { minimum: 0, maximum: 100 }),
  crop_y: s.number("Crop Y percentage.", { minimum: 0, maximum: 100 }),
  crop_width: s.number("Crop width percentage.", { minimum: 0, maximum: 100 }),
  crop_height: s.number("Crop height percentage.", { minimum: 0, maximum: 100 }),
  filter: s.string("CSS filter override for image layers."),
  barcode_format: s.string("Barcode format override."),
  rating: s.number("Rating value for a star-rating layer."),
  html: s.string("Custom HTML content override."),
});

export const templatedActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account",
    description: "Get the current Templated account associated with the API key.",
    inputSchema: s.actionInput({}),
    outputSchema: s.actionOutput(
      {
        account: accountSchema,
      },
      "Current Templated account.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_templates",
    description: "List Templated templates with optional filters for name, dimensions, and tags.",
    inputSchema: s.actionInput({
      query: nonEmptyString("Optional template name filter."),
      page: s.nonNegativeInteger("Zero-based page number for pagination."),
      limit: s.positiveInteger("Maximum number of templates to return."),
      width: s.positiveInteger("Filter templates by width in pixels."),
      height: s.positiveInteger("Filter templates by height in pixels."),
      tags: s.stringArray("Filter templates by tags.", { minItems: 1 }),
      externalId: nonEmptyString("Filter templates by external identifier."),
      includeLayers: s.boolean("Whether to include template layers in the response."),
      includePages: s.boolean("Whether to include template pages in the response."),
    }),
    outputSchema: s.actionOutput(
      {
        templates: s.array("Templates returned by Templated.", templateSchema),
      },
      "Templated template list.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_template",
    description: "Retrieve a single Templated template by its template ID.",
    inputSchema: s.actionInput(
      {
        templateId: nonEmptyString("The template ID."),
        includeLayers: s.boolean("Whether to include template layers in the response."),
        includePages: s.boolean("Whether to include template pages in the response."),
      },
      ["templateId"],
    ),
    outputSchema: s.actionOutput(
      {
        template: templateSchema,
      },
      "Single Templated template.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_render",
    description:
      "Create a Templated render from one template with optional shared layer overrides and image or PDF output settings.",
    inputSchema: s.actionInput(
      {
        templateId: nonEmptyString("Template ID to render."),
        format: s.stringEnum("Output format for the render.", ["jpg", "png", "webp", "pdf"]),
        transparent: s.boolean("Whether the background should be transparent for PNG renders."),
        flatten: s.boolean("Whether PDF output should be flattened."),
        cmyk: s.boolean("Whether PDF output should use CMYK color mode."),
        name: nonEmptyString("Optional custom name for the render."),
        background: nonEmptyString("Optional background color override."),
        width: s.integer("Optional custom render width in pixels.", { minimum: 100, maximum: 5000 }),
        height: s.integer("Optional custom render height in pixels.", { minimum: 100, maximum: 5000 }),
        scale: s.number("Optional render scale factor.", { minimum: 0.1, maximum: 2 }),
        externalId: nonEmptyString("Optional external identifier for the render."),
        async: s.boolean("Whether the render should be created asynchronously."),
        webhookUrl: s.url("Optional webhook URL that receives the final Render object."),
        layers: s.record("Map of template layer names to layer override objects.", layerOverrideSchema),
      },
      ["templateId"],
    ),
    outputSchema: s.actionOutput(
      {
        renders: s.array("Render objects returned by Templated after normalization.", renderSchema),
      },
      "Normalized Templated render creation result.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_renders",
    description: "List all renders owned by the current Templated account.",
    inputSchema: s.actionInput({}),
    outputSchema: s.actionOutput(
      {
        renders: s.array("Renders returned by Templated.", renderSchema),
      },
      "Templated render list.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_render",
    description: "Retrieve a single Templated render by its render ID.",
    inputSchema: s.actionInput(
      {
        renderId: nonEmptyString("The render ID."),
      },
      ["renderId"],
    ),
    outputSchema: s.actionOutput(
      {
        render: renderSchema,
      },
      "Single Templated render.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_render",
    description: "Delete a Templated render by its render ID.",
    inputSchema: s.actionInput(
      {
        renderId: nonEmptyString("The render ID."),
      },
      ["renderId"],
    ),
    outputSchema: s.actionOutput(
      {
        deleted: s.boolean("Whether the render delete request succeeded."),
        renderId: s.string("Identifier of the deleted render."),
      },
      "Templated render delete acknowledgement.",
    ),
  }),
];
