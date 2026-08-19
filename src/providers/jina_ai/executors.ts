import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
  readProviderTextBody,
} from "../provider-runtime.ts";

const service = "jina_ai";
const apiBaseUrl = "https://api.jina.ai";
const requestTimeoutMs = 30_000;

type JinaAiActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

const paths: Record<string, string> = {
  create_embeddings: "/v1/embeddings",
  rerank_documents: "/v1/rerank",
};

const jinaAiActionHandlers: ProviderActionHandlers<"jina_ai", JinaAiActionHandler> = {
  create_embeddings(input, context) {
    return jinaPost(input, context, paths.create_embeddings, "execute");
  },
  rerank_documents(input, context) {
    return jinaPost(input, context, paths.rerank_documents, "execute");
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, jinaAiActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: apiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await jinaPost(
      {
        model: "jina-reranker-v2-base-multilingual",
        query: "credential validation",
        documents: ["credential validation"],
        top_n: 1,
      },
      { apiKey: input.apiKey, fetcher, signal },
      paths.rerank_documents,
      "validate",
    );
    return {
      profile: {
        accountId: "api_key",
        displayName: "Jina AI API Key",
      },
      grantedScopes: [],
      metadata: {
        validationEndpoint: paths.rerank_documents,
      },
    };
  },
};

async function jinaPost(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  path: string,
  mode: "validate" | "execute",
): Promise<unknown> {
  const timeout = createProviderTimeout(context.signal, requestTimeoutMs);
  try {
    const response = await context.fetcher(`${apiBaseUrl}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${context.apiKey}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify(compactObject(input)),
      signal: timeout.signal,
    });
    const text = await readProviderTextBody(response, "Jina AI response");
    if (response.ok) {
      return parseJson(text);
    }

    const message = text || `Jina AI request failed with ${response.status}`;
    if (response.status === 429) {
      throw new ProviderRequestError(429, message);
    }
    if (mode === "validate" && (response.status === 401 || response.status === 403)) {
      throw new ProviderRequestError(401, message);
    }
    if (response.status === 400 || response.status === 422) {
      throw new ProviderRequestError(400, message);
    }
    throw new ProviderRequestError(response.status || 502, message);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Jina AI request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Jina AI request failed: ${error.message}` : "Jina AI request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Jina AI returned invalid JSON");
  }
}
