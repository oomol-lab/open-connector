import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
} from "../../core/types.ts";
import type { AcuitySchedulingActionContext } from "./runtime.ts";

import { Buffer } from "node:buffer";
import { optionalString } from "../../core/cast.ts";
import {
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  providerFetch,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";
import {
  acuitySchedulingActionHandlers,
  resolveAcuitySchedulingCredential,
  validateAcuitySchedulingCredential,
} from "./runtime.ts";

const service = "acuity_scheduling";

export const executors: ProviderExecutors = defineProviderExecutors<AcuitySchedulingActionContext>({
  service,
  handlers: acuitySchedulingActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher): Promise<AcuitySchedulingActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      credential: resolveAcuitySchedulingCredential({
        apiKey: credential.apiKey,
        userId: optionalString(credential.values.userId ?? credential.metadata.userId),
      }),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateAcuitySchedulingCredential(
      {
        apiKey: input.apiKey,
        userId: optionalString(input.values.userId) ?? "",
      },
      fetcher,
      signal,
    );
  },
};

export const proxy: ProviderProxyExecutor = async (input, context): Promise<ProxyExecutionResult> => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const resolved = resolveAcuitySchedulingCredential({
      apiKey: credential.apiKey,
      userId: optionalString(credential.values.userId ?? credential.metadata.userId),
    });
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("accept", "application/json");
    headers.set("authorization", `Basic ${Buffer.from(`${resolved.userId}:${resolved.apiKey}`).toString("base64")}`);
    headers.set("user-agent", providerUserAgent);
    if (input.body !== undefined && !headers.has("content-type") && typeof input.body !== "string") {
      headers.set("content-type", "application/json");
    }
    const response = await providerFetch(
      createProviderProxyUrl("https://acuityscheduling.com/api/v1", input.endpoint, input.query),
      {
        method: input.method,
        headers,
        body:
          input.body === undefined
            ? undefined
            : typeof input.body === "string"
              ? input.body
              : JSON.stringify(input.body),
        signal: context.signal,
      },
    );
    if (!response.ok) {
      const message = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(
        response.status,
        message || `provider request failed with HTTP ${response.status}`,
      );
    }
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "Acuity Scheduling proxy request failed");
  }
};
