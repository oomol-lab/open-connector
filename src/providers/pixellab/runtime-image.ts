import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  integer,
  objectArray,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import {
  encodeTransitImage,
  normalizeStartedJob,
  normalizeUsage,
  pixellabRequestJson,
  requireResponseRecord,
  storePixellabImages,
} from "./runtime.ts";

type PixellabImageActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

type SizedImageLayout = "flat" | "nested";

export const pixellabImageActionHandlers: Record<string, PixellabImageActionHandler> = {
  async get_balance(_input, context) {
    const record = requireResponseRecord(await pixellabRequestJson("GET", "/balance", undefined, context), "balance");
    const credits = requiredRecord(record.credits, "PixelLab balance credits", invalidResponseError);
    const subscription = requiredRecord(record.subscription, "PixelLab balance subscription", invalidResponseError);
    return compactObject({
      creditsUsd: requireResponseNumber(credits.usd, "PixelLab credits.usd"),
      subscriptionStatus: requiredString(subscription.status, "PixelLab subscription.status", invalidResponseError),
      subscriptionPlan: optionalString(subscription.plan),
      generationsRemaining: requireResponseNumber(subscription.generations, "PixelLab subscription.generations"),
      generationsTotal: requireResponseNumber(subscription.total, "PixelLab subscription.total"),
    });
  },

  async start_generate_image(input, context) {
    const referenceImages = await encodeOptionalSizedImageList(
      input.referenceImages,
      "referenceImages",
      "nested",
      context,
      true,
    );
    const styleImage = await encodeOptionalSizedImage(input.styleImage, "styleImage", "nested", context, true);
    const payload = await pixellabRequestJson(
      "POST",
      "/generate-image-v2",
      compactObject({
        description: requiredString(input.description, "description", invalidInputError),
        image_size: requiredRecord(input.imageSize, "imageSize", invalidInputError),
        seed: optionalInteger(input.seed),
        no_background: optionalBoolean(input.noBackground),
        reference_images: referenceImages,
        style_image: styleImage,
        style_options: normalizeStyleOptions(input.styleOptions),
      }),
      context,
    );
    return normalizeStartedJob(payload);
  },

  async start_generate_with_style(input, context) {
    const styleImages = await encodeSizedImageList(input.styleImages, "styleImages", "flat", context);
    const payload = await pixellabRequestJson(
      "POST",
      "/generate-with-style-v2",
      compactObject({
        style_images: styleImages,
        description: requiredString(input.description, "description", invalidInputError),
        image_size: requiredRecord(input.imageSize, "imageSize", invalidInputError),
        style_description: optionalString(input.styleDescription),
        seed: optionalInteger(input.seed),
        no_background: optionalBoolean(input.noBackground),
      }),
      context,
    );
    return normalizeStartedJob(payload);
  },

  async start_generate_ui(input, context) {
    const conceptImage = await encodeOptionalSizedImage(input.conceptImage, "conceptImage", "nested", context);
    const payload = await pixellabRequestJson(
      "POST",
      "/generate-ui-v2",
      compactObject({
        description: requiredString(input.description, "description", invalidInputError),
        image_size: optionalRecord(input.imageSize),
        seed: optionalInteger(input.seed),
        no_background: optionalBoolean(input.noBackground),
        concept_image: conceptImage,
        color_palette: optionalString(input.colorPalette),
      }),
      context,
    );
    return normalizeStartedJob(payload);
  },

  async create_pixflux_image(input, context) {
    const initImage = await encodeOptionalTransitImage(input.initImage, "initImage", context);
    const colorImage = await encodeOptionalTransitImage(input.colorImage, "colorImage", context);
    const payload = await pixellabRequestJson(
      "POST",
      "/create-image-pixflux",
      compactObject({
        description: requiredString(input.description, "description", invalidInputError),
        image_size: requiredRecord(input.imageSize, "imageSize", invalidInputError),
        text_guidance_scale: optionalNumber(input.textGuidanceScale),
        outline: optionalString(input.outline),
        shading: optionalString(input.shading),
        detail: optionalString(input.detail),
        view: optionalString(input.view),
        direction: optionalString(input.direction),
        isometric: optionalBoolean(input.isometric),
        no_background: optionalBoolean(input.noBackground),
        background_removal_task: optionalString(input.backgroundRemovalTask),
        init_image: initImage,
        init_image_strength: optionalInteger(input.initImageStrength),
        color_image: colorImage,
        seed: optionalInteger(input.seed),
      }),
      context,
    );
    return normalizeSingleImageResponse(payload, "pixellab-pixflux", context);
  },

  async create_pixen_image(input, context) {
    validatePixenImageSize(input.imageSize);
    const payload = await pixellabRequestJson(
      "POST",
      "/create-image-pixen",
      compactObject({
        description: requiredString(input.description, "description", invalidInputError),
        image_size: requiredRecord(input.imageSize, "imageSize", invalidInputError),
        outline: optionalString(input.outline),
        detail: optionalString(input.detail),
        view: optionalString(input.view),
        direction: optionalString(input.direction),
        no_background: optionalBoolean(input.noBackground),
        background_removal_task: optionalString(input.backgroundRemovalTask),
        seed: optionalInteger(input.seed),
        enhance_prompt: optionalBoolean(input.enhancePrompt),
      }),
      context,
    );
    const record = requireResponseRecord(payload, "create-image-pixen");
    const image = await storeSingleImage(record.image, "pixellab-pixen", context);
    return compactObject({
      image,
      enhancedPrompt: optionalString(record.enhanced_prompt),
      usage: normalizeUsage(record.usage),
      enhanceUsage: normalizeUsage(record.enhance_usage),
    });
  },

  async convert_to_pixel_art(input, context) {
    const image = await encodeTransitImage(input.image, "image", context);
    const payload = await pixellabRequestJson(
      "POST",
      "/image-to-pixelart",
      compactObject({
        image,
        image_size: requiredRecord(input.imageSize, "imageSize", invalidInputError),
        output_size: requiredRecord(input.outputSize, "outputSize", invalidInputError),
        text_guidance_scale: optionalNumber(input.textGuidanceScale),
        seed: optionalInteger(input.seed),
      }),
      context,
    );
    return normalizeSingleImageResponse(payload, "pixellab-pixel-art", context);
  },

  async start_convert_to_pixel_art_pro(input, context) {
    const image = await encodeTransitImage(input.image, "image", context);
    const payload = await pixellabRequestJson(
      "POST",
      "/image-to-pixelart-pro",
      compactObject({
        image,
        description: optionalString(input.description),
        seed: optionalInteger(input.seed),
      }),
      context,
    );
    return normalizeStartedJob(payload);
  },

  async resize_image(input, context) {
    const referenceImage = await encodeTransitImage(input.referenceImage, "referenceImage", context);
    const colorImage = await encodeOptionalTransitImage(input.colorImage, "colorImage", context);
    const initImage = await encodeOptionalTransitImage(input.initImage, "initImage", context);
    const payload = await pixellabRequestJson(
      "POST",
      "/resize",
      compactObject({
        description: requiredString(input.description, "description", invalidInputError),
        reference_image: referenceImage,
        reference_image_size: requiredRecord(input.referenceImageSize, "referenceImageSize", invalidInputError),
        target_size: requiredRecord(input.targetSize, "targetSize", invalidInputError),
        view: optionalString(input.view),
        direction: optionalString(input.direction),
        isometric: optionalBoolean(input.isometric),
        oblique_projection: optionalBoolean(input.obliqueProjection),
        no_background: optionalBoolean(input.noBackground),
        color_image: colorImage,
        init_image: initImage,
        init_image_strength: optionalNumber(input.initImageStrength),
        seed: optionalInteger(input.seed),
      }),
      context,
    );
    return normalizeSingleImageResponse(payload, "pixellab-resized", context);
  },

  async remove_background(input, context) {
    const image = await encodeTransitImage(input.image, "image", context);
    const payload = await pixellabRequestJson(
      "POST",
      "/remove-background",
      compactObject({
        image,
        image_size: requiredRecord(input.imageSize, "imageSize", invalidInputError),
        background_removal_task: optionalString(input.backgroundRemovalTask),
        text: optionalString(input.text),
        seed: optionalInteger(input.seed),
      }),
      context,
    );
    return normalizeSingleImageResponse(payload, "pixellab-no-background", context);
  },

  async start_edit_images(input, context) {
    const method = optionalString(input.method) ?? "edit_with_text";
    if (method !== "edit_with_text" && method !== "edit_with_reference") {
      throw new ProviderRequestError(400, "method must be edit_with_text or edit_with_reference.");
    }
    const description = optionalString(input.description);
    const referenceImage =
      method === "edit_with_reference"
        ? await encodeOptionalSizedImage(input.referenceImage, "referenceImage", "flat", context)
        : undefined;
    if (method === "edit_with_text" && !description) {
      throw new ProviderRequestError(400, "description is required when method is edit_with_text.");
    }
    if (method === "edit_with_reference" && !referenceImage) {
      throw new ProviderRequestError(400, "referenceImage is required when method is edit_with_reference.");
    }
    const editImages = await encodeSizedImageList(input.editImages, "editImages", "flat", context);
    const payload = await pixellabRequestJson(
      "POST",
      "/edit-images-v2",
      compactObject({
        method,
        edit_images: editImages,
        image_size: requiredRecord(input.imageSize, "imageSize", invalidInputError),
        description: method === "edit_with_text" ? description : undefined,
        reference_image: method === "edit_with_reference" ? referenceImage : undefined,
        seed: optionalInteger(input.seed),
        no_background: optionalBoolean(input.noBackground),
      }),
      context,
    );
    return normalizeStartedJob(payload);
  },

  async start_inpaint(input, context) {
    const imageSize = requiredRecord(input.imageSize, "imageSize", invalidInputError);
    const image = await encodeTransitImage(input.image, "image", context);
    const maskImage = await encodeTransitImage(input.maskImage, "maskImage", context);
    const payload = await pixellabRequestJson(
      "POST",
      "/inpaint-v3",
      compactObject({
        description: requiredString(input.description, "description", invalidInputError),
        inpainting_image: { image, size: imageSize },
        mask_image: { image: maskImage, size: imageSize },
        seed: optionalInteger(input.seed),
        no_background: optionalBoolean(input.noBackground),
        crop_to_mask: optionalBoolean(input.cropToMask),
      }),
      context,
    );
    return normalizeStartedJob(payload);
  },

  async start_generate_rotations(input, context) {
    const firstFrame = await encodeTransitImage(input.firstFrame, "firstFrame", context);
    const payload = await pixellabRequestJson(
      "POST",
      "/generate-8-rotations-v3",
      compactObject({
        first_frame: firstFrame,
        no_background: optionalBoolean(input.noBackground),
        seed: optionalInteger(input.seed),
      }),
      context,
    );
    return normalizeStartedJob(payload);
  },

  async enhance_pixen_prompt(input, context) {
    validatePixenImageSize(input.imageSize);
    const payload = await pixellabRequestJson(
      "POST",
      "/enhance-pixen-prompt",
      compactObject({
        description: requiredString(input.description, "description", invalidInputError),
        image_size: requiredRecord(input.imageSize, "imageSize", invalidInputError),
        outline: optionalString(input.outline),
        detail: optionalString(input.detail),
        view: optionalString(input.view),
        direction: optionalString(input.direction),
        no_background: optionalBoolean(input.noBackground),
      }),
      context,
    );
    return normalizePromptResponse(payload, "enhance-pixen-prompt");
  },

  async enhance_character_prompt(input, context) {
    const payload = await pixellabRequestJson(
      "POST",
      "/enhance-character-v3-prompt",
      compactObject({
        description: requiredString(input.description, "description", invalidInputError),
        image_size: requiredRecord(input.imageSize, "imageSize", invalidInputError),
        view: optionalString(input.view),
        outline: optionalString(input.outline),
        detail: optionalString(input.detail),
      }),
      context,
    );
    return normalizePromptResponse(payload, "enhance-character-v3-prompt");
  },

  async enhance_animation_prompt(input, context) {
    const firstFrame = await encodeTransitImage(input.firstFrame, "firstFrame", context);
    const lastFrame = await encodeOptionalTransitImage(input.lastFrame, "lastFrame", context);
    const payload = await pixellabRequestJson(
      "POST",
      "/enhance-animation-v3-prompt",
      compactObject({
        first_frame: firstFrame,
        last_frame: lastFrame,
        action: requiredString(input.action, "action", invalidInputError),
      }),
      context,
    );
    return normalizePromptResponse(payload, "enhance-animation-v3-prompt");
  },
};

