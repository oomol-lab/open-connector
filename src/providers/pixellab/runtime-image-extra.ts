import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  integer,
  objectArray,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
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

type PixellabImageExtraHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const pixellabImageExtraActionHandlers: Record<string, PixellabImageExtraHandler> = {
  async start_pixflux_background(input, context) {
    const payload = await pixellabRequestJson(
      "POST",
      "/create-image-pixflux-background",
      await buildPixfluxBody(input, context),
      context,
    );
    return normalizeStartedJob(payload);
  },

  async start_edit_animation(input, context) {
    const frames = await encodeFrameList(input.frames, "frames", context);
    const payload = await pixellabRequestJson(
      "POST",
      "/edit-animation-v2",
      compactObject({
        description: inputString(input.description, "description"),
        frames,
        image_size: inputRecord(input.imageSize, "imageSize"),
        seed: optionalInteger(input.seed),
        no_background: optionalBoolean(input.noBackground),
      }),
      context,
    );
    return normalizeStartedJob(payload);
  },

  async start_interpolation(input, context) {
    const payload = await pixellabRequestJson(
      "POST",
      "/interpolation-v2",
      compactObject({
        start_image: await encodeFrame(input.startImage, "startImage", context),
        end_image: await encodeFrame(input.endImage, "endImage", context),
        action: inputString(input.action, "action"),
        image_size: inputRecord(input.imageSize, "imageSize"),
        seed: optionalInteger(input.seed),
        no_background: optionalBoolean(input.noBackground),
      }),
      context,
    );
    return normalizeStartedJob(payload);
  },

  async start_transfer_outfit(input, context) {
    const payload = await pixellabRequestJson(
      "POST",
      "/transfer-outfit-v2",
      compactObject({
        reference_image: await encodeFrame(input.referenceImage, "referenceImage", context),
        frames: await encodeFrameList(input.frames, "frames", context),
        image_size: inputRecord(input.imageSize, "imageSize"),
        seed: optionalInteger(input.seed),
        no_background: optionalBoolean(input.noBackground),
        additional_instructions: optionalString(input.additionalInstructions),
      }),
      context,
    );
    return normalizeStartedJob(payload);
  },

  async start_portrait_character_conversion(input, context) {
    const payload = await pixellabRequestJson(
      "POST",
      "/portrait-character-pro",
      compactObject({
        direction: optionalString(input.direction),
        image: await encodeTransitImage(input.image, "image", context),
        view: optionalString(input.view),
        result_size: optionalInteger(input.resultSize),
        seed: optionalInteger(input.seed),
      }),
      context,
    );
    return normalizeStartedJob(payload);
  },

  async animate_with_text_legacy(input, context) {
    const payload = await pixellabRequestJson(
      "POST",
      "/animate-with-text",
      compactObject({
        image_size: inputRecord(input.imageSize, "imageSize"),
        description: inputString(input.description, "description"),
        action: inputString(input.action, "action"),
        text_guidance_scale: optionalNumber(input.textGuidanceScale),
        image_guidance_scale: optionalNumber(input.imageGuidanceScale),
        n_frames: optionalInteger(input.frameCount),
        start_frame_index: optionalInteger(input.startFrameIndex),
        view: optionalString(input.view),
        direction: optionalString(input.direction),
        reference_image: await encodeTransitImage(input.referenceImage, "referenceImage", context),
        color_image: await encodeOptionalImage(input.colorImage, "colorImage", context),
        seed: optionalInteger(input.seed),
      }),
      context,
    );
    const record = requireResponseRecord(payload, "animate-with-text");
    const frames = await storePixellabImages(record.images, "pixellab-legacy-animation", context);
    return compactObject({ frames, frameCount: frames.length, usage: normalizeUsage(record.usage) });
  },

  async start_text_animation_pro(input, context) {
    const payload = await pixellabRequestJson(
      "POST",
      "/animate-with-text-v2",
      compactObject({
        reference_image: await encodeTransitImage(input.referenceImage, "referenceImage", context),
        reference_image_size: inputRecord(input.referenceImageSize, "referenceImageSize"),
        action: inputString(input.action, "action"),
        image_size: inputRecord(input.imageSize, "imageSize"),
        seed: optionalInteger(input.seed),
        no_background: optionalBoolean(input.noBackground),
        view: optionalString(input.view),
        direction: optionalString(input.direction),
      }),
      context,
    );
    return normalizeStartedJob(payload);
  },

  async start_generate_rotations_pro(input, context) {
    const method = optionalString(input.method) ?? "rotate_character";
    const referenceImage = await encodeOptionalFlatImage(input.referenceImage, "referenceImage", context);
    const conceptImage = await encodeOptionalFlatImage(input.conceptImage, "conceptImage", context);
    if ((method === "rotate_character" || method === "create_with_style") && !referenceImage) {
      throw new ProviderRequestError(400, `referenceImage is required when method is ${method}.`);
    }
    if (method === "create_from_concept" && !conceptImage) {
      throw new ProviderRequestError(400, "conceptImage is required when method is create_from_concept.");
    }
    const payload = await pixellabRequestJson(
      "POST",
      "/generate-8-rotations-v2",
      compactObject({
        method,
        image_size: inputRecord(input.imageSize, "imageSize"),
        reference_image: referenceImage,
        concept_image: conceptImage,
        description: optionalString(input.description),
        style_description: optionalString(input.styleDescription),
        view: optionalString(input.view),
        seed: optionalInteger(input.seed),
        no_background: optionalBoolean(input.noBackground),
      }),
      context,
    );
    return normalizeStartedJob(payload);
  },

  async rotate_image(input, context) {
    const initImage = await encodeOptionalImage(input.initImage, "initImage", context);
    const maskImage = await encodeOptionalImage(input.maskImage, "maskImage", context);
    if (maskImage && !initImage) {
      throw new ProviderRequestError(400, "initImage is required when maskImage is provided.");
    }
    const payload = await pixellabRequestJson(
      "POST",
      "/rotate",
      compactObject({
        image_size: inputRecord(input.imageSize, "imageSize"),
        image_guidance_scale: optionalNumber(input.imageGuidanceScale),
        view_change: optionalInteger(input.viewChange),
        direction_change: optionalInteger(input.directionChange),
        from_view: optionalString(input.fromView),
        to_view: optionalString(input.toView),
        from_direction: optionalString(input.fromDirection),
        to_direction: optionalString(input.toDirection),
        isometric: optionalBoolean(input.isometric),
        oblique_projection: optionalBoolean(input.obliqueProjection),
        init_image: initImage,
        init_image_strength: optionalInteger(input.initImageStrength),
        mask_image: maskImage,
        from_image: await encodeTransitImage(input.fromImage, "fromImage", context),
        color_image: await encodeOptionalImage(input.colorImage, "colorImage", context),
        seed: optionalInteger(input.seed),
      }),
      context,
    );
    return normalizeSingleImage(payload, "pixellab-rotated", context);
  },

  async inpaint_image_legacy(input, context) {
    const payload = await pixellabRequestJson(
      "POST",
      "/inpaint",
      compactObject({
        description: inputString(input.description, "description"),
        image_size: inputRecord(input.imageSize, "imageSize"),
        text_guidance_scale: optionalNumber(input.textGuidanceScale),
        outline: optionalString(input.outline),
        shading: optionalString(input.shading),
        detail: optionalString(input.detail),
        view: optionalString(input.view),
        direction: optionalString(input.direction),
        isometric: optionalBoolean(input.isometric),
        oblique_projection: optionalBoolean(input.obliqueProjection),
        no_background: optionalBoolean(input.noBackground),
        init_image: await encodeOptionalImage(input.initImage, "initImage", context),
        init_image_strength: optionalInteger(input.initImageStrength),
        inpainting_image: await encodeTransitImage(input.inpaintingImage, "inpaintingImage", context),
        mask_image: await encodeTransitImage(input.maskImage, "maskImage", context),
        color_image: await encodeOptionalImage(input.colorImage, "colorImage", context),
        seed: optionalInteger(input.seed),
      }),
      context,
    );
    return normalizeSingleImage(payload, "pixellab-inpainted", context);
  },

  async start_edit_image_legacy(input, context) {
    const payload = await pixellabRequestJson(
      "POST",
      "/edit-image",
      compactObject({
        image: await encodeTransitImage(input.image, "image", context),
        image_size: inputRecord(input.imageSize, "imageSize"),
        description: inputString(input.description, "description"),
        width: optionalInteger(input.width),
        height: optionalInteger(input.height),
        seed: optionalInteger(input.seed),
        no_background: optionalBoolean(input.noBackground),
        text_guidance_scale: optionalNumber(input.textGuidanceScale),
        color_image: await encodeOptionalImage(input.colorImage, "colorImage", context),
      }),
      context,
    );
    return normalizeStartedJob(payload);
  },
};

