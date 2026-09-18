import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "torii_image_translator";

const downloadableImageSchema = s.object("A PNG image uploaded to connector transit storage.", {
  name: s.nonEmptyString("The generated image filename."),
  mimeType: s.literal("image/png", { description: "The generated image MIME type." }),
  fileId: s.nonEmptyString("The local transit file identifier."),
  downloadUrl: s.url("The local URL for downloading the generated image."),
  sizeBytes: s.nonNegativeInteger("The generated image size in bytes."),
});

const sourceImageUrlSchema = (description: string) =>
  s.string(description, {
    format: "uri",
    maxLength: 2048,
  });

const targetLanguageSchema = s.nonEmptyString(
  "The target language code, such as en, ja, ko, zh-cn for Simplified Chinese, or zh-tw for Traditional Chinese.",
  { maxLength: 32 },
);

const translatorSchema = s.nonEmptyString(
  "The Torii translation model identifier. Defaults to gemini-3.1-flash-lite. Current examples include deepseek, gpt-5.6-luna, grok-4.20, kimi-k2.5, gpt-5.4, gemini-3-flash, claude-sonnet-4.6, and gemini-3.7-flash.",
  { maxLength: 100 },
);

const fontSchema = s.nonEmptyString(
  "The Torii font identifier. Defaults to noto, which supports Chinese and the full advertised language set. Other current examples include wildwords, badcomic, mashanzheng, komika, bangers, shonen, and heroika.",
  { maxLength: 100 },
);

const creditsSchema = s.number("The Torii credit balance remaining after the request, when returned by the API.", {
  minimum: 0,
});

const translatedTextRegionSchema = s.looseObject(
  "A translated text region and its rendering metadata returned by Torii.",
  {
    x: s.number("The horizontal center coordinate of the translated text region."),
    y: s.number("The vertical center coordinate of the translated text region."),
    width: s.number("The translated text region width in pixels."),
    height: s.number("The translated text region height in pixels."),
    text: s.string("The translated text rendered in the region."),
    originalText: s.string("The original text detected in the region."),
    textAlign: s.string("The translated text alignment."),
    fillColor: s.string("The translated text fill color."),
    strokeColor: s.string("The translated text stroke color."),
    lineWidth: s.number("The translated text outline width in pixels."),
    font: s.string("The CSS font value used to render the translated text."),
    addFontBackground: s.boolean("Whether Torii added a background behind the translated text."),
    addFontBorder: s.boolean("Whether Torii added a custom border around the translated text."),
    addBackgroundColor: s.string("The hexadecimal background color used when a text background is enabled."),
    rotation: s.number("The translated text block rotation in radians."),
    angle: s.number("The translated text block rotation in degrees."),
    layout: s.string("The translated text layout orientation."),
    textDir: s.string("The translated text reading direction."),
  },
);

const translateImageInputSchema = s.object(
  "Input for translating and re-typesetting text in a manga, comic, or other image.",
  {
    imageUrl: sourceImageUrlSchema(
      "A public HTTP or HTTPS URL for the source JPG, PNG, or WebP image, no larger than 50 MB.",
    ),
    targetLanguage: targetLanguageSchema,
    translator: translatorSchema,
    font: fontSchema,
    textAlign: s.stringEnum("The translated text alignment. Defaults to auto.", ["auto", "left", "center", "right"]),
    strokeDisabled: s.boolean(
      "Whether to disable the detected text outline when rendering the translation. Defaults to false.",
    ),
    minFontSize: s.integer("The minimum rendered font size. Defaults to 6.", {
      minimum: 6,
      maximum: 100,
    }),
    bubblesOnly: s.boolean(
      "Whether to translate only text detected inside speech bubbles, plus long high-confidence text. Defaults to false.",
    ),
    customPrompt: s.string(
      "Additional translation instructions, terminology, character guidance, or style requirements.",
      { maxLength: 1000 },
    ),
    context: s.string(
      "Story, character, event, and dialogue context used to keep a translation consistent. Pass None to start a Torii context chain, then reuse the returned context for later pages.",
      { maxLength: 10000 },
    ),
  },
  {
    optional: [
      "translator",
      "font",
      "textAlign",
      "strokeDisabled",
      "minFontSize",
      "bubblesOnly",
      "customPrompt",
      "context",
    ],
  },
);

