import type { CredentialValidationResult, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineProviderExecutors,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

type SignpathActionContext = {
  apiKey: string;
  organizationId: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
};
type SignpathActionHandler = (input: Record<string, unknown>, context: SignpathActionContext) => Promise<unknown>;
type SignpathPhase = "validate" | "execute";

export const signpathApiBaseUrl = "https://app.signpath.io/api/v1";
const signpathDefaultRequestTimeoutMs = 30_000;

export const signpathActionHandlers: ProviderActionHandlers<"signpath", SignpathActionHandler> = {
  async list_signing_policies(input, context) {
    const payload = await requestSignpathJson(
      {
        organizationId: context.organizationId,
        path: "/Cryptoki/MySigningPolicies",
        query: compactObject({
          projectSlug: readOptionalString(input.projectSlug),
          signingPolicySlug: readOptionalString(input.signingPolicySlug),
        }),
      },
      context.apiKey,
      context.fetcher,
      context.signal,
      "execute",
    );

    return {
      signingPolicies: readSigningPolicies(payload),
    };
  },
  async get_signing_request(input, context) {
    const signingRequestId = readRequiredUuidLikeString(input.signingRequestId, "signingRequestId");
    const payload = await requestSignpathJson(
      {
        organizationId: context.organizationId,
        path: `/SigningRequests/${encodeURIComponent(signingRequestId)}`,
      },
      context.apiKey,
      context.fetcher,
      context.signal,
      "execute",
    );

    return {
      signingRequest: normalizeSigningRequest(signingRequestId, payload),
    };
  },
  async fast_sign_hash(input, context) {
    const formData = buildFastSignHashFormData(input);
    const payload = await requestSignpathJson(
      {
        organizationId: context.organizationId,
        path: "/SigningRequests/SubmitWithArtifact",
        method: "POST",
        body: formData,
      },
      context.apiKey,
      context.fetcher,
      context.signal,
      "execute",
    );

    return normalizeFastSignHashResponse(payload);
  },
};

export async function validateSignpathCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
  const organizationId = requireOrganizationId(input.organizationId);
  const payload = await requestSignpathJson(
    {
      organizationId,
      path: "/Cryptoki/MySigningPolicies",
    },
    apiKey,
    fetcher,
    undefined,
    "validate",
  );
  const signingPolicies = readSigningPolicies(payload);

  return {
    profile: {
      accountId: organizationId,
      displayName: "SignPath API Token",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: signpathApiBaseUrl,
      organizationId,
      validationEndpoint: "/Cryptoki/MySigningPolicies",
      signingPolicyCount: signingPolicies.length,
    },
  };
}

export const executors: ProviderExecutors = defineProviderExecutors<SignpathActionContext>({
  service: "signpath",
  handlers: signpathActionHandlers,
  async createContext(context: ExecutionContext, fetcher: ProviderFetch): Promise<SignpathActionContext> {
    const credential = await requireApiKeyCredential(context, "signpath");
    return {
      apiKey: credential.apiKey,
      organizationId: requireOrganizationId(
        credential.values.organizationId ?? optionalString(credential.metadata.organizationId),
      ),
      fetcher,
      signal: context.signal,
    };
  },
});

interface SignpathRequestInput {
  organizationId: string;
  path: string;
  method?: "GET" | "POST";
  query?: Record<string, string | undefined>;
  body?: BodyInit;
}

