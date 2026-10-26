import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-executors.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { assertPublicHttpUrl, encodePathSegment } from "../../core/request.ts";
import {
  providerInputError,
  ProviderRequestError,
  providerResponseError,
  providerUserAgent,
  readProviderErrorTextBody,
  readProviderJsonBody,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
  setSearchParams,
} from "../provider-runtime.ts";

const service = "microsoft_teams_bot";
const tokenRefreshSkewMs = 60_000;
const defaultTextFormat = "markdown";

/**
 * Hosts that may receive the bot's access token, matched as an exact host or a
 * subdomain. They are the Bot Connector hosts Microsoft documents for Teams:
 * the public service (smba.trafficmanager.net), GCC (smba.infra.gcc.teams.microsoft.com),
 * and GCC High / DoD (smba.infra.{gov,dod}.teams.microsoft.us). Anything else is
 * refused so a token cannot be sent to a caller-supplied host.
 */
const allowedServiceHostSuffixes = ["smba.trafficmanager.net", "teams.microsoft.com", "teams.microsoft.us"];

interface TeamsBotCloud {
  loginEndpoint: string;
  scope: string;
}

const publicCloud: TeamsBotCloud = {
  loginEndpoint: "https://login.microsoftonline.com",
  scope: "https://api.botframework.com/.default",
};

// GCC High and DoD share the sovereign login endpoint and Bot Framework scope.
const governmentCloud: TeamsBotCloud = {
  loginEndpoint: "https://login.microsoftonline.us",
  scope: "https://api.botframework.us/.default",
};

const governmentHostSuffix = "teams.microsoft.us";

type TeamsBotRequestPhase = "validate" | "execute";

interface TeamsBotCredential {
  appId: string;
  clientSecret: string;
  tenantId: string;
  serviceUrl?: string;
}

