import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
  requiredStringArray,
} from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import {
  downloadPixellabFile,
  encodeTransitImage,
  normalizeStartedJob,
  normalizeUsage,
  pixellabRequestJson,
  requireResponseRecord,
} from "./runtime.ts";

type PixellabCharacterHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const pixellabCharacterActionHandlers: Record<string, PixellabCharacterHandler> = {
  async start_create_character_4_directions(input, context) {
    return createDirectionalCharacter("/create-character-with-4-directions", input, context);
  },

  async start_create_character_8_directions(input, context) {
    return createDirectionalCharacter("/create-character-with-8-directions", input, context, true);
  },

  async start_create_character_pro(input, context) {
    const method = optionalString(input.method) ?? "create_with_style";
    const conceptImage = await optionalImage(input.conceptImage, "conceptImage", context);
    const referenceImage = await optionalImage(input.referenceImage, "referenceImage", context);
    if (method === "create_from_concept" && !conceptImage) {
      throw new ProviderRequestError(400, "conceptImage is required when method is create_from_concept.");
    }
    if (method === "rotate_character" && !referenceImage) {
      throw new ProviderRequestError(400, "referenceImage is required when method is rotate_character.");
    }
    const payload = await pixellabRequestJson(
      "POST",
      "/create-character-pro",
      compactObject({
        description: requiredString(input.description, "description", invalidInputError),
        image_size: requiredRecord(input.imageSize, "imageSize", invalidInputError),
        method,
        view: optionalString(input.view),
        template_id: optionalString(input.templateId),
        concept_image: conceptImage,
        reference_image: referenceImage,
        style_description: optionalString(input.styleDescription),
        seed: optionalInteger(input.seed),
        no_background: optionalBoolean(input.noBackground),
      }),
      context,
    );
    return normalizeCharacterJob(payload);
  },

  async start_create_character_v3(input, context) {
    const referenceImage = await optionalImage(input.referenceImage, "referenceImage", context);
    if (referenceImage && input.enhancePrompt === true) {
      throw new ProviderRequestError(400, "enhancePrompt cannot be used with referenceImage.");
    }
    const payload = await pixellabRequestJson(
      "POST",
      "/create-character-v3",
      compactObject({
        description: requiredString(input.description, "description", invalidInputError),
        reference_image: referenceImage,
        image_size: optionalRecord(input.imageSize),
        view: optionalString(input.view),
        template_id: optionalString(input.templateId),
        name: optionalString(input.name),
        seed: optionalInteger(input.seed),
        no_background: optionalBoolean(input.noBackground),
        outline: optionalString(input.outline),
        detail: optionalString(input.detail),
        enhance_prompt: optionalBoolean(input.enhancePrompt),
      }),
      context,
    );
    return normalizeCharacterJob(payload);
  },

  async start_create_character_animation(input, context) {
    const frameCount = optionalInteger(input.frameCount);
    if (frameCount !== undefined && frameCount % 2 !== 0) {
      throw new ProviderRequestError(400, "frameCount must be even.");
    }
    const directions =
      input.directions === undefined
        ? undefined
        : requiredStringArray(input.directions, "directions", invalidInputError);
    const customStartFrame = await optionalImage(input.customStartFrame, "customStartFrame", context);
    const endFrame = await optionalImage(input.endFrame, "endFrame", context);
    if ((customStartFrame || endFrame) && directions?.length !== 1) {
      throw new ProviderRequestError(400, "customStartFrame and endFrame require exactly one direction.");
    }
    const payload = await pixellabRequestJson(
      "POST",
      "/characters/animations",
      compactObject({
        character_id: requiredString(input.characterId, "characterId", invalidInputError),
        animation_name: optionalString(input.animationName),
        description: optionalString(input.description),
        action_description: optionalString(input.actionDescription),
        mode: optionalString(input.mode),
        template_animation_id: optionalString(input.templateAnimationId),
        frame_count: frameCount,
        custom_start_frame: customStartFrame,
        end_frame: endFrame,
        keep_first_frame: optionalBoolean(input.keepFirstFrame),
        directions,
        seed: optionalInteger(input.seed),
        enhance_prompt: optionalBoolean(input.enhancePrompt),
      }),
      context,
    );
    const record = requireResponseRecord(payload, "character animation");
    return compactObject({
      jobIds: requiredStringArray(record.background_job_ids, "PixelLab background_job_ids", invalidResponseError),
      directions: requiredStringArray(record.directions, "PixelLab directions", invalidResponseError),
      status: normalizeResourceStatus(record.status ?? "processing"),
      enhancedPrompt: optionalString(record.enhanced_prompt),
      enhanceUsage: normalizeUsage(record.enhance_usage),
    });
  },

  async start_create_character_state(input, context) {
    const payload = await pixellabRequestJson(
      "POST",
      "/create-character-state",
      compactObject({
        character_id: requiredString(input.characterId, "characterId", invalidInputError),
        edit_description: requiredString(input.editDescription, "editDescription", invalidInputError),
        no_background: optionalBoolean(input.noBackground),
        seed: optionalInteger(input.seed),
        use_color_palette_from_reference: optionalBoolean(input.useColorPaletteFromReference),
      }),
      context,
    );
    return normalizeCharacterJob(payload);
  },

  async list_characters(input, context) {
    const record = requireResponseRecord(
      await pixellabRequestJson("GET", paginatedPath("/characters", input), undefined, context),
      "character list",
    );
    if (!Array.isArray(record.characters)) {
      throw invalidResponseError("PixelLab character list is missing characters.");
    }
    return compactObject({
      characters: record.characters.map((character, index) => normalizeCharacter(character, `characters[${index}]`)),
      total: responseInteger(record.total, "PixelLab character total"),
      usage: normalizeUsage(record.usage),
    });
  },

  async get_character(input, context) {
    const characterId = requiredString(input.characterId, "characterId", invalidInputError);
    const payload = await pixellabRequestJson(
      "GET",
      `/characters/${encodeURIComponent(characterId)}`,
      undefined,
      context,
    );
    return { character: normalizeCharacter(payload, "character") };
  },

  async delete_character(input, context) {
    const characterId = requiredString(input.characterId, "characterId", invalidInputError);
    const record = requireResponseRecord(
      await pixellabRequestJson("DELETE", `/characters/${encodeURIComponent(characterId)}`, undefined, context),
      "delete character",
    );
    return compactObject({
      success: record.success === true,
      characterId: optionalString(record.character_id),
      filesDeleted: optionalInteger(record.files_deleted),
      animationsDeleted: optionalInteger(record.animations_deleted),
      error: optionalString(record.error),
      usage: normalizeUsage(record.usage),
    });
  },

  async download_character_zip(input, context) {
    const characterId = requiredString(input.characterId, "characterId", invalidInputError);
    const file = await downloadPixellabFile(
      `/characters/${encodeURIComponent(characterId)}/zip`,
      `pixellab-character-${safeFileSegment(characterId)}.zip`,
      context,
    );
    return { file };
  },

  async update_character_tags(input, context) {
    const characterId = requiredString(input.characterId, "characterId", invalidInputError);
    const tags = requiredStringArray(input.tags, "tags", invalidInputError);
    const record = requireResponseRecord(
      await pixellabRequestJson("PATCH", `/characters/${encodeURIComponent(characterId)}/tags`, { tags }, context),
      "update character tags",
    );
    return compactObject({
      tags: requiredStringArray(record.tags, "PixelLab tags", invalidResponseError),
      usage: normalizeUsage(record.usage),
    });
  },
};

