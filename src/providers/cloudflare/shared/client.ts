import { providerUserAgent } from "../../provider-runtime.ts";
import { cloudflareResponseError, parseCloudflareResponseText } from "./errors.ts";

export const cloudflareApiBaseUrl = "https://api.cloudflare.com/client/v4";

type QueryValue = string | number | boolean | undefined;

export interface CloudflareEnvelope {
  success?: unknown;
  result?: unknown;
  errors?: unknown;
  messages?: unknown;
  meta?: unknown;
  result_info?: unknown;
}

export interface CloudflareRequestInput {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, QueryValue>;
  body?: Record<string, unknown> | FormData | Blob;
  headers?: Record<string, string>;
  authHeaders?: Record<string, string>;
}

export async function cloudflareRequestEnvelope(
  apiToken: string,
  request: CloudflareRequestInput,
  fetcher: typeof fetch,
  phase: "validate" | "execute",
  signal?: AbortSignal,
): Promise<CloudflareEnvelope> {
  const response = await fetcher(buildCloudflareUrl(request.path, request.query), {
    method: request.method ?? "GET",
    headers: cloudflareHeaders(apiToken, {
      hasBody: request.body != null,
      extraHeaders: request.headers,
      authHeaders: request.authHeaders,
      useJsonContentType: !(request.body instanceof FormData || request.body instanceof Blob),
    }),
    body: buildCloudflareRequestBody(request.body),
    signal,
  });
  const envelope = await readCloudflareEnvelope(response);

  if (!response.ok || envelope.success === false) {
    const error = cloudflareResponseError(response, envelope, phase);
    throw error;
  }

  return envelope;
}

function buildCloudflareRequestBody(body: Record<string, unknown> | FormData | Blob | undefined) {
  if (body == null) {
    return undefined;
  }

  if (body instanceof FormData || body instanceof Blob) {
    return body;
  }

  return JSON.stringify(body);
}

export function buildCloudflareUrl(path: string, query?: Record<string, QueryValue>): string {
  const url = new URL(`${cloudflareApiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) {
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function cloudflareHeaders(
  apiToken: string,
  input: {
    hasBody: boolean;
    extraHeaders?: Record<string, string>;
    authHeaders?: Record<string, string>;
    useJsonContentType?: boolean;
  },
): Record<string, string> {
  const headers: Record<string, string> = {
    ...(input.authHeaders ?? { authorization: `Bearer ${apiToken}` }),
    "user-agent": providerUserAgent,
  };

  if (input.hasBody && input.useJsonContentType !== false) {
    headers["content-type"] = "application/json";
  }

  return { ...headers, ...input.extraHeaders };
}

export async function readCloudflareEnvelope(response: Response): Promise<CloudflareEnvelope> {
  const text = await response.text();
  return parseCloudflareResponseText(text);
}