async function requestSignpathJson(
  input: SignpathRequestInput,
  apiKey: string,
  fetcher: ProviderFetch,
  signal: AbortSignal | undefined,
  phase: SignpathPhase,
) {
  const timeoutSignal = createProviderTimeout(signal, signpathDefaultRequestTimeoutMs);

  try {
    const response = await fetcher(buildSignpathUrl(input), {
      method: input.method ?? "GET",
      headers: buildSignpathHeaders(apiKey, input.body),
      body: input.body,
      signal: timeoutSignal.signal,
    });

    const payload = await readSignpathPayload(response);
    if (!response.ok) {
      throw createSignpathError(response.status, payload, phase);
    }

    const payloadObject = optionalRecord(payload);
    if (!payloadObject) {
      throw new ProviderRequestError(502, "SignPath returned an invalid JSON response");
    }

    return payloadObject;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    const isTimeoutError =
      timeoutSignal.didTimeout() ||
      (error instanceof Error &&
        (error.name === "AbortError" ||
          error.name === "TimeoutError" ||
          (error as Error & { code?: unknown }).code === "ECONNABORTED"));

    throw new ProviderRequestError(
      isTimeoutError ? 504 : 502,
      error instanceof Error ? `SignPath request failed: ${error.message}` : "SignPath request failed",
    );
  } finally {
    timeoutSignal.cleanup();
  }
}

function buildSignpathHeaders(apiKey: string, body?: BodyInit) {
  return {
    authorization: `Bearer ${apiKey}`,
    accept: "application/json",
    ...(body instanceof FormData ? {} : { "content-type": "application/json" }),
    "user-agent": providerUserAgent,
  };
}

function buildSignpathUrl(input: SignpathRequestInput) {
  const url = new URL(`./${encodeURIComponent(input.organizationId)}${input.path}`, `${signpathApiBaseUrl}/`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value === undefined) {
      continue;
    }
    url.searchParams.set(key, value);
  }
  return url;
}

async function readSignpathPayload(response: Response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (contentType.includes("application/problem+json") || contentType.includes("application/json")) {
      throw new ProviderRequestError(502, "SignPath returned invalid JSON");
    }
    return text;
  }
}

function createSignpathError(status: number, payload: unknown, phase: SignpathPhase) {
  const message = extractSignpathErrorMessage(payload) ?? `SignPath request failed with ${status}`;

  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message);
  }

  if (status === 404) {
    return new ProviderRequestError(404, message);
  }

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }

  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message);
  }

  return new ProviderRequestError(status || 502, message);
}

function extractSignpathErrorMessage(payload: unknown) {
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    return trimmed || undefined;
  }

  const record = optionalRecord(payload);
  return (
    optionalString(record?.detail) ??
    optionalString(record?.title) ??
    optionalString(record?.message) ??
    optionalString(record?.error)
  );
}

function requireOrganizationId(value: string | undefined) {
  const organizationId = value?.trim();
  if (!organizationId) {
    throw new ProviderRequestError(400, "organizationId is required");
  }
  return organizationId;
}

function readOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function readRequiredString(value: unknown, fieldName: string) {
  const normalized = readOptionalString(value);
  if (!normalized) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return normalized;
}