async function createDirectionalCharacter(
  path: string,
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  includeMode = false,
): Promise<Record<string, unknown>> {
  const payload = await pixellabRequestJson(
    "POST",
    path,
    compactObject({
      description: requiredString(input.description, "description", invalidInputError),
      image_size: requiredRecord(input.imageSize, "imageSize", invalidInputError),
      mode: includeMode ? optionalString(input.mode) : undefined,
      async_mode: true,
      text_guidance_scale: optionalNumber(input.textGuidanceScale),
      outline: optionalString(input.outline),
      shading: optionalString(input.shading),
      detail: optionalString(input.detail),
      view: optionalString(input.view),
      isometric: optionalBoolean(input.isometric),
      color_image: await optionalImage(input.colorImage, "colorImage", context),
      force_colors: optionalBoolean(input.forceColors),
      template_id: optionalString(input.templateId),
      seed: optionalInteger(input.seed),
    }),
    context,
  );
  return normalizeCharacterJob(payload);
}

function normalizeCharacterJob(payload: unknown): Record<string, unknown> {
  const record = requireResponseRecord(payload, "character job");
  return compactObject({
    ...normalizeStartedJob(payload),
    characterId: requiredString(record.character_id, "PixelLab character_id", invalidResponseError),
  });
}

function normalizeCharacter(value: unknown, fieldName: string): Record<string, unknown> {
  const record = requiredRecord(value, fieldName, invalidResponseError);
  return compactObject({
    id: requiredString(record.id, `${fieldName}.id`, invalidResponseError),
    name: requiredString(record.name, `${fieldName}.name`, invalidResponseError),
    prompt: requiredString(record.prompt, `${fieldName}.prompt`, invalidResponseError),
    size: normalizeSize(record.size, `${fieldName}.size`),
    directions: responseInteger(record.directions, `${fieldName}.directions`),
    createdAt: requiredString(record.created_at, `${fieldName}.created_at`, invalidResponseError),
    animationCount: responseInteger(record.animation_count, `${fieldName}.animation_count`),
    templateId: requiredString(record.template_id, `${fieldName}.template_id`, invalidResponseError),
    view: optionalString(record.view),
    previewUrl: optionalString(record.preview_url),
    tags: Array.isArray(record.tags) ? record.tags.filter((tag): tag is string => typeof tag === "string") : undefined,
    groupId: optionalString(record.group_id),
    rotationUrls: optionalRecord(record.rotation_urls),
    animations: Array.isArray(record.animations) ? record.animations : undefined,
  });
}