async function normalizeSingleImageResponse(
  payload: unknown,
  namePrefix: string,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const record = requireResponseRecord(payload, namePrefix);
  return compactObject({
    image: await storeSingleImage(record.image, namePrefix, context),
    usage: normalizeUsage(record.usage),
  });
}

async function storeSingleImage(value: unknown, namePrefix: string, context: ApiKeyProviderContext): Promise<unknown> {
  const images = await storePixellabImages([value], namePrefix, context);
  const image = images[0];
  if (!image) {
    throw invalidResponseError("PixelLab response did not include an image.");
  }
  return image;
}

function normalizePromptResponse(payload: unknown, operation: string): Record<string, unknown> {
  const record = requireResponseRecord(payload, operation);
  return compactObject({
    enhancedPrompt: requiredString(record.enhanced_prompt, "PixelLab enhanced_prompt", invalidResponseError),
    usage: normalizeUsage(record.usage),
  });
}

async function encodeOptionalTransitImage(
  value: unknown,
  fieldName: string,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  return value === undefined ? undefined : encodeTransitImage(value, fieldName, context);
}

async function encodeSizedImageList(
  value: unknown,
  fieldName: string,
  layout: SizedImageLayout,
  context: ApiKeyProviderContext,
  includeUsageDescription = false,
): Promise<Array<Record<string, unknown>>> {
  const images = objectArray(value, fieldName, invalidInputError);
  return Promise.all(
    images.map((image, index) =>
      encodeSizedImage(image, `${fieldName}[${index}]`, layout, context, includeUsageDescription),
    ),
  );
}

