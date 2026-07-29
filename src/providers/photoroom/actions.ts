import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "photoroom";

const keepBackgroundSchema: JsonSchema = {
  ...s.object(
    "Keep the source background, optionally blurring it.",
    {
      type: s.literal("keep", { description: "The background strategy." }),
      blurMode: s.stringEnum("The blur style applied to the retained background.", ["gaussian", "bokeh"]),
      blurRadius: s.number("The background blur radius above 0 and up to 0.05.", {
        exclusiveMinimum: 0,
        maximum: 0.05,
      }),
    },
    { optional: ["blurMode", "blurRadius"] },
  ),
  allOf: [
    {
      if: { required: ["blurRadius"] },
      then: { required: ["blurMode"] },
    },
  ],
};

const colorBackgroundSchema = s.requiredObject("Replace the source background with a solid color.", {
  type: s.literal("color", { description: "The background strategy." }),
  color: s.nonEmptyString(
    "A hexadecimal color without a leading hash, such as FFFFFF or FF0000EE, or a supported color name.",
  ),
});

const imageBackgroundSchema = s.object(
  "Replace the source background with an image that Photoroom can fetch.",
  {
    type: s.literal("image", { description: "The background strategy." }),
    imageUrl: s.string({
      format: "uri",
      minLength: 1,
      description: "The publicly reachable URL of the replacement background image.",
    }),
    scaling: s.stringEnum("How the replacement background should fit the output canvas.", ["fit", "fill"]),
  },
  { optional: ["scaling"] },
);

const aiBackgroundSchema = s.object(
  "Generate a product-scene background from a controlled prompt.",
  {
    type: s.literal("ai", { description: "The background strategy." }),
    prompt: s.nonEmptyString("A description of the product scene to generate around the existing subject."),
    seed: s.positiveInteger("A fixed generation seed for producing similar backgrounds from the same prompt."),
    expandPromptMode: s.stringEnum("Whether Photoroom should automatically expand a short background prompt.", [
      "ai.auto",
      "ai.never",
    ]),
  },
  { optional: ["seed", "expandPromptMode"] },
);

const backgroundSchema = s.oneOf(
  [keepBackgroundSchema, colorBackgroundSchema, imageBackgroundSchema, aiBackgroundSchema],
  { description: "The background treatment applied to the product image." },
);

const outlineSchema = s.object(
  "A colored outline drawn around the detected product subject.",
  {
    color: s.nonEmptyString("A hexadecimal color without a leading hash or a supported color name."),
    width: s.number("The outline width as a ratio of the result image size.", {
      minimum: 0,
      maximum: 0.1,
    }),
    blurRadius: s.number("The outline blur radius as a ratio of the result image size.", {
      minimum: 0,
      maximum: 0.025,
    }),
  },
  { optional: ["width", "blurRadius"] },
);

const canvasSchema: JsonSchema = {
  ...s.object(
    "Output canvas sizing and subject positioning controls.",
    {
      width: s.positiveInteger("The output canvas width in pixels. Provide height with this field."),
      height: s.positiveInteger("The output canvas height in pixels. Provide width with this field."),
      padding: {
        ...s.number("The fractional padding on every side of the subject, from 0 up to but excluding 0.5.", {
          minimum: 0,
        }),
        exclusiveMaximum: 0.5,
      },
      scaling: s.stringEnum("Whether the subject should fit or fill the available canvas.", ["fit", "fill"]),
      horizontalAlignment: s.stringEnum("The horizontal subject alignment.", ["left", "center", "right"]),
      verticalAlignment: s.stringEnum("The vertical subject alignment.", ["top", "center", "bottom"]),
    },
    {
      optional: ["width", "height", "padding", "scaling", "horizontalAlignment", "verticalAlignment"],
    },
  ),
  allOf: [
    {
      if: { required: ["width"] },
      then: { required: ["height"] },
    },
    {
      if: { required: ["height"] },
      then: { required: ["width"] },
    },
  ],
};

const editProductImageInputSchema: JsonSchema = {
  ...s.object(
    "A URL-based Photoroom product image edit with controlled composable options.",
    {
      imageUrl: s.string({
        format: "uri",
        minLength: 1,
        description: "The publicly reachable source product image URL that Photoroom should edit.",
      }),
      background: backgroundSchema,
      shadowStyle: s.stringEnum(
        "The current Photoroom AI shadow style generated around the detected product subject.",
        ["auto", "soft", "hard"],
      ),
      lightingMode: s.stringEnum(
        "The relighting mode. Preserve hue and saturation when product color accuracy matters.",
        ["ai.auto", "ai.preserve-hue-and-saturation"],
      ),
      textRemovalMode: s.stringEnum(
        "The class of text to remove. This can change product details and requires human review.",
        ["ai.artificial", "ai.natural", "ai.all"],
      ),
      beautifyMode: s.stringEnum(
        "The product-specific AI beautification mode. This can alter the subject and requires human review.",
        ["ai.auto", "ai.food", "ai.car"],
      ),
      beautifySeed: s.positiveInteger(
        "A fixed seed for producing similar beautification results. Requires beautifyMode.",
      ),
      outline: outlineSchema,
      canvas: canvasSchema,
      outputFormat: s.stringEnum("The encoded format of the edited result image.", ["png", "jpeg", "webp"]),
      outputDpi: s.integer("The output pixel density in dots per inch.", {
        minimum: 72,
        maximum: 1200,
      }),
    },
    {
      optional: [
        "shadowStyle",
        "lightingMode",
        "textRemovalMode",
        "beautifyMode",
        "beautifySeed",
        "outline",
        "canvas",
        "outputFormat",
        "outputDpi",
      ],
    },
  ),
  allOf: [
    {
      if: {
        properties: {
          background: {
            properties: { type: { const: "ai" } },
            required: ["type"],
          },
        },
        required: ["background"],
      },
      then: { not: { required: ["shadowStyle"] } },
    },
    {
      if: {
        properties: {
          background: {
            properties: { type: { const: "keep" } },
            required: ["type"],
          },
        },
        required: ["background"],
      },
      then: { not: { required: ["beautifyMode"] } },
    },
    {
      if: { required: ["beautifySeed"] },
      then: { required: ["beautifyMode"] },
    },
  ],
};

export const photoroomActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "edit_product_image",
    description:
      "Apply a controlled combination of Photoroom product-image edits to an imageUrl, upload the binary result to local transit storage, and return resultUrl. This action is for composed ecommerce edits rather than simple background removal; outputs that use relighting, text removal, or beautification should be reviewed by a human before publishing.",
    inputSchema: editProductImageInputSchema,
    outputSchema: s.requiredObject("The edited product image stored in local transit storage.", {
      resultUrl: s.url("The local transit URL used to download the edited image."),
      fileName: s.nonEmptyString("The generated filename stored in transit."),
      contentType: s.stringEnum("The MIME type detected from the edited image bytes.", [
        "image/png",
        "image/jpeg",
        "image/webp",
      ]),
      contentLength: s.nonNegativeInteger("The edited image size in bytes."),
      humanReviewRecommended: s.boolean(
        "Whether selected AI edits can alter product appearance or text and should be reviewed before publishing.",
      ),
    }),
  }),
];
