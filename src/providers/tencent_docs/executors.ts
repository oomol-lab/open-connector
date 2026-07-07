import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ExecutionResult,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderProxyUrl,
  normalizeProviderProxyHeaders,
  providerUserAgent,
  ProviderRequestError,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireOAuthCredential,
  toProviderExecutionError,
  toProviderProxyError,
} from "../provider-runtime.ts";
import { tencentDocsActionHandlers, tencentDocsApiBaseUrl } from "./runtime.ts";

const service = "tencent_docs";

export const executors: ProviderExecutors = Object.fromEntries(
  Object.entries(tencentDocsActionHandlers).map(([name, handler]) => [
    `${service}.${name}`,
    async (input: unknown, context: ExecutionContext): Promise<ExecutionResult> => {
      try {
        const credential = await context.getCredential(service);
        if (credential?.authType !== "oauth2") {
          throw new ProviderRequestError(401, "Connect tencent_docs with OAuth first.");
        }
        const clientId =
          optionalString(credential.metadata.clientId) ??
          optionalString(credential.metadata.client_id) ??
          optionalString(credential.metadata.clientID);
        const openID =
          optionalString(credential.metadata.openID) ??
          optionalString(credential.metadata.openId) ??
          optionalString(credential.metadata.user_id);
        if (!clientId && name !== "get_current_user") {
          throw new ProviderRequestError(400, "tencent_docs OpenAPI actions require clientId in OAuth metadata.");
        }
        if (!openID && name !== "get_current_user") {
          throw new ProviderRequestError(400, "tencent_docs OpenAPI actions require openID in OAuth metadata.");
        }

        return {
          ok: true,
          output: await handler(input as Record<string, unknown>, {
            accessToken: credential.accessToken,
            clientId: clientId ?? "",
            openID: openID ?? "",
            fetcher: fetch,
            signal: context.signal,
          }),
        };
      } catch (error) {
        return toProviderExecutionError(error, "tencent_docs request failed");
      }
    },
  ]),
);

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await requireOAuthCredential(context, service);
    const clientId =
      optionalString(credential.metadata.clientId) ??
      optionalString(credential.metadata.client_id) ??
      optionalString(credential.metadata.clientID);
    const openID =
      optionalString(credential.metadata.openID) ??
      optionalString(credential.metadata.openId) ??
      optionalString(credential.metadata.user_id);
    if (!clientId) {
      throw new ProviderRequestError(400, "tencent_docs OpenAPI proxy requires clientId in OAuth metadata.");
    }
    if (!openID) {
      throw new ProviderRequestError(400, "tencent_docs OpenAPI proxy requires openID in OAuth metadata.");
    }

    const url = createProviderProxyUrl(tencentDocsApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("access-token", credential.accessToken);
    headers.set("client-id", clientId);
    headers.set("open-id", openID);
    headers.set("user-agent", providerUserAgent);

    const init: RequestInit = {
      method: input.method,
      headers,
      signal: context.signal,
    };
    if (input.body !== undefined) {
      init.body = typeof input.body === "string" ? input.body : JSON.stringify(input.body);
      if (!headers.has("content-type") && typeof input.body !== "string") {
        headers.set("content-type", "application/json");
      }
    }

    const response = await fetch(url, init);
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(
        response.status,
        text || `tencent_docs request failed with HTTP ${response.status}`,
      );
    }
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "tencent_docs request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher }): Promise<CredentialValidationResult> {
    const url = new URL("https://docs.qq.com/oauth/v2/userinfo");
    url.searchParams.set("access_token", input.accessToken);
    const response = await fetcher(url.toString());
    const envelope = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok || envelope.ret !== 0) {
      throw new ProviderRequestError(
        response.status || 502,
        optionalString(envelope.msg) ?? "Tencent Docs userinfo failed.",
      );
    }

    const data = optionalRecord(envelope.data) ?? {};
    const openID = optionalString(data.openID) ?? optionalString(data.openId);
    if (!openID) {
      throw new ProviderRequestError(502, "tencent_docs userinfo response is missing openID.");
    }
    const nick = optionalString(data.nick);

    return {
      profile: {
        accountId: openID,
        displayName: nick ?? openID,
      },
      metadata: {
        ...input.metadata,
        clientId: optionalString(input.metadata.oauthClientId) ?? optionalString(input.metadata.clientId),
        openID,
        nick,
      },
    };
  },
};
