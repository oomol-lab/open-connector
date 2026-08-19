import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import {
  createProviderTimeout,
  defineProviderExecutors,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "braze";
const brazeRequestTimeoutMs = 30_000;
const brazeCredentialHelpUrl = "https://www.braze.com/docs/api/basics";

type BrazeRequestPhase = "validate" | "execute";

interface BrazeActionContext {
  apiKey: string;
  restEndpoint: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface BrazeValidationCandidate {
  path: "/campaigns/list" | "/canvas/list";
  permission: "campaigns.list" | "canvas.list";
  resultArrayKey: "campaigns" | "canvases";
  countMetadataKey: "campaignCount" | "canvasCount";
}

const brazeValidationCandidates: BrazeValidationCandidate[] = [
  {
    path: "/campaigns/list",
    permission: "campaigns.list",
    resultArrayKey: "campaigns",
    countMetadataKey: "campaignCount",
  },
  {
    path: "/canvas/list",
    permission: "canvas.list",
    resultArrayKey: "canvases",
    countMetadataKey: "canvasCount",
  },
];

type BrazeActionHandler = ProviderRuntimeHandler<BrazeActionContext>;

export const brazeActionHandlers: ProviderActionHandlers<"braze", BrazeActionHandler> = {
  async list_campaigns(input, context) {
    const payload = await requestBrazeJson({
      context,
      path: "/campaigns/list",
      query: buildListQuery(input),
      phase: "execute",
    });
    return normalizeCampaignList(payload);
  },
  async get_campaign_details(input, context) {
    const campaignId = requireInputString(input.campaignId, "campaignId");
    const payload = await requestBrazeJson({
      context,
      path: "/campaigns/details",
      query: buildDetailsQuery({
        idName: "campaign_id",
        idValue: campaignId,
        input,
      }),
      phase: "execute",
    });
    return normalizeCampaignDetails(payload, campaignId);
  },
  async list_canvases(input, context) {
    const payload = await requestBrazeJson({
      context,
      path: "/canvas/list",
      query: buildListQuery(input),
      phase: "execute",
    });
    return normalizeCanvasList(payload);
  },
  async get_canvas_details(input, context) {
    const canvasId = requireInputString(input.canvasId, "canvasId");
    const payload = await requestBrazeJson({
      context,
      path: "/canvas/details",
      query: buildDetailsQuery({
        idName: "canvas_id",
        idValue: canvasId,
        input,
      }),
      phase: "execute",
    });
    return normalizeCanvasDetails(payload, canvasId);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<BrazeActionContext>({
  service,
  handlers: brazeActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<BrazeActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    const restEndpoint = normalizeBrazeRestEndpoint(
      optionalString(credential.values.restEndpoint) ?? optionalString(credential.metadata.restEndpoint),
    );
    return {
      apiKey: credential.apiKey,
      restEndpoint,
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const restEndpoint = normalizeBrazeRestEndpoint(input.values.restEndpoint);
    const validation = await validateBrazeCredential({
      restEndpoint,
      apiKey: input.apiKey,
      fetcher,
      signal,
    });
    const endpointHost = new URL(restEndpoint).hostname;
    const countMetadata =
      validation.itemCount === undefined ? {} : { [validation.countMetadataKey]: validation.itemCount };

    return {
      profile: {
        accountId: `braze:${endpointHost}`,
        displayName: `Braze ${endpointHost}`,
      },
      grantedScopes: [],
      metadata: compactObject({
        restEndpoint,
        validationEndpoint: validation.path,
        validationPermission: validation.permission,
        ...countMetadata,
        credentialHelpUrl: brazeCredentialHelpUrl,
      }),
    };
  },
};

async function validateBrazeCredential(input: {
  restEndpoint: string;
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}): Promise<{
  path: BrazeValidationCandidate["path"];
  permission: BrazeValidationCandidate["permission"];
  countMetadataKey: BrazeValidationCandidate["countMetadataKey"];
  itemCount?: number;
}> {
  const permissionErrors: string[] = [];

  for (const candidate of brazeValidationCandidates) {
    try {
      const payload = await requestBrazeJson({
        context: input,
        path: candidate.path,
        query: [["page", 0]],
        phase: "validate",
      });
      return {
        path: candidate.path,
        permission: candidate.permission,
        countMetadataKey: candidate.countMetadataKey,
        itemCount: readValidationItemCount(payload, candidate.resultArrayKey),
      };
    } catch (error) {
      if (error instanceof ProviderRequestError && error.status === 403) {
        permissionErrors.push(`${candidate.permission}: ${error.message}`);
        continue;
      }
      throw error;
    }
  }

  throw new ProviderRequestError(
    400,
    `Braze REST API key must include at least one supported list permission for connection validation: ${permissionErrors.join("; ")}`,
  );
}

async function requestBrazeJson(input: {
  context: Pick<BrazeActionContext, "apiKey" | "restEndpoint" | "fetcher" | "signal">;
  path: string;
  query?: Array<[string, unknown]>;
  phase: BrazeRequestPhase;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal, brazeRequestTimeoutMs);
  let response: Response;
  let payload: unknown;

  try {
    response = await input.context.fetcher(buildBrazeUrl(input.context.restEndpoint, input.path, input.query), {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    payload = await readBrazePayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Braze request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Braze request failed: ${error.message}` : "Unknown Braze transport error",
    );
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    throw createBrazeError(response.status, payload, input.phase);
  }

  return payload;
}

function buildBrazeUrl(restEndpoint: string, path: string, query: Array<[string, unknown]> = []): string {
  const url = new URL(path, restEndpoint);
  for (const [name, value] of query) {
    appendQueryValue(url, name, value);
  }
  return url.toString();
}

function appendQueryValue(url: URL, name: string, value: unknown): void {
  if (value === undefined || value === null || value === "") {
    return;
  }
  if (typeof value === "boolean") {
    url.searchParams.set(name, value ? "true" : "false");
    return;
  }
  url.searchParams.set(name, String(value));
}

function buildListQuery(input: Record<string, unknown>): Array<[string, unknown]> {
  return [
    ["page", optionalInteger(input.page)],
    ["include_archived", optionalBoolean(input.includeArchived)],
    ["sort_direction", optionalString(input.sortDirection)],
    ["last_edit.time[gt]", optionalString(input.lastEditedAfter)],
  ];
}

function buildDetailsQuery(input: {
  idName: "campaign_id" | "canvas_id";
  idValue: string;
  input: Record<string, unknown>;
}): Array<[string, unknown]> {
  return [
    [input.idName, input.idValue],
    ["post_launch_draft_version", optionalBoolean(input.input.postLaunchDraftVersion)],
    ["include_has_translatable_content", optionalBoolean(input.input.includeHasTranslatableContent)],
  ];
}

async function readBrazePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "Braze returned invalid JSON");
    }
    return { message: text };
  }
}

function createBrazeError(status: number, payload: unknown, phase: BrazeRequestPhase): ProviderRequestError {
  const message = readBrazeErrorMessage(payload) ?? `Braze request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 401) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (status === 400 || status === 403 || status === 404 || status === 415) {
    return new ProviderRequestError(status, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message, payload);
}

function normalizeCampaignList(payload: unknown): Record<string, unknown> {
  const record = requireOutputRecord(payload, "Braze campaign list response");
  return compactObject({
    message: optionalString(record.message),
    campaigns: requireObjectArray(record.campaigns, "campaigns").map(normalizeCampaignListItem),
    raw: record,
  });
}

function normalizeCampaignListItem(value: unknown): Record<string, unknown> {
  const record = requireOutputRecord(value, "campaign item");
  return compactObject({
    id: requireOutputString(record.id, "campaign.id"),
    name: optionalString(record.name),
    lastEdited: optionalString(record.last_edited),
    isApiCampaign: optionalBoolean(record.is_api_campaign),
    tags: readOptionalStringArray(record.tags, "campaign.tags"),
    raw: record,
  });
}

function normalizeCanvasList(payload: unknown): Record<string, unknown> {
  const record = requireOutputRecord(payload, "Braze Canvas list response");
  return compactObject({
    message: optionalString(record.message),
    canvases: requireObjectArray(record.canvases, "canvases").map(normalizeCanvasListItem),
    raw: record,
  });
}

function normalizeCanvasListItem(value: unknown): Record<string, unknown> {
  const record = requireOutputRecord(value, "Canvas item");
  return compactObject({
    id: requireOutputString(record.id, "canvas.id"),
    name: optionalString(record.name),
    lastEdited: optionalString(record.last_edited),
    tags: readOptionalStringArray(record.tags, "canvas.tags"),
    raw: record,
  });
}

function normalizeCampaignDetails(payload: unknown, campaignId: string): Record<string, unknown> {
  const record = requireOutputRecord(payload, "Braze campaign details response");
  const campaign = compactObject({
    id: campaignId,
    name: optionalString(record.name),
    description: readNullableString(record.description),
    createdAt: optionalString(record.created_at),
    updatedAt: optionalString(record.updated_at),
    archived: optionalBoolean(record.archived),
    draft: optionalBoolean(record.draft),
    enabled: optionalBoolean(record.enabled),
    hasPostLaunchDraft: optionalBoolean(record.has_post_launch_draft),
    scheduleType: optionalString(record.schedule_type),
    channels: readOptionalStringArray(record.channels, "campaign.channels"),
    firstSent: readNullableString(record.first_sent),
    lastSent: readNullableString(record.last_sent),
    tags: readOptionalStringArray(record.tags, "campaign.tags"),
    teams: readOptionalStringArray(record.teams, "campaign.teams"),
    messages: readOptionalObject(record.messages, "campaign.messages"),
    conversionBehaviors: readOptionalObjectArray(record.conversion_behaviors, "campaign.conversion_behaviors"),
    raw: record,
  });
  return compactObject({
    message: optionalString(record.message),
    campaign,
    raw: record,
  });
}

function normalizeCanvasDetails(payload: unknown, canvasId: string): Record<string, unknown> {
  const record = requireOutputRecord(payload, "Braze Canvas details response");
  const canvas = compactObject({
    id: canvasId,
    name: optionalString(record.name),
    description: readNullableString(record.description),
    createdAt: optionalString(record.created_at),
    updatedAt: optionalString(record.updated_at),
    archived: optionalBoolean(record.archived),
    draft: optionalBoolean(record.draft),
    enabled: optionalBoolean(record.enabled),
    hasPostLaunchDraft: optionalBoolean(record.has_post_launch_draft),
    scheduleType: optionalString(record.schedule_type),
    firstEntry: readNullableString(record.first_entry),
    lastEntry: readNullableString(record.last_entry),
    channels: readOptionalStringArray(record.channels, "canvas.channels"),
    variants: readOptionalObjectArray(record.variants, "canvas.variants"),
    tags: readOptionalStringArray(record.tags, "canvas.tags"),
    teams: readOptionalStringArray(record.teams, "canvas.teams"),
    steps: readOptionalObjectArray(record.steps, "canvas.steps"),
    raw: record,
  });
  return compactObject({
    message: optionalString(record.message),
    canvas,
    raw: record,
  });
}

function normalizeBrazeRestEndpoint(value: unknown): string {
  const raw = optionalString(value);
  if (!raw) {
    throw new ProviderRequestError(400, "restEndpoint is required");
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ProviderRequestError(400, "restEndpoint must be a valid HTTPS URL");
  }

  if (url.protocol !== "https:") {
    throw new ProviderRequestError(400, "restEndpoint must be an HTTPS URL");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new ProviderRequestError(400, "restEndpoint must be a clean HTTPS origin");
  }

  let pathname = url.pathname;
  while (pathname.endsWith("/") && pathname.length > 1) {
    pathname = pathname.slice(0, -1);
  }
  if (pathname !== "/" && pathname !== "") {
    throw new ProviderRequestError(400, "restEndpoint must be a clean HTTPS origin");
  }

  return assertPublicHttpUrl(url.origin, {
    fieldName: "restEndpoint",
    createError: (message) => new ProviderRequestError(400, message),
  }).origin;
}

function readValidationItemCount(payload: unknown, resultArrayKey: "campaigns" | "canvases"): number | undefined {
  const record = requireOutputRecord(payload, "Braze validation response");
  const entries = record[resultArrayKey];
  return Array.isArray(entries) ? entries.length : undefined;
}

function requireObjectArray(value: unknown, fieldName: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${fieldName} must be an array`);
  }
  return value.map((entry, index) => requireOutputRecord(entry, `${fieldName}[${index}]`));
}

function readOptionalObject(value: unknown, fieldName: string): Record<string, unknown> | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return requireOutputRecord(value, fieldName);
}

function readOptionalObjectArray(value: unknown, fieldName: string): Array<Record<string, unknown>> | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return requireObjectArray(value, fieldName);
}

function readOptionalStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${fieldName} must be an array`);
  }
  return value.map((entry, index) => {
    if (typeof entry !== "string") {
      throw new ProviderRequestError(502, `${fieldName}[${index}] must be a string`);
    }
    return entry;
  });
}

function readNullableString(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  return optionalString(value);
}

function readBrazeErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.message) ?? optionalString(record?.error) ?? readOptionalErrorArrayMessage(record?.errors);
  return message;
}

function readOptionalErrorArrayMessage(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const messages = value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
  return messages.length > 0 ? messages.join("; ") : undefined;
}

function requireInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function requireOutputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(502, message));
}

function requireOutputRecord(value: unknown, fieldName: string): Record<string, unknown> {
  return requiredRecord(value, fieldName, (message) => new ProviderRequestError(502, message));
}
