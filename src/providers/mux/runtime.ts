import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import {
  compactObject,
  objectArray,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import { ProviderRequestError, providerUserAgent, readProviderJsonBody } from "../provider-runtime.ts";

const muxApiOrigin = "https://api.mux.com";
const muxWhoAmIPath = "/system/v1/whoami";

export interface MuxContext {
  tokenId: string;
  tokenSecret: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

type MuxActionHandler = (input: Record<string, unknown>, context: MuxContext) => Promise<unknown>;

export const muxActionHandlers: Record<string, MuxActionHandler> = {
  create_asset: createAsset,
  list_assets: listAssets,
  get_asset: getAsset,
  delete_asset: deleteAsset,
  create_playback_id: createPlaybackId,
};

export async function validateMuxCredential(context: MuxContext): Promise<CredentialValidationResult> {
  const payload = await requestMuxJson({ path: muxWhoAmIPath, context, phase: "validate" });
  const profile = muxDataRecord(payload, "Mux access token response");
  const environmentId = optionalString(profile.environment_id);
  const environmentName = optionalString(profile.environment_name);
  const organizationName = optionalString(profile.organization_name);
  const permissions = Array.isArray(profile.permissions)
    ? profile.permissions.filter((permission): permission is string => typeof permission === "string")
    : [];

  return {
    profile: {
      accountId: environmentId ?? context.tokenId,
      displayName: [organizationName, environmentName].filter(Boolean).join(" / ") || "Mux Access Token",
      grantedScopes: permissions,
    },
    grantedScopes: permissions,
    metadata: compactObject({
      organizationId: optionalString(profile.organization_id),
      organizationName,
      environmentId,
      environmentName,
      environmentType: optionalString(profile.environment_type),
      accessTokenName: optionalString(profile.access_token_name),
      validationEndpoint: muxWhoAmIPath,
    }),
  };
}

async function createAsset(input: Record<string, unknown>, context: MuxContext): Promise<unknown> {
  const sourceUrl = assertPublicHttpUrl(requiredInputString(input.sourceUrl, "sourceUrl"), {
    fieldName: "sourceUrl",
    createError: inputError,
  });
  const meta = optionalRecord(input.meta);
  const body = compactObject({
    inputs: [{ url: sourceUrl.toString() }],
    playback_policies: readOptionalStringArray(input.playbackPolicies, "playbackPolicies"),
    video_quality: optionalString(input.videoQuality),
    max_resolution_tier: optionalString(input.maxResolutionTier),
    passthrough: optionalString(input.passthrough),
    test: optionalBoolean(input.test),
    meta: meta
      ? compactObject({
          title: optionalString(meta.title),
          creator_id: optionalString(meta.creatorId),
          external_id: optionalString(meta.externalId),
        })
      : undefined,
  });
  const payload = await requestMuxJson({
    path: "/video/v1/assets",
    method: "POST",
    body,
    context,
    phase: "execute",
  });
  return { asset: muxDataRecord(payload, "Mux create asset response") };
}

async function listAssets(input: Record<string, unknown>, context: MuxContext): Promise<unknown> {
  const query = compactObject({
    limit: stringifyInteger(input.limit),
    page: stringifyInteger(input.page),
    cursor: optionalString(input.cursor),
    live_stream_id: optionalString(input.liveStreamId),
    upload_id: optionalString(input.uploadId),
  });
  if (query.page && query.cursor) {
    throw inputError("page and cursor cannot be used together");
  }

  const payload = await requestMuxJson({ path: "/video/v1/assets", query, context, phase: "execute" });
  const response = requiredRecord(payload, "Mux list assets response", muxResponseError);
  return {
    assets: objectArray(response.data, "Mux asset", muxResponseError),
    nextCursor: optionalString(response.next_cursor) ?? null,
  };
}

async function getAsset(input: Record<string, unknown>, context: MuxContext): Promise<unknown> {
  const assetId = requiredInputString(input.assetId, "assetId");
  const payload = await requestMuxJson({
    path: `/video/v1/assets/${encodeURIComponent(assetId)}`,
    context,
    phase: "execute",
  });
  return { asset: muxDataRecord(payload, "Mux asset response") };
}

async function deleteAsset(input: Record<string, unknown>, context: MuxContext): Promise<unknown> {
  const assetId = requiredInputString(input.assetId, "assetId");
  await requestMuxJson({
    path: `/video/v1/assets/${encodeURIComponent(assetId)}`,
    method: "DELETE",
    context,
    phase: "execute",
  });
  return { deleted: true, assetId };
}

async function createPlaybackId(input: Record<string, unknown>, context: MuxContext): Promise<unknown> {
  const assetId = requiredInputString(input.assetId, "assetId");
  const policy = requiredInputString(input.policy, "policy");
  const drmConfigurationId = optionalString(input.drmConfigurationId);
  if (policy === "drm" && !drmConfigurationId) {
    throw inputError("drmConfigurationId is required when policy is drm");
  }
  if (policy !== "drm" && drmConfigurationId) {
    throw inputError("drmConfigurationId can only be used when policy is drm");
  }

  const payload = await requestMuxJson({
    path: `/video/v1/assets/${encodeURIComponent(assetId)}/playback-ids`,
    method: "POST",
    body: compactObject({ policy, drm_configuration_id: drmConfigurationId }),
    context,
    phase: "execute",
  });
  return { playbackId: muxDataRecord(payload, "Mux create playback ID response") };
}

interface MuxRequestOptions {
  path: string;
  context: MuxContext;
  phase: "validate" | "execute";
  method?: string;
  query?: Record<string, string | undefined>;
  body?: unknown;
}

async function requestMuxJson(options: MuxRequestOptions): Promise<unknown> {
  const url = new URL(options.path, muxApiOrigin);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  let response: Response;
  try {
    response = await options.context.fetcher(url, {
      method: options.method ?? "GET",
      headers: {
        accept: "application/json",
        authorization: createMuxAuthorization(options.context),
        ...(options.body === undefined ? {} : { "content-type": "application/json" }),
        "user-agent": providerUserAgent,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Mux request failed: ${error.message}` : "Mux request failed",
    );
  }

  const payload = await readProviderJsonBody(response, {
    emptyBody: null,
    invalidJsonMessage: "Mux returned invalid JSON",
  });
  if (response.ok) {
    return payload;
  }

  const status =
    options.phase === "validate" && (response.status === 401 || response.status === 403)
      ? 401
      : response.status >= 500
        ? 502
        : response.status;
  throw new ProviderRequestError(status, muxErrorMessage(payload, response.status), payload);
}

function muxDataRecord(payload: unknown, source: string): Record<string, unknown> {
  const envelope = requiredRecord(payload, source, muxResponseError);
  return requiredRecord(envelope.data, `${source} data`, muxResponseError);
}

function muxErrorMessage(payload: unknown, status: number): string {
  const envelope = optionalRecord(payload);
  const error = optionalRecord(envelope?.error);
  const errorMessages = Array.isArray(error?.messages)
    ? error.messages.filter((message): message is string => typeof message === "string" && message.length > 0)
    : [];
  const responseMessages = Array.isArray(envelope?.errors)
    ? envelope.errors.filter((message): message is string => typeof message === "string" && message.length > 0)
    : [];
  return (
    errorMessages.join("; ") ||
    optionalString(error?.type) ||
    responseMessages.join("; ") ||
    `Mux request failed with HTTP ${status}`
  );
}

function muxResponseError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}

function createMuxAuthorization(context: Pick<MuxContext, "tokenId" | "tokenSecret">): string {
  return `Basic ${Buffer.from(`${context.tokenId}:${context.tokenSecret}`, "utf8").toString("base64")}`;
}

function requiredInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, inputError);
}

function inputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function stringifyInteger(value: unknown): string | undefined {
  const integer = optionalInteger(value);
  return integer === undefined ? undefined : String(integer);
}

function readOptionalStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw inputError(`${fieldName} must be an array of strings`);
  }
  return value;
}