function readRequiredUuidLikeString(value: unknown, fieldName: string) {
  const normalized = readRequiredString(value, fieldName);
  if (!isUuidLike(normalized)) {
    throw new ProviderRequestError(400, `${fieldName} must be a valid UUID`);
  }
  return normalized;
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function readSigningPolicies(payload: Record<string, unknown>) {
  const policies = payload.signingPolicies;
  if (!Array.isArray(policies)) {
    throw new ProviderRequestError(502, "SignPath signingPolicies response is invalid");
  }

  return policies.map((item) => {
    const record = optionalRecord(item);
    if (!record) {
      throw new ProviderRequestError(502, "SignPath signing policy entry is invalid");
    }

    return compactObject({
      signingPolicyId: readRequiredUuidLikeString(record.signingPolicyId, "signingPolicyId"),
      signingPolicySlug: readRequiredString(record.signingPolicySlug, "signingPolicySlug"),
      projectSlug: readRequiredString(record.projectSlug, "projectSlug"),
      keyType: readRequiredString(record.keyType, "keyType"),
      keySizeInBits: readOptionalPositiveInteger(record.keySizeInBits),
      rsaParameters: optionalRecord(record.rsaParameters),
      certificateBytes: readOptionalString(record.certificateBytes),
      publicKeyBytes: readOptionalString(record.publicKeyBytes),
    });
  });
}

function normalizeSigningRequest(signingRequestId: string, payload: Record<string, unknown>) {
  return compactObject({
    id: signingRequestId,
    status: readRequiredString(payload.status, "status"),
    isFinalStatus: readRequiredBoolean(payload.isFinalStatus, "isFinalStatus"),
    workflowStatus: readRequiredString(payload.workflowStatus, "workflowStatus"),
    description: readOptionalString(payload.description),
    projectId: readOptionalUuidLikeString(payload.projectId),
    projectSlug: readOptionalString(payload.projectSlug),
    projectName: readOptionalString(payload.projectName),
    artifactConfigurationId: readOptionalUuidLikeString(payload.artifactConfigurationId),
    artifactConfigurationSlug: readOptionalString(payload.artifactConfigurationSlug),
    artifactConfigurationName: readOptionalString(payload.artifactConfigurationName),
    signingPolicyId: readOptionalUuidLikeString(payload.signingPolicyId),
    signingPolicySlug: readOptionalString(payload.signingPolicySlug),
    signingPolicyName: readOptionalString(payload.signingPolicyName),
    unsignedArtifactLink: readOptionalString(payload.unsignedArtifactLink),
    signedArtifactLink: readOptionalString(payload.signedArtifactLink),
    origin: optionalRecord(payload.origin),
    parameters: optionalRecord(payload.parameters),
  });
}

function normalizeFastSignHashResponse(payload: Record<string, unknown>) {
  return compactObject({
    signingRequestId: readRequiredUuidLikeString(payload.SigningRequestId, "SigningRequestId"),
    webLink: readRequiredString(payload.WebLink, "WebLink"),
    signature: readRequiredString(payload.Signature, "Signature"),
    signatureAlgorithm: readRequiredString(payload.SignatureAlgorithm, "SignatureAlgorithm"),
    rsaHashAlgorithm: readOptionalString(payload.RsaHashAlgorithm),
    base64EncodedHash: readRequiredString(payload.Base64EncodedHash, "Base64EncodedHash"),
    metadata: optionalRecord(payload.Metadata),
  });
}

function buildFastSignHashFormData(input: Record<string, unknown>) {
  const formData = new FormData();
  formData.set("projectSlug", readRequiredString(input.projectSlug, "projectSlug"));
  formData.set("signingPolicySlug", readRequiredString(input.signingPolicySlug, "signingPolicySlug"));

  const description = readOptionalString(input.description);
  if (description) {
    formData.set("description", description);
  }

  formData.set("IsFastSigningRequest", "true");
  formData.set(
    "artifact",
    new File([JSON.stringify(buildHashPayload(input))], "payload.json", {
      type: "application/json",
    }),
  );
  return formData;
}

function buildHashPayload(input: Record<string, unknown>) {
  const signatureAlgorithm = readRequiredString(input.signatureAlgorithm, "signatureAlgorithm");
  const payload = compactObject({
    SignatureAlgorithm: signatureAlgorithm,
    RsaHashAlgorithm: readOptionalString(input.rsaHashAlgorithm),
    EcdsaSignatureFormat: readOptionalString(input.ecdsaSignatureFormat),
    Base64EncodedHash: readRequiredString(input.base64EncodedHash, "base64EncodedHash"),
    Metadata: optionalRecord(input.metadata),
  });

  if ((signatureAlgorithm === "RsaPkcs1" || signatureAlgorithm === "RsaPss") && !payload.RsaHashAlgorithm) {
    throw new ProviderRequestError(400, "rsaHashAlgorithm is required for RSA signature algorithms");
  }

  return payload;
}

function readOptionalPositiveInteger(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return undefined;
  }
  return value;
}

function readOptionalUuidLikeString(value: unknown) {
  const normalized = readOptionalString(value);
  if (!normalized) {
    return undefined;
  }
  return isUuidLike(normalized) ? normalized : undefined;
}

function readRequiredBoolean(value: unknown, fieldName: string) {
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(502, `${fieldName} is missing from the SignPath response`);
  }
  return value;
}
