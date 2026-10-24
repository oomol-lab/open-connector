import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRawString, recordOrEmpty, looseArray } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, mapProviderActionHandlers } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  ProviderRequestError,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
  readProviderTextBody,
} from "../provider-runtime.ts";
import { pickyAssistActions } from "./actions.ts";
const baseUrl = "https://app.pickyassist.com/api/v2";

function validateMessages(body: Record<string, unknown>) {
  for (const entry of looseArray(body.data)) {
    const recipient = recordOrEmpty(entry);
    const recipientField = body.application === 5 ? "messenger_id" : "number";
    requiredInputString(recipient[recipientField], `data[].${recipientField}`);
    if (
      ![recipient.message, recipient.media, body.globalmessage, body.globalmedia].some((value) =>
        optionalRawString(value)?.trim(),
      )
    ) {
      throw new ProviderRequestError(
        400,
        "Each recipient requires text or media, either individual or global",
        undefined,
        "invalid_input",
      );
    }
  }
}

async function request(
  endpoint: string,
  body: Record<string, unknown>,
  apiKey: string,
  fetcher: typeof fetch,
  parentSignal?: AbortSignal,
) {
  return runProviderRequest({ signal: parentSignal, label: "Picky Assist" }, async (signal) => {
    const response = await fetcher(`${baseUrl}/${endpoint}`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ ...body, token: apiKey }),
      signal,
    });
    const payload = await readProviderTextBody(response, "picky_assist response", undefined, signal)
      .then((text) => JSON.parse(text) as unknown)
      .catch((error: unknown) => {
        if (error instanceof SyntaxError) return null;
        throw error;
      });
    const result = recordOrEmpty(payload);
    if (!response.ok || result.status !== 100) {
      const code = typeof result.status === "number" ? ` (status ${result.status})` : "";
      throw new ProviderRequestError(
        response.ok ? 502 : response.status,
        `Picky Assist${code}: ${optionalRawString(result.message) ?? `request failed with HTTP ${response.status}`}`,
        undefined,
        "provider_error",
      );
    }
    return requiredResponseRecord(payload, "Picky Assist response");
  });
}

const handlers = mapProviderActionHandlers(
  "picky_assist",
  pickyAssistActions,
  (action) => async (values: Record<string, unknown>, context: ApiKeyProviderContext) => {
    if (action.name === "send_messages") {
      validateMessages(values);
    }
    return request(
      action.name === "get_balance" ? "check-balance" : "push",
      values,
      requiredInputString(context.apiKey, "apiKey"),
      context.fetcher,
      context.signal,
    );
  },
);
export const executors: ProviderExecutors = defineApiKeyProviderExecutors("picky_assist", handlers, {
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    await request("check-balance", {}, requiredInputString(input.apiKey, "apiKey"), fetcher);
    return {
      profile: { displayName: "Picky Assist API Token" },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl },
    };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "picky_assist",
  baseUrl,
  auth: { type: "api_key_json_body", name: "token" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
  },
});