function normalizeSize(value: unknown, fieldName: string): Record<string, number> {
  const record = requiredRecord(value, fieldName, invalidResponseError);
  return {
    width: responseInteger(record.width, `${fieldName}.width`),
    height: responseInteger(record.height, `${fieldName}.height`),
  };
}

async function optionalImage(value: unknown, fieldName: string, context: ApiKeyProviderContext): Promise<unknown> {
  return value === undefined ? undefined : encodeTransitImage(value, fieldName, context);
}

function normalizeResourceStatus(value: unknown): "queued" | "processing" | "completed" | "failed" {
  const status = requiredString(value, "PixelLab status", invalidResponseError);
  if (status === "queued" || status === "processing" || status === "completed" || status === "failed") {
    return status;
  }
  throw invalidResponseError(`PixelLab returned unsupported status: ${status}`);
}

function paginatedPath(path: string, input: Record<string, unknown>): string {
  const params = new URLSearchParams();
  const limit = optionalInteger(input.limit);
  const offset = optionalInteger(input.offset);
  if (limit !== undefined) params.set("limit", String(limit));
  if (offset !== undefined) params.set("offset", String(offset));
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

function safeFileSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/gu, "_").slice(0, 80) || "export";
}

function responseInteger(value: unknown, fieldName: string): number {
  const number = optionalInteger(value);
  if (number === undefined) {
    throw invalidResponseError(`${fieldName} must be an integer.`);
  }
  return number;
}

function invalidInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function invalidResponseError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}