const translateImageOutputSchema = s.object(
  "The primary translated image, translated regions, context, and credit balance. Use inpaint_image separately when a cleaned image without rendered translations is needed.",
  {
    translatedImage: downloadableImageSchema,
    textRegions: s.array(
      "The translated text regions and rendering metadata returned by Torii.",
      translatedTextRegionSchema,
    ),
    context: s.string("The updated Torii translation context for continuing with later pages."),
    creditsRemaining: creditsSchema,
  },
  { optional: ["context", "creditsRemaining"] },
);

const extractTextInputSchema = s.object("Input for extracting structured text from an image.", {
  imageUrl: sourceImageUrlSchema(
    "A public HTTP or HTTPS URL for the JPG, PNG, or WebP image to analyze, no larger than 50 MB.",
  ),
});

const colorTripletSchema = (description: string) =>
  s.tuple(
    [
      s.integer("The blue channel from 0 to 255.", { minimum: 0, maximum: 255 }),
      s.integer("The green channel from 0 to 255.", { minimum: 0, maximum: 255 }),
      s.integer("The red channel from 0 to 255.", { minimum: 0, maximum: 255 }),
    ],
    { description },
  );

const ocrParagraphSchema = s.looseObject(
  "A Torii OCR paragraph with text, geometry, orientation, colors, confidence, and nested line details.",
  {
    text: s.string("The text recognized in the paragraph."),
    polygon: s.array(
      "The paragraph polygon represented by coordinate pairs.",
      s.array("One polygon coordinate pair.", s.number("A pixel coordinate.")),
    ),
    fontsize: s.number("The estimated median paragraph font size in pixels."),
    angle: s.number("The paragraph rotation angle in degrees."),
    alignment: s.string("The paragraph text alignment."),
    direction: s.string("The paragraph text flow direction."),
    bg_color: colorTripletSchema("The detected paragraph background color in BGR order."),
    text_color: colorTripletSchema("The detected paragraph text color in BGR order."),
    stroke_color: colorTripletSchema("The detected paragraph stroke color in BGR order."),
    has_dominant_bg_color: s.boolean("Whether Torii detected a dominant paragraph background color."),
    confidence: s.number("The paragraph OCR confidence from 0 to 1."),
    removed: s.boolean("Whether Torii filtered the paragraph as noise or reading aid text."),
    language_details: s.looseObject("The detected paragraph language and confidence."),
    lines: s.array("The detailed OCR lines within the paragraph.", s.looseObject("One detailed OCR line.")),
  },
);

const extractTextOutputSchema = s.object(
  "The structured Torii OCR result and credit balance.",
  {
    paragraphs: s.array("The paragraphs detected by Torii OCR.", ocrParagraphSchema),
    creditsRemaining: creditsSchema,
  },
  { optional: ["creditsRemaining"] },
);

const inpaintImageInputSchema = s.object("Input for removing masked text or objects from an image.", {
  imageUrl: sourceImageUrlSchema(
    "A public HTTP or HTTPS URL for the source JPG, PNG, or WebP image, no larger than 50 MB.",
  ),
  maskUrl: sourceImageUrlSchema(
    "A public HTTP or HTTPS URL for a mask image whose white areas should be removed and filled.",
  ),
});

const generatedImageOutputSchema = s.object(
  "A generated image in connector transit storage and the remaining Torii credit balance.",
  {
    image: downloadableImageSchema,
    creditsRemaining: creditsSchema,
  },
  { optional: ["creditsRemaining"] },
);

const polygonPointSchema = s.tuple(
  [s.number("The horizontal pixel coordinate."), s.number("The vertical pixel coordinate.")],
  { description: "One polygon point as an x and y pixel coordinate." },
);

