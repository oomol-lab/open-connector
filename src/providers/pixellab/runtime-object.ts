import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
  requiredStringArray,
  stringArray,
} from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import {
  encodeTransitImage,
  normalizeStartedJob,
  normalizeUsage,
  pixellabRequestJson,
  requireResponseRecord,
} from "./runtime.ts";

type PixellabObjectHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const pixellabObjectActionHandlers: Record<string, PixellabObjectHandler> = {
  async start_create_object_1_direction(input, context) {
    const styleImages = await encodeOptionalImages(input.styleImages, "styleImages", context);
    if (optionalInteger(input.size) !== undefined && styleImages !== undefined) {
      throw new ProviderRequestError(400, "size cannot be used with styleImages.");
    }
    const payload = await pixellabRequestJson(
      "POST",
      "/create-1-direction-object",
      compactObject({
        description: requiredString(input.description, "description", invalidInputError),
        size: optionalInteger(input.size),
        view: optionalString(input.view),
        style_images: styleImages,
        item_descriptions:
          input.itemDescriptions === undefined
            ? undefined
            : stringArray(input.itemDescriptions, "itemDescriptions", invalidInputError),
      }),
      context,
    );
    const record = requireResponseRecord(payload, "create 1-direction object");
    return compactObject({
      ...normalizeObjectJob(payload),
      candidateFrameCount: responseInteger(record.n_frames, "PixelLab n_frames"),
    });
  },

  async start_create_object_8_directions(input, context) {
    const referenceImage = await optionalImage(input.referenceImage, "referenceImage", context);
    const styleImage = await optionalImage(input.styleImage, "styleImage", context);
    const selectedInputs = [optionalInteger(input.size), referenceImage, styleImage].filter(
      (value) => value !== undefined,
    );
    if (selectedInputs.length > 1) {
      throw new ProviderRequestError(400, "Only one of size, referenceImage, and styleImage may be provided.");
    }
    const payload = await pixellabRequestJson(
      "POST",
      "/create-8-direction-object",
      compactObject({
        description: requiredString(input.description, "description", invalidInputError),
        size: optionalInteger(input.size),
        view: optionalString(input.view),
        reference_image: referenceImage,
        style_image: styleImage,
      }),
      context,
    );
    return normalizeObjectJob(payload);
  },

  async start_animate_object(input, context) {
    const mode = optionalString(input.mode) ?? "v3";
    const frameCount = optionalInteger(input.frameCount);
    if (mode === "v3" && frameCount !== undefined && (frameCount < 4 || frameCount > 16 || frameCount % 2 !== 0)) {
      throw new ProviderRequestError(400, "frameCount must be an even number from 4 to 16 in v3 mode.");
    }
    const directions =
      input.directions === undefined
        ? undefined
        : requiredStringArray(input.directions, "directions", invalidInputError);
    const customStartFrame = await optionalImage(input.customStartFrame, "customStartFrame", context);
    const endFrame = await optionalImage(input.endFrame, "endFrame", context);
    if ((customStartFrame || endFrame) && mode !== "v3") {
      throw new ProviderRequestError(400, "customStartFrame and endFrame require v3 mode.");
    }
    if ((customStartFrame || endFrame) && directions && directions.length !== 1) {
      throw new ProviderRequestError(400, "customStartFrame and endFrame allow at most one direction.");
    }
    if (input.enhancePrompt === true && optionalString(input.animationDescription) === undefined) {
      throw new ProviderRequestError(400, "animationDescription is required when enhancePrompt is true.");
    }
    const objectId = requiredString(input.objectId, "objectId", invalidInputError);
    const record = requireResponseRecord(
      await pixellabRequestJson(
        "POST",
        `/objects/${encodeURIComponent(objectId)}/animations`,
        compactObject({
          mode,
          animation_description: optionalString(input.animationDescription),
          directions,
          animation_group_id: optionalString(input.animationGroupId),
          display_name: optionalString(input.displayName),
          frame_count: frameCount,
          replace_existing: optionalBoolean(input.replaceExisting),
          custom_start_frame: customStartFrame,
          end_frame: endFrame,
          keep_first_frame: optionalBoolean(input.keepFirstFrame),
          enhance_prompt: optionalBoolean(input.enhancePrompt),
        }),
        context,
      ),
      "animate object",
    );
    if (!Array.isArray(record.submissions)) {
      throw invalidResponseError("PixelLab object animation response is missing submissions.");
    }
    return compactObject({
      animationGroupId: requiredString(record.animation_group_id, "PixelLab animation_group_id", invalidResponseError),
      mode: requiredString(record.mode, "PixelLab mode", invalidResponseError),
      frameCount: responseInteger(record.frame_count, "PixelLab frame_count"),
      displayName: optionalString(record.display_name),
      description: requiredString(record.description, "PixelLab description", invalidResponseError),
      objectId: requiredString(record.object_id, "PixelLab object_id", invalidResponseError),
      submissions: record.submissions.map((submission, index) =>
        normalizeDirectionSubmission(submission, `submissions[${index}]`),
      ),
      enhancedPrompt: optionalString(record.enhanced_prompt),
      usage: normalizeUsage(record.usage),
      enhanceUsage: normalizeUsage(record.enhance_usage),
    });
  },

  async start_create_object_state(input, context) {
    const objectId = requiredString(input.objectId, "objectId", invalidInputError);
    const payload = await pixellabRequestJson(
      "POST",
      `/objects/${encodeURIComponent(objectId)}/states`,
      compactObject({
        edit_description: requiredString(input.editDescription, "editDescription", invalidInputError),
        seed: optionalInteger(input.seed),
      }),
      context,
    );
    return normalizeObjectJob(payload);
  },

  async select_object_frames(input, context) {
    const objectId = requiredString(input.objectId, "objectId", invalidInputError);
    const indices = integerArray(input.indices, "indices");
    const record = requireResponseRecord(
      await pixellabRequestJson(
        "POST",
        `/objects/${encodeURIComponent(objectId)}/select-frames`,
        compactObject({ indices, common_tag: optionalString(input.commonTag) }),
        context,
      ),
      "select object frames",
    );
    return compactObject({
      createdObjectIds: requiredStringArray(
        record.created_object_ids,
        "PixelLab created_object_ids",
        invalidResponseError,
      ),
      usage: normalizeUsage(record.usage),
    });
  },

  async dismiss_object_review(input, context) {
    const objectId = requiredString(input.objectId, "objectId", invalidInputError);
    const record = requireResponseRecord(
      await pixellabRequestJson("POST", `/objects/${encodeURIComponent(objectId)}/dismiss-review`, undefined, context),
      "dismiss object review",
    );
    return compactObject({ dismissed: true, usage: normalizeUsage(record.usage) });
  },

  async list_objects(input, context) {
    const record = requireResponseRecord(
      await pixellabRequestJson("GET", paginatedPath("/objects", input), undefined, context),
      "object list",
    );
    if (!Array.isArray(record.objects)) {
      throw invalidResponseError("PixelLab object list is missing objects.");
    }
    return compactObject({
      objects: record.objects.map((object, index) => normalizeObject(object, `objects[${index}]`)),
      total: responseInteger(record.total, "PixelLab object total"),
      usage: normalizeUsage(record.usage),
    });
  },

  async get_object(input, context) {
    const objectId = requiredString(input.objectId, "objectId", invalidInputError);
    const payload = await pixellabRequestJson("GET", `/objects/${encodeURIComponent(objectId)}`, undefined, context);
    return { object: normalizeObject(payload, "object") };
  },

  async delete_object(input, context) {
    const objectId = requiredString(input.objectId, "objectId", invalidInputError);
    const record = requireResponseRecord(
      await pixellabRequestJson("DELETE", `/objects/${encodeURIComponent(objectId)}`, undefined, context),
      "delete object",
    );
    return compactObject({
      success: record.success === true,
      objectId: optionalString(record.object_id),
      error: optionalString(record.error),
      usage: normalizeUsage(record.usage),
    });
  },

  async update_object_tags(input, context) {
    const objectId = requiredString(input.objectId, "objectId", invalidInputError);
    const tags = requiredStringArray(input.tags, "tags", invalidInputError);
    const record = requireResponseRecord(
      await pixellabRequestJson("PATCH", `/objects/${encodeURIComponent(objectId)}/tags`, { tags }, context),
      "update object tags",
    );
    return compactObject({
      tags: requiredStringArray(record.tags, "PixelLab tags", invalidResponseError),
      usage: normalizeUsage(record.usage),
    });
  },
};