export interface TeamsBotContext extends TeamsBotCredential {
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

interface TeamsBotTokenCacheEntry {
  token: string;
  expiresAtMs: number;
}

interface TeamsBotConnectorRequest {
  context: TeamsBotContext;
  method: "GET" | "POST" | "PUT" | "DELETE";
  serviceUrl: string;
  path: string;
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
}

type TeamsBotActionHandler = ProviderRuntimeHandler<TeamsBotContext>;

const tokenCache = new Map<string, TeamsBotTokenCacheEntry>();

export const microsoftTeamsBotActionHandlers: ProviderActionHandlers<typeof service, TeamsBotActionHandler> = {
  async send_message(input, context) {
    const serviceUrl = resolveServiceUrl(input.serviceUrl, context);
    return readResourceResponse(
      await requestConnector({
        context,
        method: "POST",
        serviceUrl,
        path: `${conversationPath(input)}/activities`,
        body: messageActivity(input),
      }),
    );
  },
  async reply_to_message(input, context) {
    const serviceUrl = resolveServiceUrl(input.serviceUrl, context);
    return readResourceResponse(
      await requestConnector({
        context,
        method: "POST",
        serviceUrl,
        path: activityPath(input),
        body: { ...messageActivity(input), replyToId: requiredInputString(input.activityId, "activityId") },
      }),
    );
  },
  async update_message(input, context) {
    const serviceUrl = resolveServiceUrl(input.serviceUrl, context);
    return readResourceResponse(
      await requestConnector({
        context,
        method: "PUT",
        serviceUrl,
        path: activityPath(input),
        body: { ...messageActivity(input), id: requiredInputString(input.activityId, "activityId") },
      }),
    );
  },
  async delete_message(input, context) {
    const serviceUrl = resolveServiceUrl(input.serviceUrl, context);
    await requestConnector({ context, method: "DELETE", serviceUrl, path: activityPath(input) });
    return { deleted: true };
  },
  async create_conversation(input, context) {
    const serviceUrl = resolveServiceUrl(input.serviceUrl, context);
    const memberId = optionalString(input.memberId);
    const teamId = optionalString(input.teamId);
    if ((memberId === undefined) === (teamId === undefined)) {
      throw providerInputError("Provide exactly one of memberId or teamId.");
    }
    const tenantId = optionalString(input.tenantId) ?? context.tenantId;
    const response = await requestConnector({
      context,
      method: "POST",
      serviceUrl,
      path: "/v3/conversations",
      body: createConversationBody(context, { memberId, teamId, tenantId, input }),
    });
    const record = requiredResponseRecord(response, "create_conversation response");
    return compactObject({
      ...record,
      id: requireString(record.id, "conversation id"),
      activityId: optionalString(record.activityId),
      serviceUrl: optionalString(record.serviceUrl),
    });
  },
  async list_conversation_members(input, context) {
    const serviceUrl = resolveServiceUrl(input.serviceUrl, context);
    const response = requiredResponseRecord(
      await requestConnector({
        context,
        method: "GET",
        serviceUrl,
        path: `${conversationPath(input)}/pagedMembers`,
        query: {
          pageSize: optionalInteger(input.pageSize)?.toString(),
          continuationToken: optionalString(input.continuationToken),
        },
      }),
      "members response",
    );
    if (!Array.isArray(response.members)) {
      throw providerResponseError("Microsoft Teams Bot members response did not include a member list.");
    }
    return compactObject({ members: response.members, continuationToken: optionalString(response.continuationToken) });
  },
};

/**
 * Read the credential field map into a typed credential, rejecting a default
 * service URL outside the Bot Connector allow-list.
 */
export function readTeamsBotCredential(values: Record<string, string>): TeamsBotCredential {
  const serviceUrl = optionalString(values.serviceUrl);
  return {
    appId: requiredInputString(values.appId, "appId"),
    clientSecret: requiredInputString(values.clientSecret, "clientSecret"),
    tenantId: requiredInputString(values.tenantId, "tenantId"),
    serviceUrl: serviceUrl === undefined ? undefined : normalizeServiceUrl(serviceUrl),
  };
}

/**
 * Validate a caller-supplied service URL against the Bot Connector host
 * allow-list and return it without query, fragment, or trailing slash.
 */
export function normalizeServiceUrl(value: string): string {
  const url = assertPublicHttpUrl(value, { fieldName: "serviceUrl", createError: providerInputError });
  if (url.protocol !== "https:" || url.username || url.password) {
    throw providerInputError("serviceUrl must be an https URL without credentials.");
  }
  const host = url.hostname.toLowerCase();
  if (!allowedServiceHostSuffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) {
    throw providerInputError("serviceUrl must be a Microsoft Teams Bot Connector host.");
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

/**
 * Mint one connector token to prove the app registration credentials work.
 */
export async function validateTeamsBotCredential(
  values: Record<string, string>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const credential = readTeamsBotCredential(values);
  await fetchConnectorToken({ ...credential, fetcher, signal }, cloudForServiceUrl(credential.serviceUrl), "validate");
  return {
    profile: {
      accountId: credential.appId,
      displayName: `Microsoft Teams Bot ${credential.appId}`,
    },
    grantedScopes: [],
    metadata: compactObject({ tenantId: credential.tenantId, serviceUrl: credential.serviceUrl }),
  };
}

interface CreateConversationTarget {
  memberId?: string;
  teamId?: string;
  tenantId: string;
  input: Record<string, unknown>;
}

// Teams reads the tenant from channelData.tenant.id in the documented examples and
// from the top-level tenantId in the REST schema, so both carry it. A team target
// is a new thread in the team's general channel and needs its first message.
function createConversationBody(context: TeamsBotContext, target: CreateConversationTarget): Record<string, unknown> {
  const bot = { id: `28:${context.appId}` };
  const tenant = { id: target.tenantId };
  if (target.memberId !== undefined) {
    return {
      isGroup: false,
      bot,
      members: [{ id: target.memberId }],
      tenantId: target.tenantId,
      channelData: { tenant },
      activity: optionalString(target.input.text) === undefined ? undefined : messageActivity(target.input),
    };
  }
  return {
    isGroup: true,
    bot,
    tenantId: target.tenantId,
    channelData: {
      teamsChannelId: target.teamId,
      teamsTeamId: target.teamId,
      channel: { id: target.teamId },
      team: { id: target.teamId },
      tenant,
    },
    activity: messageActivity(target.input),
  };
}

function cloudForServiceUrl(serviceUrl: string | undefined): TeamsBotCloud {
  const host = serviceUrl === undefined ? "" : new URL(serviceUrl).hostname.toLowerCase();
  return host === governmentHostSuffix || host.endsWith(`.${governmentHostSuffix}`) ? governmentCloud : publicCloud;
}

function resolveServiceUrl(value: unknown, context: TeamsBotContext): string {
  const requested = optionalString(value);
  if (requested !== undefined) {
    return normalizeServiceUrl(requested);
  }
  if (context.serviceUrl === undefined) {
    throw providerInputError("serviceUrl is required when the credential has no default service URL.");
  }
  return context.serviceUrl;
}

function conversationPath(input: Record<string, unknown>): string {
  const conversationId = requiredInputString(input.conversationId, "conversationId");
  const threadId = optionalString(input.threadId);
  if (threadId === undefined) {
    return `/v3/conversations/${encodePathSegment(conversationId)}`;
  }
  // Teams routes a channel-thread message by the root message id appended to the
  // conversation id; any existing suffix is replaced.
  if (!/^[1-9]\d*$/.test(threadId)) {
    throw providerInputError("threadId must be the numeric ID of the thread's root message.");
  }
  const baseId = conversationId.split(";")[0] ?? conversationId;
  return `/v3/conversations/${encodePathSegment(`${baseId};messageid=${threadId}`)}`;
}

function activityPath(input: Record<string, unknown>): string {
  return `${conversationPath(input)}/activities/${encodePathSegment(requiredInputString(input.activityId, "activityId"))}`;
}

function messageActivity(input: Record<string, unknown>): Record<string, unknown> {
  return {
    type: "message",
    text: requiredInputString(input.text, "text"),
    textFormat: optionalString(input.textFormat) ?? defaultTextFormat,
  };
}

function readResourceResponse(response: unknown): Record<string, unknown> {
  const record = optionalRecord(response) ?? {};
  return compactObject({ ...record, id: optionalString(record.id) });
}

async function fetchConnectorToken(
  context: TeamsBotContext,
  cloud: TeamsBotCloud,
  phase: TeamsBotRequestPhase,
): Promise<string> {
  const cacheKey = [cloud.loginEndpoint, context.tenantId, context.appId, context.clientSecret].join("\u0000");
  // Validation must reach Microsoft so a revoked secret is not accepted from a cached token.
  const cached = phase === "validate" ? undefined : tokenCache.get(cacheKey);
  if (cached && cached.expiresAtMs > Date.now()) {
    return cached.token;
  }

  const payload = await runProviderRequest(
    { signal: context.signal, label: "Microsoft Teams Bot token" },
    async (signal) => {
      const response = await context.fetcher(
        `${cloud.loginEndpoint}/${encodePathSegment(context.tenantId)}/oauth2/v2.0/token`,
        {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/x-www-form-urlencoded",
            "user-agent": providerUserAgent,
          },
          body: new URLSearchParams({
            grant_type: "client_credentials",
            client_id: context.appId,
            client_secret: context.clientSecret,
            scope: cloud.scope,
          }),
          signal,
        },
      );
      if (!response.ok) {
        throw await createTokenError(response, phase, signal);
      }
      return readProviderJsonBody(response, {
        emptyBody: {},
        invalidJsonMessage: "Microsoft Teams Bot token response was not JSON",
      });
    },
  );

  const record = requiredResponseRecord(payload, "token response");
  const token = optionalString(record.access_token);
  if (token === undefined) {
    throw providerResponseError("Microsoft Teams Bot token response did not include an access token.");
  }
  const expiresInSeconds = Number(record.expires_in);
  if (Number.isFinite(expiresInSeconds) && expiresInSeconds > 0) {
    const nowMs = Date.now();
    tokenCache.set(cacheKey, {
      token,
      expiresAtMs: Math.max(nowMs, nowMs + expiresInSeconds * 1000 - tokenRefreshSkewMs),
    });
  }
  return token;
}

async function createTokenError(
  response: Response,
  phase: TeamsBotRequestPhase,
  signal: AbortSignal,
): Promise<ProviderRequestError> {
  const text = await readProviderErrorTextBody(response, "token error response", signal);
  const message = readErrorMessage(text);
  let invalidSecret = false;
  try {
    invalidSecret = optionalRecord(JSON.parse(text))?.error === "invalid_client";
  } catch {}
  return new ProviderRequestError(
    invalidSecret ? (phase === "validate" ? 400 : 401) : response.status,
    message ?? `Microsoft token request failed with HTTP ${response.status}`,
    undefined,
    invalidSecret
      ? phase === "validate"
        ? "invalid_input"
        : "authorization_failed"
      : response.status === 429
        ? "rate_limited"
        : "provider_error",
  );
}

async function requestConnector(input: TeamsBotConnectorRequest): Promise<unknown> {
  const token = await fetchConnectorToken(input.context, cloudForServiceUrl(input.serviceUrl), "execute");
  return runProviderRequest({ signal: input.context.signal, label: "Microsoft Teams Bot" }, async (signal) => {
    const headers = new Headers({
      accept: "application/json",
      authorization: `Bearer ${token}`,
      "user-agent": providerUserAgent,
    });
    if (input.body !== undefined) {
      headers.set("content-type", "application/json");
    }
    const url = new URL(`${input.serviceUrl}${input.path}`);
    setSearchParams(url, input.query ?? {});
    const response = await input.context.fetcher(url, {
      method: input.method,
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal,
    });
    if (!response.ok) {
      const message = readErrorMessage(await readProviderErrorTextBody(response, "connector error response", signal));
      throw new ProviderRequestError(
        response.status,
        message ?? `Microsoft Teams Bot request failed with HTTP ${response.status}`,
        undefined,
        response.status === 429 ? "rate_limited" : "provider_error",
      );
    }
    return readProviderJsonBody(response, {
      emptyBody: {},
      invalidJsonMessage: "Microsoft Teams Bot response was not JSON",
    });
  });
}

/**
 * Pull a readable message out of a Bot Connector (`error.message`) or
 * Microsoft Entra (`error_description`) error body, falling back to the text.
 */
function readErrorMessage(text: string): string | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return undefined;
  try {
    const record = optionalRecord(JSON.parse(trimmed));
    const message = optionalString(optionalRecord(record?.error)?.message) ?? optionalString(record?.error_description);
    // Entra descriptions carry trace and correlation IDs on later lines.
    return message?.split("\r\n")[0]?.split("\n")[0] ?? trimmed.slice(0, 500);
  } catch {
    return trimmed.slice(0, 500);
  }
}

function requireString(value: unknown, label: string): string {
  const text = optionalString(value);
  if (text === undefined) {
    throw providerResponseError(`Microsoft Teams Bot response did not include ${label}.`);
  }
  return text;
}
