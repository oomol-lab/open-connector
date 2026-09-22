import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
  readProviderJsonBody,
  requiredInputString,
  runProviderRequest,
} from "../provider-runtime.ts";

const service = "pdf_vector";
const pdfVectorApiBaseUrl = "https://global.pdfvector.com/api";
const credentialUrl = "https://global.pdfvector.com/rpc/authenticate/validateCredential";
type Phase = "validate" | "execute";
type Handler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

const handlers: ProviderActionHandlers<"pdf_vector", Handler> = {
  parse_document(input, context) {
    return executeDocumentAction("/document/parse", input, context);
  },
  ask_document(input, context) {
    return executeDocumentAction("/document/ask", input, context);
  },
  extract_document(input, context) {
    return executeDocumentAction("/document/extract", input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: pdfVectorApiBaseUrl,
  auth: { type: "bearer" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("x-pdfvector-source", "oomol-connector");
  },
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestJson({
      url: credentialUrl,
      body: {},
      context: { apiKey: input.apiKey, fetcher, signal },
      phase: "validate",
    });
    const version = optionalString(optionalRecord(optionalRecord(payload)?.json)?.version);
    if (!version)
      throw new ProviderRequestError(502, "PDF Vector credential validation response did not include a server version");
    return {
      profile: { accountId: "pdf-vector-api-key", displayName: "PDF Vector API Key" },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: pdfVectorApiBaseUrl,
        validationEndpoint: "/rpc/authenticate/validateCredential",
        serverVersion: version,
      },
    };
  },
};

function executeDocumentAction(
  path: string,
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  return requestJson({
    url: `${pdfVectorApiBaseUrl}${path}`,
    body: compactObject({
      url: requiredInputString(input.documentUrl, "documentUrl"),
      model: optionalString(input.model),
      documentId: optionalString(input.documentId),
      includePages: input.includePages,
      question: optionalString(input.question),
      prompt: optionalString(input.prompt),
      schema: optionalRecord(input.schema),
    }),
    context,
    phase: "execute",
  });
}

async function requestJson(input: {
  url: string;
  body: Record<string, unknown>;
  context: ApiKeyProviderContext;
  phase: Phase;
}): Promise<unknown> {
  return runProviderRequest({ signal: input.context.signal, label: "PDF Vector" }, async (signal) => {
    const response = await input.context.fetcher(input.url, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.context.apiKey}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
        "x-pdfvector-source": "oomol-connector",
      },
      body: JSON.stringify(input.body),
      signal,
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: null,
      invalidJsonMessage: "PDF Vector returned invalid JSON",
    });
    if (!response.ok) throw createError(response.status, payload, input.phase);
    return payload;
  });
}

function createError(status: number, payload: unknown, phase: Phase): ProviderRequestError {
  const record = optionalRecord(payload);
  const json = optionalRecord(record?.json);
  const error = optionalRecord(record?.error);
  const message =
    optionalString(json?.message) ??
    optionalString(error?.message) ??
    optionalString(record?.message) ??
    `PDF Vector request failed with status ${status}`;
  const code = optionalString(json?.code) ?? optionalString(error?.code) ?? optionalString(record?.code);
  if (phase === "validate" && status === 401 && code === "UNAUTHORIZED") return providerInputError(message);
  if (status === 429) return new ProviderRequestError(429, message, payload);
  if (phase === "execute" && [400, 404, 422].includes(status)) return providerInputError(message);
  return new ProviderRequestError(status || 502, message, payload);
}