function normalizeObjectJob(payload: unknown): Record<string, unknown> {
  const record = requireResponseRecord(payload, "object job");
  return compactObject({
    ...normalizeStartedJob(payload),
    objectId: requiredString(record.object_id, "PixelLab object_id", invalidResponseError),
  });
}

function normalizeDirectionSubmission(value: unknown, fieldName: string): Record<string, unknown> {
  const record = requiredRecord(value, fieldName, invalidResponseError);
  return compactObject({
    direction: requiredString(record.direction, `${fieldName}.direction`, invalidResponseError),
    status: requiredString(record.status, `${fieldName}.status`, invalidResponseError),
    jobId: optionalString(record.background_job_id),
    animationId: optionalString(record.animation_id),
  });
}

function normalizeObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = requiredRecord(value, fieldName, invalidResponseError);
  return compactObject({
    id: requiredString(record.id, `${fieldName}.id`, invalidResponseError),
    name: optionalString(record.name),
    prompt: requiredString(record.prompt, `${fieldName}.prompt`, invalidResponseError),
    size: normalizeSize(record.size, `${fieldName}.size`),
    directions: responseInteger(record.directions, `${fieldName}.directions`),
    createdAt: requiredString(record.created_at, `${fieldName}.created_at`, invalidResponseError),
    view: optionalString(record.view),
    previewUrl: optionalString(record.preview_url),
    rotationUrls: optionalRecord(record.rotation_urls),
    storageUrls: optionalRecord(record.storage_urls),
    frameUrls: optionalStringList(record.frame_urls),
    styleSettings: optionalRecord(record.style_settings),
    tags: optionalStringList(record.tags),
    status: optionalString(record.status),
    groupId: optionalString(record.group_id),
    progressPercent: optionalInteger(record.progress_percent),
    etaSeconds: optionalInteger(record.eta_seconds),
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

async function encodeOptionalImages(
  value: unknown,
  fieldName: string,
  context: ApiKeyProviderContext,
): Promise<unknown[] | undefined> {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new ProviderRequestError(400, `${fieldName} must be an array.`);
  return Promise.all(value.map((image, index) => encodeTransitImage(image, `${fieldName}[${index}]`, context)));
}

async function optionalImage(value: unknown, fieldName: string, context: ApiKeyProviderContext): Promise<unknown> {
  return value === undefined ? undefined : encodeTransitImage(value, fieldName, context);
}

function integerArray(value: unknown, fieldName: string): number[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ProviderRequestError(400, `${fieldName} must contain at least one integer.`);
  }
  return value.map((entry, index) => {
    const integer = optionalInteger(entry);
    if (integer === undefined) throw new ProviderRequestError(400, `${fieldName}[${index}] must be an integer.`);
    return integer;
  });
}

function optionalStringList(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : undefined;
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

function responseInteger(value: unknown, fieldName: string): number {
  const number = optionalInteger(value);
  if (number === undefined) throw invalidResponseError(`${fieldName} must be an integer.`);
  return number;
}

function invalidInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function invalidResponseError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}
