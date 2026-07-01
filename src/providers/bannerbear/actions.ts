import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "bannerbear";

const projectIdSchema = s.nonEmptyString("The Bannerbear project UID. Required when using a Full Access Master API Key.");
const uidSchema = s.nonEmptyString("The Bannerbear resource UID.");
const nullableUrlSchema = s.nullable(s.url("The generated media URL."));
const modificationSchema = s.looseRequiredObject("One Bannerbear template modification.", {
  name: s.nonEmptyString("The name of the template layer to modify."),
  text: s.string("Replacement text for a text layer."),
  color: s.string("Color in hex format, such as #FF0000."),
  background: s.string("Background color in hex format, such as #FF0000."),
  background_border_color: s.string("Background border color in hex format, such as #FF0000."),
  font_family: s.string("The font family to use for a text layer."),
  text_align_h: s.stringEnum("Horizontal text alignment.", ["left", "center", "right"]),
  text_align_v: s.stringEnum("Vertical text alignment.", ["top", "center", "bottom"]),
  font_family_2: s.string("The secondary font family to use for a text layer."),
  color_2: s.string("The secondary font color in hex format."),
  image_url: s.url("Public image URL to use for an image layer."),
  effect: s.string("The Bannerbear image effect to apply."),
  anchor_x: s.stringEnum("Horizontal image anchor point.", ["left", "center", "right"]),
  anchor_y: s.stringEnum("Vertical image anchor point.", ["top", "center", "bottom"]),
  fill_type: s.stringEnum("Image fill mode.", ["fill", "fit"]),
  disable_face_detect: s.boolean("Whether to disable face detection for this image layer."),
  disable_smart_crop: s.boolean("Whether to disable smart crop for this image layer."),
  chart_data: s.string("Comma-delimited chart data values for chart layers."),
  rating: s.integer("Star rating value from 0 to 100.", { minimum: 0, maximum: 100 }),
  target: s.string("QR code target URL or text."),
  bar_code_data: s.string("Text to encode as a bar code."),
  gradient: s.stringArray("Gradient colors, such as #000 and #FFF.", { minItems: 1 }),
  shadow: s.string("Layer shadow setting, such as 5px 5px 0 #000."),
}, {
  optional: [
    "text",
    "color",
    "background",
    "background_border_color",
    "font_family",
    "text_align_h",
    "text_align_v",
    "font_family_2",
    "color_2",
    "image_url",
    "effect",
    "anchor_x",
    "anchor_y",
    "fill_type",
    "disable_face_detect",
    "disable_smart_crop",
    "chart_data",
    "rating",
    "target",
    "bar_code_data",
    "gradient",
    "shadow",
  ],
});
const rawModificationSchema = s.looseObject("One modification returned by Bannerbear.", {
  name: s.string("The layer name."),
});
const templateSchema = s.looseObject("One Bannerbear template.", {
  uid: s.string("The unique template UID."),
  name: s.string("The template name."),
  self: s.url("The API URL for this template."),
  width: s.integer("The template width in pixels."),
  height: s.integer("The template height in pixels."),
  tags: s.stringArray("Tags assigned to this template."),
  metadata: s.nullable(s.string("Custom metadata stored with the template.")),
  preview_url: s.nullable(s.url("The template preview image URL.")),
  created_at: s.string("The template creation timestamp."),
  updated_at: s.string("The template update timestamp."),
  available_modifications: s.array("Available layer modifications for this template.", rawModificationSchema),
  current_defaults: s.array(
    "Current layer defaults returned when extended=true.",
    s.looseObject("One current layer default returned by Bannerbear."),
  ),
});
const imageSchema = s.looseObject("One Bannerbear image.", {
  uid: s.string("The unique image UID."),
  status: s.string("The current image status, such as pending, completed, or failed."),
  self: s.url("The API URL for this image."),
  image_url: nullableUrlSchema,
  pdf_url: nullableUrlSchema,
  template: s.string("The template UID used to create the image."),
  width: s.integer("The rendered image width in pixels."),
  height: s.integer("The rendered image height in pixels."),
  metadata: s.nullable(s.string("Custom metadata stored with the image.")),
  created_at: s.string("The image creation timestamp."),
  render_pdf: s.boolean("Whether PDF rendering was requested."),
  transparent: s.boolean("Whether transparent background rendering was requested."),
  webhook_url: s.nullable(s.url("The webhook URL notified on completion.")),
  webhook_response_code: s.nullable(s.integer("The HTTP status code returned by the webhook endpoint.")),
  modifications: s.array("The modifications applied to the template.", rawModificationSchema),
});

export const bannerbearActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_auth",
    description: "Verify a Bannerbear API key and return the project it is scoped to.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for verifying Bannerbear authentication.",
      {
        project_id: projectIdSchema,
      },
      { optional: ["project_id"] },
    ),
    outputSchema: s.object("The Bannerbear authentication status.", {
      message: s.string("The authentication status message."),
      project: s.string("The Bannerbear project name."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_templates",
    description: "List Bannerbear templates in the connected project.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for listing Bannerbear templates.",
      {
        page: s.integer("The page of results to retrieve. Bannerbear returns 25 items per page.", { minimum: 1 }),
        limit: s.integer("The number of templates to return, up to 100.", { minimum: 1, maximum: 100 }),
        tag: s.nonEmptyString("Filter templates by tag."),
        name: s.nonEmptyString("Filter templates by partial name match."),
        extended: s.boolean("Whether to include current layer defaults."),
        project_id: projectIdSchema,
      },
      { optional: ["page", "limit", "tag", "name", "extended", "project_id"] },
    ),
    outputSchema: s.object("The Bannerbear templates list.", {
      templates: s.array("Templates returned by Bannerbear.", templateSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_template",
    description: "Retrieve one Bannerbear template by UID.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for retrieving a Bannerbear template.",
      {
        uid: uidSchema,
        extended: s.boolean("Whether to include current layer defaults."),
        project_id: projectIdSchema,
      },
      { optional: ["extended", "project_id"] },
    ),
    outputSchema: s.object("The Bannerbear template result.", {
      template: templateSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_image_sync",
    description: "Create a Bannerbear image synchronously from a template and return the generated media URLs.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for synchronously creating a Bannerbear image.",
      {
        template: s.nonEmptyString("The template UID to use."),
        modifications: s.array("Template layer modifications to apply.", modificationSchema, { minItems: 1 }),
        transparent: s.boolean("Whether to render a transparent PNG."),
        render_pdf: s.boolean("Whether to also render a PDF."),
        metadata: s.string("Custom metadata to store with the generated image."),
        project_id: projectIdSchema,
      },
      { optional: ["transparent", "render_pdf", "metadata", "project_id"] },
    ),
    outputSchema: s.object("The synchronously generated Bannerbear image.", {
      image: imageSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_image",
    description: "Retrieve one Bannerbear image by UID.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for retrieving a Bannerbear image.",
      {
        uid: uidSchema,
        project_id: projectIdSchema,
      },
      { optional: ["project_id"] },
    ),
    outputSchema: s.object("The Bannerbear image result.", {
      image: imageSchema,
    }),
  }),
];

export type BannerbearActionName = (typeof bannerbearActions)[number]["name"];