const typesetTextBoxSchema = s.object(
  "One translated text box to render over a pre-cleaned image.",
  {
    x: s.number("The top-left horizontal coordinate in pixels."),
    y: s.number("The top-left vertical coordinate in pixels."),
    width: s.number("The text box width in pixels.", { exclusiveMinimum: 0 }),
    height: s.number("The text box height in pixels.", { exclusiveMinimum: 0 }),
    polygon: s.tuple([polygonPointSchema, polygonPointSchema, polygonPointSchema, polygonPointSchema], {
      description: "Four points describing an oriented text region.",
    }),
    text: s.nonEmptyString("The text to render.", { maxLength: 5000 }),
    alignment: s.stringEnum("The horizontal text alignment.", ["left", "center", "right"]),
    textColor: s.nonEmptyString("The text fill color as a hexadecimal color value."),
    strokeColor: s.nonEmptyString("The text outline color as a hexadecimal color value."),
    direction: s.stringEnum("The rendered text direction.", ["left_to_right", "top_to_bottom"]),
    angle: s.number("The text rotation angle in degrees."),
    sourceLanguage: s.nonEmptyString("The language code used for direction-aware rendering, such as ja or zh.", {
      maxLength: 32,
    }),
    fontSize: s.number("The font size for this text box in pixels.", { exclusiveMinimum: 0 }),
  },
  {
    optional: ["x", "y", "width", "height", "polygon", "direction", "angle", "sourceLanguage", "fontSize"],
  },
);
typesetTextBoxSchema.anyOf = [{ required: ["polygon"] }, { required: ["x", "y", "width", "height"] }];
typesetTextBoxSchema.dependentRequired = {
  x: ["y", "width", "height"],
  y: ["x", "width", "height"],
  width: ["x", "y", "height"],
  height: ["x", "y", "width"],
};

const typesetImageInputSchema = s.object(
  "Input for rendering translated text boxes over a pre-cleaned image.",
  {
    imageUrl: sourceImageUrlSchema(
      "A public HTTP or HTTPS URL for the pre-cleaned JPG, PNG, or WebP image, no larger than 50 MB.",
    ),
    textBoxes: s.array("The translated text boxes to render.", typesetTextBoxSchema, {
      minItems: 1,
      maxItems: 500,
    }),
    font: fontSchema,
    minFontSize: s.integer("The minimum rendered font size. Defaults to 12.", {
      minimum: 1,
      maximum: 100,
    }),
    strokeDisabled: s.boolean("Whether to disable text outlines for all rendered text boxes. Defaults to false."),
  },
  { optional: ["font", "minFontSize", "strokeDisabled"] },
);

const getCreditsInputSchema = s.object("Input for retrieving the current Torii credit balance.", {});

const getCreditsOutputSchema = s.object("The current Torii credit balance.", {
  credits: creditsSchema,
});

export const toriiImageTranslatorActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "translate_image",
    operationType: "read",
    description:
      "Translate text in a manga, comic, or other public image with Torii, remove the source text, re-typeset the translation, and return the downloadable translated image.",
    requiredScopes: [],
    inputSchema: translateImageInputSchema,
    outputSchema: translateImageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "extract_text",
    operationType: "read",
    description:
      "Extract structured OCR text, geometry, orientation, colors, and confidence data from a public image with Torii.",
    requiredScopes: [],
    inputSchema: extractTextInputSchema,
    outputSchema: extractTextOutputSchema,
  }),
  defineProviderAction(service, {
    name: "inpaint_image",
    operationType: "read",
    description:
      "Remove masked text or objects from a public image with Torii inpainting and return the cleaned PNG through transit storage.",
    requiredScopes: [],
    inputSchema: inpaintImageInputSchema,
    outputSchema: generatedImageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "typeset_image",
    operationType: "write",
    description:
      "Render translated text boxes over a pre-cleaned public image with Torii and return the typeset PNG through transit storage.",
    requiredScopes: [],
    inputSchema: typesetImageInputSchema,
    outputSchema: generatedImageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_credits",
    operationType: "read",
    description: "Retrieve the credit balance remaining for the connected Torii API key.",
    requiredScopes: [],
    inputSchema: getCreditsInputSchema,
    outputSchema: getCreditsOutputSchema,
  }),
];
