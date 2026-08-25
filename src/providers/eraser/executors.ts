import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { compactObject } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "eraser";
const eraserApiBaseUrl = "https://app.eraser.io/api";
const eraserRequestTimeoutMs = 60_000;
type EraserRequestPhase = "validate" | "execute";

interface EraserRequestInput {
  path: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  apiKey: string;
  fetcher: typeof fetch;
  phase: EraserRequestPhase;
}

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  service,
  {
    generate_diagram_from_prompt(input, context) {
      return executeEraserAction("generate_diagram_from_prompt", input, context.apiKey, context.fetcher);
    },
    generate_diagram_from_dsl(input, context) {
      return executeEraserAction("generate_diagram_from_dsl", input, context.apiKey, context.fetcher);
    },
    list_files(input, context) {
      return executeEraserAction("list_files", input, context.apiKey, context.fetcher);
    },
    create_file(input, context) {
      return executeEraserAction("create_file", input, context.apiKey, context.fetcher);
    },
    get_file(input, context) {
      return executeEraserAction("get_file", input, context.apiKey, context.fetcher);
    },
    update_file(input, context) {
      return executeEraserAction("update_file", input, context.apiKey, context.fetcher);
    },
    archive_file(input, context) {
      return executeEraserAction("archive_file", input, context.apiKey, context.fetcher);
    },
    list_diagrams(input, context) {
      return executeEraserAction("list_diagrams", input, context.apiKey, context.fetcher);
    },
    create_diagram(input, context) {
      return executeEraserAction("create_diagram", input, context.apiKey, context.fetcher);
    },
    get_diagram(input, context) {
      return executeEraserAction("get_diagram", input, context.apiKey, context.fetcher);
    },
    update_diagram(input, context) {
      return executeEraserAction("update_diagram", input, context.apiKey, context.fetcher);
    },
    delete_diagram(input, context) {
      return executeEraserAction("delete_diagram", input, context.apiKey, context.fetcher);
    },
  },
  { skipDnsValidation: true },
);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, context) {
    await requestEraser({
      path: "/files",
      query: { limit: 1 },
      apiKey: input.apiKey,
      fetcher: context.fetcher,
      phase: "validate",
    });
    return {
      profile: { accountId: "eraser", displayName: "Eraser Team API Token" },
      grantedScopes: [],
      metadata: { apiBaseUrl: eraserApiBaseUrl, validationEndpoint: "/files?limit=1" },
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: eraserApiBaseUrl,
  auth: { type: "api_key_header", name: "authorization" },
  customizeRequest({ headers, credential }) {
    if (credential?.authType == "api_key") headers.set("authorization", `Bearer ${credential.apiKey}`);
    headers.set("accept", "application/json");
  },
  skipDnsValidation: true,
});

async function executeEraserAction(
  actionName: string,
  input: Record<string, unknown>,
  apiKey: string,
  fetcher: typeof fetch,
) {
  const request = eraserRequestForAction(actionName, input);
  return requestEraser({ ...request, apiKey, fetcher, phase: "execute" });
}

function eraserRequestForAction(
  actionName: string,
  input: Record<string, unknown>,
): Pick<EraserRequestInput, "path" | "method" | "query" | "body"> {
  const fileId = encodeURIComponent(String(input.fileId ?? ""));
  const diagramId = encodeURIComponent(String(input.diagramId ?? ""));
  switch (actionName) {
    case "generate_diagram_from_prompt":
      return { path: "/render/prompt", method: "POST", body: input };
    case "generate_diagram_from_dsl":
      return {
        path: "/render/elements",
        method: "POST",
        body: compactObject({
          theme: input.theme,
          background: input.background,
          imageQuality: input.imageQuality,
          fileOptions: input.fileOptions,
          title: input.title,
          elements: [
            {
              type: "diagram",
              diagramType: input.diagramType,
              code: input.code,
            },
          ],
        }),
      };
    case "list_files":
      return { path: "/files", query: input };
    case "create_file":
      return { path: "/files", method: "POST", body: input };
    case "get_file":
      return { path: `/files/${fileId}` };
    case "update_file":
      return { path: `/files/${fileId}`, method: "PUT", body: withoutIds(input) };
    case "archive_file":
      return { path: `/files/${fileId}`, method: "DELETE" };
    case "list_diagrams":
      return { path: `/files/${fileId}/diagrams` };
    case "create_diagram":
      return { path: `/files/${fileId}/diagrams`, method: "POST", body: withoutIds(input) };
    case "get_diagram":
      return { path: `/files/${fileId}/diagrams/${diagramId}` };
    case "update_diagram":
      return {
        path: `/files/${fileId}/diagrams/${diagramId}`,
        method: "PUT",
        body: withoutIds(input),
      };
    case "delete_diagram":
      return { path: `/files/${fileId}/diagrams/${diagramId}`, method: "DELETE" };
    default:
      throw new ProviderRequestError(400, `unknown Eraser action: ${actionName}`);
  }
}

function withoutIds(input: Record<string, unknown>) {
  const body = { ...input };
  delete body.fileId;
  delete body.diagramId;
  return body;
}

async function requestEraser(input: EraserRequestInput) {
  const timeout = createProviderTimeout(undefined, eraserRequestTimeoutMs);
  const url = new URL(`${eraserApiBaseUrl}${input.path}`);
  for (const [name, value] of Object.entries(input.query ?? {})) {
    if (value != null) {
      url.searchParams.set(name, String(value));
    }
  }

  try {
    const response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.apiKey}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    const payload = await readEraserPayload(response);
    if (!response.ok) {
      throw createEraserError(response, payload);
    }
    return requireEraserJson(payload);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || (error instanceof Error && error.name === "AbortError")) {
      throw new ProviderRequestError(504, "Eraser request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Eraser request failed: ${error.message}` : "Eraser request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readEraserPayload(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function requireEraserJson(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    throw new ProviderRequestError(502, "Eraser returned invalid JSON");
  }
  return payload;
}

function createEraserError(response: Response, payload: unknown) {
  const message = readEraserErrorMessage(payload) ?? `Eraser request failed with status ${response.status}`;
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(response.status, message);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  return new ProviderRequestError(response.status || 502, message);
}

function readEraserErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }
  const record = payload as Record<string, unknown>;
  for (const field of ["message", "error", "detail"]) {
    const value = record[field];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}
