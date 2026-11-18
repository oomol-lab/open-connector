import type { QueryValue } from "../../core/request.ts";
import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-executors.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, recordOrEmpty } from "../../core/cast.ts";
import { encodePathSegment, hasPathTraversalSegment, queryParams } from "../../core/request.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  parseProviderJsonBodyText,
  providerInputError,
  providerResponseError,
  providerUserAgent,
  ProviderRequestError,
  readProviderErrorTextBody,
  readProviderJsonBody,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

const service = "postonce";
const apiBaseUrl = "https://postonce.to/api/public";

type Handler = ProviderRuntimeHandler<ApiKeyProviderContext>;

interface PostonceRequest {
  method?: "GET" | "PATCH" | "POST";
  path: string;
  query?: Record<string, QueryValue>;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
}

/** A successful PostOnce answer: the `data` value and the optional `meta` object around it. */
interface PostonceAnswer {
  data: unknown;
  meta: Record<string, unknown>;
}

const postonceActionHandlers: ProviderActionHandlers<"postonce", Handler> = {
  async list_accounts(_input, context) {
    const { data } = await postonceRequest({ path: "/v1/accounts" }, context);
    return { accounts: listData(data, "list_accounts") };
  },
  async list_posts(input, context) {
    const { data, meta } = await postonceRequest(
      {
        path: "/v1/posts",
        query: { limit: optionalInteger(input.limit), after: optionalString(input.after) },
      },
      context,
    );
    return { posts: listData(data, "list_posts"), meta };
  },
  async create_post(input, context) {
    const idempotencyKey = optionalString(input.idempotency_key);
    const { data } = await postonceRequest(
      {
        method: "POST",
        path: "/v1/posts",
        body: compactObject({
          content: input.content,
          media: input.media,
          publish_at: input.publish_at,
          external_id: input.external_id,
          targets: input.targets,
        }),
        headers: idempotencyKey ? { "idempotency-key": idempotencyKey } : undefined,
      },
      context,
    );
    return { post: requiredResponseRecord(data, "PostOnce create_post") };
  },
  async get_post(input, context) {
    const { data } = await postonceRequest({ path: postPath(input) }, context);
    return { post: requiredResponseRecord(data, "PostOnce get_post") };
  },
  async update_post(input, context) {
    const body = compactObject({
      content: input.content,
      media: input.media,
      publish_at: input.publish_at,
      external_id: input.external_id,
      targets: input.targets,
    });
    if (Object.keys(body).length === 0) {
      throw new ProviderRequestError(400, "update_post requires at least one field to update");
    }
    const { data } = await postonceRequest({ method: "PATCH", path: postPath(input), body }, context);
    return { post: requiredResponseRecord(data, "PostOnce update_post") };
  },
  async cancel_post(input, context) {
    const { data } = await postonceRequest({ method: "POST", path: `${postPath(input)}/cancel` }, context);
    return { post: requiredResponseRecord(data, "PostOnce cancel_post") };
  },
  async retry_post_target(input, context) {
    const targetId = encodePathSegment(requiredInputString(input.target_post_id, "target_post_id"));
    const { data } = await postonceRequest(
      { method: "POST", path: `${postPath(input)}/targets/${targetId}/retry` },
      context,
    );
    return { post: requiredResponseRecord(data, "PostOnce retry_post_target") };
  },
  async get_post_analytics(input, context) {
    const { data } = await postonceRequest({ path: `${postPath(input)}/analytics` }, context);
    return { analytics: requiredResponseRecord(data, "PostOnce get_post_analytics") };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, postonceActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: apiBaseUrl,
  readError: readPostonceResponseError,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const { data } = await postonceRequest({ path: "/v1/accounts" }, { apiKey: input.apiKey, fetcher, signal });
    return {
      profile: { displayName: "PostOnce" },
      metadata: { apiBaseUrl, connectedAccounts: listData(data, "validate").length },
    };
  },
};

function postPath(input: Record<string, unknown>): string {
  return `/v1/posts/${encodePathSegment(requiredInputString(input.id, "id"))}`;
}

function listData(data: unknown, action: string): unknown[] {
  if (!Array.isArray(data)) {
    throw providerResponseError(`PostOnce ${action} returned no list`);
  }
  return data;
}

/** Send one request and unwrap PostOnce's `{ data, meta }` envelope. */
async function postonceRequest(request: PostonceRequest, context: ApiKeyProviderContext): Promise<PostonceAnswer> {
  // IDs are caller input, so a `.` or `..` segment must not move the request to another endpoint.
  if (hasPathTraversalSegment(request.path)) {
    throw providerInputError("PostOnce IDs must not be . or ..");
  }
  return runProviderRequest({ label: "PostOnce", signal: context.signal }, async (signal) => {
    const url = new URL(`${apiBaseUrl}${request.path}`);
    for (const [key, value] of Object.entries(queryParams(request.query ?? {}))) url.searchParams.set(key, value);
    const headers: Record<string, string> = {
      accept: "application/json",
      authorization: `Bearer ${context.apiKey}`,
      "user-agent": providerUserAgent,
      ...request.headers,
    };
    if (request.body) headers["content-type"] = "application/json";
    const response = await context.fetcher(url.toString(), {
      method: request.method ?? "GET",
      headers,
      body: request.body ? JSON.stringify(request.body) : undefined,
      signal,
    });
    if (!response.ok) {
      throw await readPostonceResponseError(response, signal);
    }
    const payload = await readProviderJsonBody(response, {
      emptyBody: null,
      invalidJsonMessage: "PostOnce returned invalid JSON",
    });
    const envelope = optionalRecord(payload);
    if (!envelope || !("data" in envelope)) {
      throw providerResponseError("PostOnce returned an answer without data");
    }
    return { data: envelope.data, meta: recordOrEmpty(envelope.meta) };
  });
}

async function readPostonceResponseError(response: Response, signal?: AbortSignal): Promise<ProviderRequestError> {
  const text = await readProviderErrorTextBody(response, "PostOnce error response", signal);
  const payload = parseProviderJsonBodyText(text, {
    emptyBody: null,
    invalidJsonMessage: "PostOnce returned invalid JSON",
    invalidJsonFallback: (text) => text.slice(0, 500),
  });
  return postonceRequestError(response.status, payload);
}

/**
 * Turn a PostOnce error answer, `{ error: { code, message, hint } }`, into the execution error the runtime can express.
 */
function postonceRequestError(status: number, payload: unknown): ProviderRequestError {
  const error = optionalRecord(optionalRecord(payload)?.error);
  const message = optionalString(error?.message) ?? `PostOnce request failed with HTTP ${status}`;
  const hint = optionalString(error?.hint);
  const text = hint ? `${message} ${hint}` : message;
  const code = optionalString(error?.code);
  return new ProviderRequestError(
    status >= 500 ? 502 : status,
    text,
    payload,
    code === "invalid_api_key" || code === "missing_scope"
      ? "authorization_failed"
      : status === 401 || status === 403
        ? "provider_error"
        : undefined,
  );
}
