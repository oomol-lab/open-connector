import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { readBoundedResponseBytes } from "../../core/request.ts";
import { requireApiKeyCredential } from "../provider-credentials.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import {
  createProviderProxyUrl,
  normalizeProviderProxyHeaders,
  readProviderProxyResponse,
  readProviderProxyErrorMessage,
  toProviderProxyError,
} from "../provider-proxy.ts";
import {
  isAbortLikeError,
  providerFetch,
  ProviderRequestError,
  providerUserAgent,
  runProviderRequest,
} from "../provider-runtime.ts";
import { tendataActions } from "./actions.ts";
import {
  executeTendataAction,
  getAccessToken,
  isInvalidToken,
  redactError,
  tendataApiBaseUrl,
  validateTendataCredential,
} from "./runtime.ts";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "tendata",
  Object.fromEntries(
    tendataActions.map((action) => [
      action.name,
      (input, context) => executeTendataAction(action.name, input, context.apiKey, context.fetcher, context.signal),
    ]),
  ),
);

export const credentialValidators: CredentialValidators = {
  apiKey: (input, { fetcher }) => validateTendataCredential(input.apiKey, fetcher),
};
// The upstream token can expire before its advertised lifetime, including on HTTP 200.
export const proxy: ProviderProxyExecutor = async (input, context) => {
  let secrets: string[] = [];
  try {
    const credential = await requireApiKeyCredential(context, "tendata");
    secrets = [credential.apiKey];
    const url = createProviderProxyUrl(tendataApiBaseUrl, input.endpoint, input.query);
    let token = await getAccessToken(credential.apiKey, providerFetch);
    for (let attempt = 0; ; attempt++) {
      secrets = [credential.apiKey, token.accessToken];
      const response = await runProviderRequest({ label: "Tendata proxy", signal: context.signal }, async (signal) => {
        const headers = normalizeProviderProxyHeaders(input.headers);
        headers.set("authorization", `Bearer ${token.accessToken}`);
        if (!headers.has("accept")) headers.set("accept", "application/json");
        if (!headers.has("content-type")) headers.set("content-type", "application/json");
        headers.set("user-agent", providerUserAgent);
        const response = await providerFetch(url, {
          method: input.method,
          headers,
          body:
            input.body === undefined
              ? undefined
              : typeof input.body === "string"
                ? input.body
                : JSON.stringify(input.body),
          signal,
        });
        let payload: unknown;
        try {
          payload = JSON.parse(
            new TextDecoder().decode(
              await readBoundedResponseBytes(response.clone(), {
                maxBytes: 64 * 1024,
                fieldName: "Tendata token error inspection",
                createError: (message) => new ProviderRequestError(413, message),
              }),
            ),
          );
        } catch (error) {
          if (isAbortLikeError(error)) throw error;
        }
        if (attempt === 0 && isInvalidToken(payload)) {
          await response.body?.cancel();
          return undefined;
        }
        if (!response.ok)
          throw new ProviderRequestError(
            response.status,
            await readProviderProxyErrorMessage(response, `Tendata request failed with HTTP ${response.status}`),
            undefined,
            "provider_error",
          );
        return readProviderProxyResponse(response);
      });
      if (response) return { ok: true, response };
      token = await getAccessToken(credential.apiKey, providerFetch, token.accessToken);
    }
  } catch (error) {
    return toProviderProxyError(redactError(error, secrets), "Tendata proxy request failed");
  }
};
