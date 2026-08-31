import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError, requiredInputString } from "../provider-runtime.ts";

export const loyjoyApiBaseUrl = "https://app-stable.loyjoy.com/api";
type Phase = "validate" | "execute";

export const loyjoyActionHandlers: ProviderActionHandlers<
  "loyjoy",
  (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>
> = {
  async list_processes(_input, context) {
    return {
      processes: readObjectArray(await request("/processes", "GET", undefined, context, "execute"), "processes"),
    };
  },
  async get_process(input, context) {
    return {
      process: readObject(
        await request(
          `/processes/${encodeURIComponent(requiredInputString(input.processId, "processId"))}`,
          "GET",
          undefined,
          context,
          "execute",
        ),
        "process",
      ),
    };
  },
  async start_process(input, context) {
    return {
      variables: await request(
        `/processes/start/${encodeURIComponent(requiredInputString(input.processId, "processId"))}`,
        "POST",
        input.variables === undefined ? {} : { variables: input.variables },
        context,
        "execute",
      ),
    };
  },
  async list_views(_input, context) {
    return { views: readObjectArray(await request("/views", "GET", undefined, context, "execute"), "views") };
  },
  async get_view(input, context) {
    return {
      view: readObject(
        await request(
          `/views/${encodeURIComponent(requiredInputString(input.viewId, "viewId"))}`,
          "GET",
          undefined,
          context,
          "execute",
        ),
        "view",
      ),
    };
  },
  async search_chunks(input, context) {
    return {
      chunks: readObjectArray(
        await request(
          "/chunks/search",
          "POST",
          compactObject({ query: input.query, folders: input.folders, max_chunks: input.maxChunks }),
          context,
          "execute",
        ),
        "chunks",
      ),
    };
  },
  async create_completion(input, context) {
    const payload = readObject(
      await request(
        `/completions/${encodeURIComponent(requiredInputString(input.processId, "processId"))}`,
        "POST",
        compactObject({ text: input.text, locale: input.locale }),
        context,
        "execute",
      ),
      "completion",
    );
    const text = optionalString(payload.text);
    if (text === undefined) throw new ProviderRequestError(502, "LoyJoy returned a completion without text");
    return { text };
  },
};

export async function validateLoyjoyApiKey(context: ApiKeyProviderContext): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  await request("/processes", "GET", undefined, context, "validate");
  return {
    profile: { accountId: "api_key", displayName: "LoyJoy Tenant" },
    grantedScopes: [],
    metadata: { apiBaseUrl: loyjoyApiBaseUrl, validationEndpoint: "/processes" },
  };
}

async function request(
  path: string,
  method: "GET" | "POST",
  body: Record<string, unknown> | undefined,
  context: ApiKeyProviderContext,
  phase: Phase,
): Promise<unknown> {
  const response = await context.fetcher(`${loyjoyApiBaseUrl}${path}`, {
    method,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${context.apiKey}`,
      ...(body ? { "content-type": "application/json" } : {}),
      "user-agent": providerUserAgent,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: context.signal,
  });
  const text = await response.text();
  let payload: unknown = null;
  if (text.trim()) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ProviderRequestError(502, "LoyJoy returned invalid JSON");
    }
  }
  if (!response.ok && !(phase === "validate" && response.status === 403)) throw errorFor(response, payload, phase);
  return payload;
}

function errorFor(response: Response, payload: unknown, phase: Phase): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.message) ??
    optionalString(record?.error) ??
    `LoyJoy request failed with status ${response.status}`;
  if (response.status === 429) return new ProviderRequestError(429, message);
  if (phase === "validate" && response.status >= 400 && response.status < 500)
    return new ProviderRequestError(400, message);
  if (phase === "execute" && (response.status === 401 || response.status === 403))
    return new ProviderRequestError(401, message);
  return new ProviderRequestError(response.status >= 400 && response.status < 500 ? 400 : 502, message);
}
function readObject(value: unknown, label: string): Record<string, unknown> {
  const result = optionalRecord(value);
  if (!result) throw new ProviderRequestError(502, `LoyJoy returned invalid ${label} payload`);
  return result;
}
function readObjectArray(value: unknown, label: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value) || value.some((item) => !optionalRecord(item)))
    throw new ProviderRequestError(502, `LoyJoy returned invalid ${label} payload`);
  return value as Array<Record<string, unknown>>;
}
