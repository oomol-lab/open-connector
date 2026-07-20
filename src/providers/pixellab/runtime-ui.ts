import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  objectArray,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
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

type PixellabUiHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const pixellabUiActionHandlers: Record<string, PixellabUiHandler> = {
  async start_create_ui_asset(input, context) {
    const styleImage =
      input.styleImage === undefined ? undefined : await encodeTransitImage(input.styleImage, "styleImage", context);
    const payload = await pixellabRequestJson(
      "POST",
      "/create-ui-asset",
      compactObject({
        description: requiredString(input.description, "description", invalidInputError),
        image_size: optionalRecord(input.imageSize),
        pieces: input.pieces === undefined ? undefined : objectArray(input.pieces, "pieces", invalidInputError),
        elements: input.elements === undefined ? undefined : stringArray(input.elements, "elements", invalidInputError),
        style_image: styleImage,
        color_palette: optionalString(input.colorPalette),
        no_background: optionalBoolean(input.noBackground),
        seed: optionalInteger(input.seed),
        name: optionalString(input.name),
        project_id: optionalString(input.projectId),
      }),
      context,
    );
    const record = requireResponseRecord(payload, "create-ui-asset");
    const job = normalizeStartedJob(payload);
    return {
      ...job,
      uiAssetId: requiredString(record.ui_asset_id, "PixelLab ui_asset_id", invalidResponseError),
    };
  },

  async list_ui_assets(input, context) {
    const payload = await pixellabRequestJson("GET", paginatedPath("/ui-assets", input), undefined, context);
    const record = requireResponseRecord(payload, "ui-assets list");
    if (!Array.isArray(record.ui_assets)) {
      throw invalidResponseError("PixelLab UI asset list is missing ui_assets.");
    }
    return compactObject({
      assets: record.ui_assets.map((asset, index) => normalizeUiAsset(asset, `ui_assets[${index}]`)),
      total: responseInteger(record.total, "PixelLab UI asset total"),
      usage: normalizeUsage(record.usage),
    });
  },

  async get_ui_asset(input, context) {
    const uiAssetId = requiredString(input.uiAssetId, "uiAssetId", invalidInputError);
    const payload = await pixellabRequestJson("GET", `/ui-assets/${encodeURIComponent(uiAssetId)}`, undefined, context);
    return { asset: normalizeUiAsset(payload, "UI asset") };
  },

  async delete_ui_asset(input, context) {
    const uiAssetId = requiredString(input.uiAssetId, "uiAssetId", invalidInputError);
    const record = requireResponseRecord(
      await pixellabRequestJson("DELETE", `/ui-assets/${encodeURIComponent(uiAssetId)}`, undefined, context),
      "delete UI asset",
    );
    return compactObject({
      success: record.success === true,
      usage: normalizeUsage(record.usage),
    });
  },
};

function normalizeUiAsset(value: unknown, fieldName: string): Record<string, unknown> {
  const record = requiredRecord(value, fieldName, invalidResponseError);
  return compactObject({
    id: requiredString(record.id, `${fieldName}.id`, invalidResponseError),
    name: optionalString(record.name),
    prompt: requiredString(record.prompt, `${fieldName}.prompt`, invalidResponseError),
    size: normalizeSize(record.size, `${fieldName}.size`),
    imageUrl: optionalString(record.image_url),
    status: optionalString(record.status),
    createdAt: requiredString(record.created_at, `${fieldName}.created_at`, invalidResponseError),
    progressPercent: optionalInteger(record.progress_percent),
    etaSeconds: optionalInteger(record.eta_seconds),
  });
}

function normalizeSize(value: unknown, fieldName: string): Record<string, number> {
  const record = requiredRecord(value, fieldName, invalidResponseError);
  return {
    width: responseInteger(record.width, `${fieldName}.width`),
    height: responseInteger(record.height, `${fieldName}.height`),
  };
}

function paginatedPath(path: string, input: Record<string, unknown>): string {
  const url = new URL(`https://placeholder.invalid${path}`);
  const limit = optionalInteger(input.limit);
  const offset = optionalInteger(input.offset);
  if (limit !== undefined) url.searchParams.set("limit", String(limit));
  if (offset !== undefined) url.searchParams.set("offset", String(offset));
  return `${url.pathname}${url.search}`;
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