async function encodeOptionalSizedImageList(
  value: unknown,
  fieldName: string,
  layout: SizedImageLayout,
  context: ApiKeyProviderContext,
  includeUsageDescription = false,
): Promise<Array<Record<string, unknown>> | undefined> {
  return value === undefined
    ? undefined
    : encodeSizedImageList(value, fieldName, layout, context, includeUsageDescription);
}

async function encodeOptionalSizedImage(
  value: unknown,
  fieldName: string,
  layout: SizedImageLayout,
  context: ApiKeyProviderContext,
  includeUsageDescription = false,
): Promise<Record<string, unknown> | undefined> {
  if (value === undefined) {
    return undefined;
  }
  return encodeSizedImage(
    requiredRecord(value, fieldName, invalidInputError),
    fieldName,
    layout,
    context,
    includeUsageDescription,
  );
}

async function encodeSizedImage(
  record: Record<string, unknown>,
  fieldName: string,
  layout: SizedImageLayout,
  context: ApiKeyProviderContext,
  includeUsageDescription: boolean,
): Promise<Record<string, unknown>> {
  const image = await encodeTransitImage(record.file, `${fieldName}.file`, context);
  const width = integer(record.width, `${fieldName}.width`, invalidInputError);
  const height = integer(record.height, `${fieldName}.height`, invalidInputError);
  if (layout === "flat") {
    return { image, width, height };
  }
  return compactObject({
    image,
    size: { width, height },
    usage_description: includeUsageDescription ? optionalString(record.usageDescription) : undefined,
  });
}

function normalizeStyleOptions(value: unknown): Record<string, boolean | undefined> | undefined {
  const record = optionalRecord(value);
  if (!record) {
    return undefined;
  }
  return compactObject({
    color_palette: optionalBoolean(record.colorPalette),
    outline: optionalBoolean(record.outline),
    detail: optionalBoolean(record.detail),
    shading: optionalBoolean(record.shading),
  });
}

function validatePixenImageSize(value: unknown): void {
  const size = requiredRecord(value, "imageSize", invalidInputError);
  const width = integer(size.width, "imageSize.width", invalidInputError);
  const height = integer(size.height, "imageSize.height", invalidInputError);
  if (width % 4 !== 0 || height % 4 !== 0) {
    throw new ProviderRequestError(400, "imageSize width and height must be divisible by 4.");
  }
  if (width * height > 512 * 512) {
    throw new ProviderRequestError(400, "imageSize area cannot exceed 512 by 512 pixels.");
  }
}

function requireResponseNumber(value: unknown, fieldName: string): number {
  const number = optionalNumber(value);
  if (number === undefined) {
    throw invalidResponseError(`${fieldName} must be a finite number.`);
  }
  return number;
}

function invalidInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function invalidResponseError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}
