import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "dynapictures";

const templateIdSchema = s.nonEmptyString("The DynaPictures template UID.");

const referenceImageSchema = s.requiredObject("One named AI layer reference image.", {
  name: s.nonEmptyString("The name referenced in the AI prompt inside square brackets."),
  url: s.url("The publicly reachable reference image URL."),
});

const layerOverrideSchema = s.looseRequiredObject(
  "One DynaPictures layer override. Additional provider-defined layer properties are forwarded unchanged.",
  {
    name: s.nonEmptyString("The template layer name to customize."),
    text: s.string("The replacement text for a text layer."),
    color: s.string("The text or label color."),
    backgroundColor: s.string("The layer background color."),
    borderColor: s.string("The layer border color."),
    borderWidth: s.string("The layer border width, such as 1px."),
    borderRadius: s.string("The layer border radius, such as 5px or 50%."),
    imageUrl: s.url("The publicly reachable image URL for an image layer."),
    imagePosition: s.stringEnum("The image fitting or positioning mode.", ["cro", "ai_face", "cov", "align"]),
    imageAlignH: s.stringEnum("The horizontal alignment used with align mode.", ["left", "center", "right", "full"]),
    imageAlignV: s.stringEnum("The vertical alignment used with align mode.", ["top", "center", "bottom", "full"]),
    imageEffect: s.string("A CSS filter value applied to an image layer."),
    opacity: s.number("The layer opacity from 0 for transparent to 1 for opaque.", {
      minimum: 0,
      maximum: 1,
    }),
    prompt: s.nonEmptyString("The prompt for a per-request AI image layer."),
    sourceImage: s.url("The publicly reachable source photo for an AI image layer."),
    referenceImages: s.array("Named reference images used by an AI image layer.", referenceImageSchema, {
      maxItems: 6,
    }),
    chartColor: s.string("The chart series color."),
    chartLabelColor: s.string("The chart axis label color."),
    chartDataLabels: s.array("The chart labels shown on the horizontal axis.", s.string("One chart label.")),
    chartDataValues: s.array("The numeric data series rendered by a chart layer.", s.number("One chart value.")),
    value: s.number("The progress value for a gauge or progress bar.", { minimum: 0 }),
    maxValue: s.number("The maximum value for a radial tick gauge.", {
      exclusiveMinimum: 0,
    }),
    activeColor: s.string("The filled tick color for a radial tick gauge."),
    inactiveColor: s.string("The empty tick color for a radial tick gauge."),
    circleColor: s.string("The background ring color for a simple gauge."),
    progressColor: s.string("The filled progress color for a gauge or progress bar."),
    textColor: s.string("The value label color for a simple gauge."),
    remainingColor: s.string("The unfilled track color for a line progress bar."),
    label: s.string("The line progress bar label text."),
    labelAlign: s.stringEnum("The horizontal alignment of a progress bar label.", ["left", "center", "right"]),
  },
  {
    optional: [
      "text",
      "color",
      "backgroundColor",
      "borderColor",
      "borderWidth",
      "borderRadius",
      "imageUrl",
      "imagePosition",
      "imageAlignH",
      "imageAlignV",
      "imageEffect",
      "opacity",
      "prompt",
      "sourceImage",
      "referenceImages",
      "chartColor",
      "chartLabelColor",
      "chartDataLabels",
      "chartDataValues",
      "value",
      "maxValue",
      "activeColor",
      "inactiveColor",
      "circleColor",
      "progressColor",
      "textColor",
      "remainingColor",
      "label",
      "labelAlign",
    ],
  },
);

const pageOverrideSchema = s.requiredObject("One page override for a multipage template.", {
  index: s.nonNegativeInteger("The zero-based template page index to customize."),
  layers: s.array("The layer overrides for this page.", layerOverrideSchema, { minItems: 1 }),
});

const templateLayerSchema = s.looseObject("One template layer returned by DynaPictures.", {
  type: s.string("The layer type."),
  name: s.string("The layer name used in generation overrides."),
  width: s.anyOf("The layer width as returned by DynaPictures.", [
    s.number("The numeric layer width."),
    s.string("The string layer width."),
  ]),
  height: s.anyOf("The layer height as returned by DynaPictures.", [
    s.number("The numeric layer height."),
    s.string("The string layer height."),
  ]),
  text: s.nullable(s.string("The current text value for a text layer.")),
});

const rawObjectSchema = s.looseObject("The raw object returned by DynaPictures.");

const templateSchema = s.requiredObject("A normalized DynaPictures template.", {
  id: s.string("The unique template UID."),
  name: s.string("The template name."),
  thumbnail: s.url("The template thumbnail URL."),
  dateCreated: s.dateTime("The template creation timestamp."),
  dateUpdated: s.dateTime("The template update timestamp."),
  layers: s.array("The layers available in the template.", templateLayerSchema),
  raw: rawObjectSchema,
});

const generatedImageSchema = s.requiredObject("One generated DynaPictures image.", {
  id: s.string("The unique generated image identifier."),
  imageUrl: s.url("The hosted generated image URL."),
  thumbnailUrl: s.url("The hosted generated image thumbnail URL."),
  retinaThumbnailUrl: s.nullable(
    s.url("The hosted high-density thumbnail URL when returned for a single-page template."),
  ),
  metadata: s.nullable(s.string("The custom metadata stored with the generated image.")),
  width: s.integer("The generated image width in pixels."),
  height: s.integer("The generated image height in pixels."),
  pageIndex: s.nullable(s.nonNegativeInteger("The source page index for a multipage template result.")),
  raw: rawObjectSchema,
});

const generateImagesInputSchema = s.object(
  "Input for generating images from a DynaPictures template.",
  {
    templateId: templateIdSchema,
    format: s.stringEnum("The generated image format.", ["png", "jpeg", "webp", "avif"]),
    metadata: s.string("Custom metadata to store with each generated image."),
    params: s.array("Layer overrides for a single-page template.", layerOverrideSchema, {
      minItems: 1,
    }),
    pages: s.array("Page and layer overrides for a multipage template.", pageOverrideSchema, {
      minItems: 1,
    }),
  },
  { optional: ["format", "metadata", "params", "pages"] },
);

export const dynapicturesActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_templates",
    operationType: "read",
    description: "List DynaPictures templates that are ready for API generation and have Sync to Zapier enabled.",
    inputSchema: s.requiredObject("No input is required to list DynaPictures templates.", {}),
    outputSchema: s.requiredObject("The available DynaPictures templates.", {
      templates: s.array("Templates returned by DynaPictures.", templateSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_template",
    operationType: "read",
    description: "Retrieve one DynaPictures template and its customizable layers by UID.",
    inputSchema: s.requiredObject("Input for retrieving a DynaPictures template.", {
      templateId: templateIdSchema,
    }),
    outputSchema: s.requiredObject("The requested DynaPictures template.", {
      template: templateSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "generate_images",
    operationType: "write",
    description:
      "Generate one image from a single-page template or multiple images from a multipage template and return hosted URLs.",
    inputSchema: generateImagesInputSchema,
    outputSchema: s.requiredObject("The normalized DynaPictures generation result.", {
      templateId: templateIdSchema,
      templateName: s.nullable(s.string("The template name when returned for a multipage generation.")),
      images: s.array("The generated images.", generatedImageSchema, { minItems: 1 }),
      raw: rawObjectSchema,
    }),
  }),
];
