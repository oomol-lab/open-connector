import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  mapProviderActionHandlers,
  ProviderRequestError,
  providerUserAgent,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
import { navigatrActions } from "./actions.ts";
const apiBaseUrl = "https://api.navigatr.app/v1";
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "navigatr",
  mapProviderActionHandlers(
    "navigatr",
    navigatrActions,
    (_action, actionName) => async (input: Record<string, unknown>, context: ApiKeyProviderContext) => {
      const { badge_id, badge_assertion_id, ...fields } = input;
      let path: string;
      let method = "GET";
      let body: Record<string, unknown> | undefined;
      let query = fields;
      let list = false;
      switch (actionName) {
        case "list_badges":
          path = "/badge/";
          list = true;
          break;
        case "get_badge":
          path = `/badge/${badge_id}`;
          break;
        case "issue_badge":
          path = `/badge/${badge_id}/issue`;
          method = "PUT";
          body = fields;
          query = {};
          break;
        case "list_badge_assertions":
          path = `/badge/${badge_id}/assertions`;
          list = true;
          break;
        case "get_badge_assertion":
          path = `/badge_assertion/${badge_assertion_id}`;
          break;
        case "verify_badge_assertion":
          path = `/badge_assertion/${badge_assertion_id}/verify`;
          break;
        case "revoke_badge_assertion":
          path = `/badge_assertion/${badge_assertion_id}/revoke`;
          method = "PUT";
          break;
        default:
          throw new ProviderRequestError(400, "unknown navigatr action", undefined, "invalid_input");
      }
      const result = await requestNavigatr(context.apiKey, path, method, query, body, context.fetcher, context.signal);
      if (list && Array.isArray(result)) {
        return { items: result };
      }
      const record = requiredResponseRecord(result, "Navigatr response");
      if (list && !Array.isArray(record.items)) {
        throw new ProviderRequestError(502, "Navigatr list response is missing items", undefined, "provider_error");
      }
      return record;
    },
  ),
  { skipDnsValidation: true },
);
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const user = requiredResponseRecord(
      await requestNavigatr(input.apiKey, "/user_detail/0", "GET", {}, undefined, fetcher, signal),
      "Navigatr user",
    );
    const id = optionalNumber(user.id);
    if (id === undefined) throw new ProviderRequestError(502, "Navigatr current user ID is missing");
    const name = [optionalString(user.firstname), optionalString(user.lastname)].filter(Boolean).join(" ").trim();
    return {
      profile: { accountId: String(id), displayName: name || "Navigatr Account" },
      grantedScopes: [],
      metadata: { apiBaseUrl },
    };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "navigatr",
  baseUrl: apiBaseUrl,
  auth: { type: "api_key_header", name: "X-Access-Token" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});
async function requestNavigatr(
  apiKey: string,
  path: string,
  method: string,
  query: Record<string, unknown>,
  body: Record<string, unknown> | undefined,
  fetcher: typeof fetch,
  parentSignal?: AbortSignal,
) {
  const url = new URL(`${apiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return runProviderRequest({ label: "Navigatr", signal: parentSignal }, async (signal) => {
    const response = await fetcher(url.toString(), {
      method,
      headers: {
        "X-Access-Token": apiKey,
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
    const text = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      if (response.ok)
        throw new ProviderRequestError(502, "Navigatr returned invalid JSON", undefined, "provider_error");
    }
    if (!response.ok) {
      const record = optionalRecord(payload);
      const detail = record?.detail;
      const message =
        optionalString(detail) ??
        (Array.isArray(detail)
          ? detail
              .map((item) => optionalString(optionalRecord(item)?.msg))
              .filter(Boolean)
              .join("; ")
          : undefined);
      throw new ProviderRequestError(
        response.status,
        message || `Navigatr request failed (${response.status})`,
        undefined,
        response.status === 429 ? "rate_limited" : "provider_error",
      );
    }
    return payload;
  });
}
