import type { QueryValue } from "../../core/request.ts";
import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-executors.ts";

import {
  compactObject,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredArray,
  requiredString,
} from "../../core/cast.ts";
import { encodePathSegment, queryParams } from "../../core/request.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  parseProviderJsonBodyText,
  providerResponseError,
  providerUserAgent,
  ProviderRequestError,
  readProviderErrorTextBody,
  readProviderJsonBody,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

const service = "publora";
const apiBaseUrl = "https://api.publora.com/api/v1";

type Handler = ProviderRuntimeHandler<ApiKeyProviderContext>;
type PubloraRequestPhase = "validate" | "execute";

interface PubloraRequest {
  method?: "DELETE" | "GET" | "POST" | "PUT";
  path: string;
  query?: Record<string, QueryValue>;
  body?: Record<string, unknown>;
  idempotencyKey?: string;
  phase?: PubloraRequestPhase;
}

const publoraActionHandlers: ProviderActionHandlers<"publora", Handler> = {
  async list_connections(_input, context) {
    const payload = await publoraRequest({ path: "/platform-connections" }, context);
    return { connections: requiredArray(payload.connections, "Publora connections", providerResponseError) };
  },
  async get_account_context(input, context) {
    const payload = await publoraRequest(
      { path: "/account-context", query: { scheduledTime: optionalString(input.scheduledTime) } },
      context,
    );
    return { context: requiredResponseRecord(payload.context, "Publora get_account_context") };
  },
  async create_post(input, context) {
    const payload = await publoraRequest(
      {
        method: "POST",
        path: "/create-post",
        body: postBody(input),
        idempotencyKey: optionalString(input.idempotencyKey),
      },
      context,
    );
    return {
      postGroupId: requiredString(payload.postGroupId, "Publora postGroupId", providerResponseError),
      scheduledTime: payload.scheduledTime,
      warnings: payload.warnings,
    };
  },
  async get_post(input, context) {
    const { success: _success, ...post } = await publoraRequest({ path: postPath("get-post", input) }, context);
    return { post };
  },
  async list_posts(input, context) {
    const payload = await publoraRequest(
      {
        path: "/list-posts",
        query: {
          page: optionalInteger(input.page),
          limit: optionalInteger(input.limit),
          status: optionalString(input.status),
          platform: optionalString(input.platform),
          sortBy: optionalString(input.sortBy),
          sortOrder: optionalString(input.sortOrder),
          fromDate: optionalString(input.fromDate),
          toDate: optionalString(input.toDate),
        },
      },
      context,
    );
    return {
      posts: requiredArray(payload.posts, "Publora posts", providerResponseError),
      pagination: optionalRecord(payload.pagination) ?? {},
    };
  },
  async update_post(input, context) {
    const body = compactObject({ ...postBody(input), status: input.status });
    if (Object.keys(body).length === 0) {
      throw new ProviderRequestError(400, "update_post requires at least one field to update");
    }
    const payload = await publoraRequest(
      {
        method: "PUT",
        path: postPath("update-post", input),
        body,
        idempotencyKey: optionalString(input.idempotencyKey),
      },
      context,
    );
    return {
      message: payload.message,
      scheduledTime: payload.scheduledTime,
      warnings: payload.warnings,
      postGroup: payload.postGroup,
    };
  },
  async delete_post(input, context) {
    await publoraRequest({ method: "DELETE", path: postPath("delete-post", input) }, context);
    return { postGroupId: requiredInputString(input.postGroupId, "postGroupId"), deleted: true };
  },
  async get_post_logs(input, context) {
    const payload = await publoraRequest({ path: postPath("post-logs", input) }, context);
    return { logs: requiredArray(payload.logs, "Publora logs", providerResponseError) };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, publoraActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: apiBaseUrl,
  readError: (response) => readPubloraResponseError(response, "execute"),
  auth: { type: "api_key_header", name: "x-publora-key" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await publoraRequest(
      { path: "/account-context", phase: "validate" },
      { apiKey: input.apiKey, fetcher, signal },
    );
    const accountContext = optionalRecord(payload.context);
    const plan = optionalRecord(accountContext?.plan);
    return {
      profile: { accountId: optionalString(accountContext?.actorUserId), displayName: "Publora" },
      metadata: { apiBaseUrl, plan: optionalString(plan?.key) },
    };
  },
};

/** The fields create_post and update_post share, under the names the Publora API uses. */
function postBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    content: input.content,
    platforms: input.platforms,
    scheduledTime: input.scheduledTime,
    publishNow: input.publishNow,
    platformSettings: input.platformSettings,
    firstComments: input.firstComments,
    mediaUrls: input.mediaUrls,
  });
}

function postPath(route: string, input: Record<string, unknown>): string {
  return `/${route}/${encodePathSegment(requiredInputString(input.postGroupId, "postGroupId"))}`;
}

/** Send one request with the key in `x-publora-key` and return the JSON object Publora answers with. */
async function publoraRequest(
  request: PubloraRequest,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  return runProviderRequest({ label: "Publora", signal: context.signal }, async (signal) => {
    const url = new URL(`${apiBaseUrl}${request.path}`);
    for (const [key, value] of Object.entries(queryParams(request.query ?? {}))) url.searchParams.set(key, value);
    const headers: Record<string, string> = {
      "accept": "application/json",
      "x-publora-key": context.apiKey,
      "user-agent": providerUserAgent,
    };
    if (request.body) headers["content-type"] = "application/json";
    if (request.idempotencyKey) headers["idempotency-key"] = request.idempotencyKey;
    const response = await context.fetcher(url.toString(), {
      method: request.method ?? "GET",
      headers,
      body: request.body ? JSON.stringify(request.body) : undefined,
      signal,
    });
    if (!response.ok) {
      throw await readPubloraResponseError(response, request.phase ?? "execute", signal);
    }
    const payload = await readProviderJsonBody(response, {
      emptyBody: null,
      invalidJsonMessage: "Publora returned invalid JSON",
    });
    const object = optionalRecord(payload);
    if (!object) {
      throw providerResponseError("Publora returned an answer that is not a JSON object");
    }
    return object;
  });
}

async function readPubloraResponseError(
  response: Response,
  phase: PubloraRequestPhase,
  signal?: AbortSignal,
): Promise<ProviderRequestError> {
  const text = await readProviderErrorTextBody(response, "Publora error response", signal);
  const payload = parseProviderJsonBodyText(text, {
    emptyBody: null,
    invalidJsonMessage: "Publora returned invalid JSON",
    invalidJsonFallback: (text) => text.slice(0, 500),
  });
  return publoraRequestError(response.status, payload, phase);
}

/**
 * Turn a Publora error answer, `{ error, code }`, into the execution error the runtime can express.
 *
 * A 401 is a rejected key. A 403 is a plan limit or a feature the plan lacks (for example
 * POST_LIMIT_REACHED), which reconnecting would not fix, so it is reported as invalid input.
 */
function publoraRequestError(status: number, payload: unknown, phase: PubloraRequestPhase): ProviderRequestError {
  const body = optionalRecord(payload);
  const code = optionalString(body?.code);
  const error = optionalString(body?.error) ?? `Publora request failed with HTTP ${status}`;
  const message = code ? `${error} (${code})` : error;
  if (status >= 500) {
    return new ProviderRequestError(502, message, payload);
  }
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 403) {
    return new ProviderRequestError(403, message, payload, "invalid_input");
  }
  return new ProviderRequestError(status, message, payload);
}