async function buildPixfluxBody(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  return compactObject({
    description: inputString(input.description, "description"),
    image_size: inputRecord(input.imageSize, "imageSize"),
    text_guidance_scale: optionalNumber(input.textGuidanceScale),
    outline: optionalString(input.outline),
    shading: optionalString(input.shading),
    detail: optionalString(input.detail),
    view: optionalString(input.view),
    direction: optionalString(input.direction),
    isometric: optionalBoolean(input.isometric),
    no_background: optionalBoolean(input.noBackground),
    background_removal_task: optionalString(input.backgroundRemovalTask),
    init_image: await encodeOptionalImage(input.initImage, "initImage", context),
    init_image_strength: optionalInteger(input.initImageStrength),
    color_image: await encodeOptionalImage(input.colorImage, "colorImage", context),
    seed: optionalInteger(input.seed),
  });
}

async function encodeFrameList(
  value: unknown,
  fieldName: string,
  context: ApiKeyProviderContext,
): Promise<Array<Record<string, unknown>>> {
  return Promise.all(
    objectArray(value, fieldName, invalidInputError).map((frame, index) =>
      encodeFrame(frame, `${fieldName}[${index}]`, context),
    ),
  );
}

async function encodeFrame(
  value: unknown,
  fieldName: string,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const record = requiredRecord(value, fieldName, invalidInputError);
  return {
    image: await encodeTransitImage(record.file, `${fieldName}.file`, context),
    size: {
      width: integer(record.width, `${fieldName}.width`, invalidInputError),
      height: integer(record.height, `${fieldName}.height`, invalidInputError),
    },
  };
}

async function encodeOptionalFlatImage(
  value: unknown,
  fieldName: string,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown> | undefined> {
  if (value === undefined) {
    return undefined;
  }
  const record = requiredRecord(value, fieldName, invalidInputError);
  return {
    image: await encodeTransitImage(record.file, `${fieldName}.file`, context),
    width: integer(record.width, `${fieldName}.width`, invalidInputError),
    height: integer(record.height, `${fieldName}.height`, invalidInputError),
  };
}

async function encodeOptionalImage(
  value: unknown,
  fieldName: string,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  return value === undefined ? undefined : encodeTransitImage(value, fieldName, context);
}

async function normalizeSingleImage(
  payload: unknown,
  namePrefix: string,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const record = requireResponseRecord(payload, namePrefix);
  const images = await storePixellabImages([record.image], namePrefix, context);
  const image = images[0];
  if (!image) {
    throw invalidResponseError("PixelLab response did not include an image.");
  }
  return compactObject({ image, usage: normalizeUsage(record.usage) });
}

function inputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, invalidInputError);
}

function inputRecord(value: unknown, fieldName: string): Record<string, unknown> {
  return requiredRecord(value, fieldName, invalidInputError);
}

function invalidInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function invalidResponseError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}
