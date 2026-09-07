import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { optionalRecord } from "../../core/cast.ts";
import {
  createProviderFetch,
  createProviderProxyUrl,
  defineApiKeyProviderExecutors,
  normalizeProviderProxyHeaders,
  providerInputError,
  providerUserAgent,
  readProviderProxyResponse,
  requireApiKeyCredential,
  runProviderRequest,
  toProviderProxyError,
} from "../provider-runtime.ts";
import {
  heyzineActionHandlers,
  heyzineApiBaseUrl,
  readHeyzineProxyPayload,
  validateHeyzineCredential,
} from "./runtime.ts";

const service = "heyzine";
const proxyFetch = createProviderFetch({ skipDnsValidation: true });

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, heyzineActionHandlers);

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const method = input.method.toUpperCase();
    if (method !== "GET" && method !== "POST") {
      throw providerInputError("heyzine proxy only supports GET and POST");
    }
    const credential = await requireApiKeyCredential(context, service);
    const body = parseHeyzineProxyBody(input.body);
    const headers = normalizeProviderProxyHeaders(input.headers);
    if (!headers.has("accept")) headers.set("accept", "application/json");
    headers.set("authorization", `Bearer ${credential.apiKey}`);
    headers.set("user-agent", providerUserAgent);
    if (method === "POST" && !headers.has("content-type")) headers.set("content-type", "application/json");
    const response = await runProviderRequest({ signal: context.signal, label: "Heyzine" }, (signal) =>
      proxyFetch(createProviderProxyUrl(heyzineApiBaseUrl, input.endpoint, input.query), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
      }),
    );
    const payload = await readHeyzineProxyPayload(response);
    return {
      ok: true,
      response: await readProviderProxyResponse(
        Response.json(payload, { status: response.status, statusText: response.statusText }),
      ),
    };
  } catch (error) {
    return toProviderProxyError(error, "Heyzine proxy request failed");
  }
};

function parseHeyzineProxyBody(body: unknown): Record<string, unknown> | undefined {
  if (body == null) return undefined;
  if (typeof body === "string") {
    try {
      const parsed: unknown = JSON.parse(body);
      const record = optionalRecord(parsed);
      if (record) return record;
    } catch {
      throw providerInputError("heyzine proxy body must be valid JSON");
    }
  } else {
    const record = optionalRecord(body);
    if (record) return record;
  }
  throw providerInputError("heyzine proxy body must be a JSON object");
}

export const credentialValidators: CredentialValidators = {
  apiKey: validateHeyzineCredential,
};
