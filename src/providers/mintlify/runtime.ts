import { optionalRecord, optionalString } from "../../core/cast.ts";
import { createProviderTimeout, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const mintlifyApiBaseUrl = "https://api.mintlify.com/v1";
const mintlifyDefaultRequestTimeoutMs = 30_000;
type MintlifyRequestPhase = "validate" | "execute";

export async function validateMintlifyCredential(
  apiKey: string,
  projectId: string,
  fetcher: typeof fetch,
): Promise<void> {
  if (!projectId.trim()) throw new ProviderRequestError(400, "Mintlify project ID is required");
  await requestMintlifyJson({
    apiKey,
    path: `/agent/${encodeURIComponent(projectId)}/jobs`,
    method: "GET",
    fetcher,
    phase: "validate",
  });
}

export async function executeMintlifyAction(
  actionName: string,
  input: Record<string, unknown>,
  apiKey: string,
  fetcher: typeof fetch,
): Promise<unknown> {
  const projectId = optionalString(input.projectId);
  const statusId = optionalString(input.statusId);

  if (actionName === "trigger_deployment" && projectId) {
    return requestMintlifyJson({
      apiKey,
      path: `/project/update/${encodeURIComponent(projectId)}`,
      method: "POST",
      fetcher,
      phase: "execute",
    });
  }
  if (actionName === "trigger_preview_deployment" && projectId) {
    return requestMintlifyJson({
      apiKey,
      path: `/project/preview/${encodeURIComponent(projectId)}`,
      method: "POST",
      body: { branch: optionalString(input.branch) },
      fetcher,
      phase: "execute",
    });
  }
  if (actionName === "get_deployment_status" && statusId) {
    return requestMintlifyJson({
      apiKey,
      path: `/project/update-status/${encodeURIComponent(statusId)}`,
      method: "GET",
      fetcher,
      phase: "execute",
    });
  }

  throw new ProviderRequestError(400, `invalid mintlify ${actionName} input`);
}

async function requestMintlifyJson(input: {
  apiKey: string;
  path: string;
  method: "GET" | "POST";
  body?: Record<string, unknown>;
  fetcher: typeof fetch;
  phase: MintlifyRequestPhase;
}) {
  const timeoutHandle = createProviderTimeout(undefined, mintlifyDefaultRequestTimeoutMs);
  try {
    const response = await input.fetcher(new URL(`${mintlifyApiBaseUrl}${input.path}`), {
      method: input.method,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.apiKey}`,
        ...(input.body ? { "content-type": "application/json" } : {}),
        "user-agent": providerUserAgent,
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeoutHandle.signal,
    });
    const payload = await readMintlifyPayload(response);
    if (!response.ok) {
      throw createMintlifyError(response, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeoutHandle.didTimeout() || isAbortError(error)) {
      throw new ProviderRequestError(504, "Mintlify request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Mintlify request failed: ${error.message}` : "Mintlify request failed",
    );
  } finally {
    timeoutHandle.cleanup();
  }
}

async function readMintlifyPayload(response: Response) {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Mintlify returned invalid JSON");
  }
}

function createMintlifyError(response: Response, payload: unknown, phase: MintlifyRequestPhase) {
  const record = optionalRecord(payload);
  const nestedError = optionalRecord(record?.error);
  const message =
    optionalString(record?.message) ??
    optionalString(record?.error) ??
    optionalString(nestedError?.message) ??
    `Mintlify request failed with status ${response.status}`;

  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 403, message);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(502, message);
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}
