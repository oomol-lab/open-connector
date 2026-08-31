import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import {
  optionalNumber,
  nullableString,
  optionalRecord,
  optionalString,
  compactObject,
  optionalBoolean,
  recordOrEmpty,
} from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import { providerUserAgent, ProviderRequestError, runProviderRequest } from "../provider-runtime.ts";

const deepgramApiBaseUrl = "https://api.deepgram.com/v1";

type DeepgramPhase = "validate" | "execute";
type DeepgramActionHandler = (
  input: Record<string, unknown>,
  fetcher: typeof fetch,
  apiKey: string,
) => Promise<unknown>;

export const deepgramActionHandlers: ProviderActionHandlers<"deepgram", DeepgramActionHandler> = {
  async list_projects(_input, fetcher, apiKey) {
    const payload = await requestDeepgramJson({
      path: "/projects",
      method: "GET",
      apiKey,
      fetcher,
      phase: "execute",
    });

    return normalizeProjectList(payload);
  },
  async get_project(input, fetcher, apiKey) {
    const payload = await requestDeepgramJson({
      path: `/projects/${encodePathSegment(readRequiredString(input.projectId, "projectId"))}`,
      method: "GET",
      apiKey,
      fetcher,
      phase: "execute",
    });

    return {
      project: normalizeProject(payload),
    };
  },
  async list_project_keys(input, fetcher, apiKey) {
    const payload = await requestDeepgramJson({
      path: `/projects/${encodePathSegment(readRequiredString(input.projectId, "projectId"))}/keys`,
      method: "GET",
      apiKey,
      params: compactObject({
        status: readOptionalEnum(input.status, ["active", "expired"]),
      }),
      fetcher,
      phase: "execute",
    });

    return normalizeProjectKeys(payload);
  },
  async list_project_balances(input, fetcher, apiKey) {
    const payload = await requestDeepgramJson({
      path: `/projects/${encodePathSegment(readRequiredString(input.projectId, "projectId"))}/balances`,
      method: "GET",
      apiKey,
      fetcher,
      phase: "execute",
    });

    return normalizeProjectBalances(payload);
  },
  async list_models(input, fetcher, apiKey) {
    const payload = await requestDeepgramJson({
      path: "/models",
      method: "GET",
      apiKey,
      params: buildIncludeOutdatedParams(input),
      fetcher,
      phase: "execute",
    });

    return normalizeModelList(payload);
  },
  async get_model(input, fetcher, apiKey) {
    const payload = await requestDeepgramJson({
      path: `/models/${encodePathSegment(readRequiredString(input.modelId, "modelId"))}`,
      method: "GET",
      apiKey,
      fetcher,
      phase: "execute",
    });

    return {
      model: normalizeModel(payload),
    };
  },
  async list_project_models(input, fetcher, apiKey) {
    const payload = await requestDeepgramJson({
      path: `/projects/${encodePathSegment(readRequiredString(input.projectId, "projectId"))}/models`,
      method: "GET",
      apiKey,
      params: buildIncludeOutdatedParams(input),
      fetcher,
      phase: "execute",
    });

    return normalizeModelList(payload);
  },
  async get_project_model(input, fetcher, apiKey) {
    const payload = await requestDeepgramJson({
      path: `/projects/${encodePathSegment(readRequiredString(input.projectId, "projectId"))}/models/${encodePathSegment(readRequiredString(input.modelId, "modelId"))}`,
      method: "GET",
      apiKey,
      fetcher,
      phase: "execute",
    });

    return {
      model: normalizeModel(payload),
    };
  },
};

export async function validateDeepgramCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const payload = await requestDeepgramJson({
    path: "/projects",
    method: "GET",
    apiKey: input.apiKey,
    fetcher,
    phase: "validate",
  });

  const result = normalizeProjectList(payload);
  const firstProject = result.projects[0];

  return {
    profile: {
      accountId: optionalString(firstProject?.project_id) ?? "api_key",
      displayName: optionalString(firstProject?.name) ?? "Deepgram API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: "/projects",
      firstProjectId: optionalString(firstProject?.project_id),
      firstProjectName: optionalString(firstProject?.name),
    }),
  };
}

async function requestDeepgramJson(input: {
  path: string;
  method: "GET";
  apiKey: string;
  params?: Record<string, string | undefined>;
  fetcher: typeof fetch;
  phase: DeepgramPhase;
}) {
  return runProviderRequest({ label: "Deepgram" }, async (signal) => {
    const response = await input.fetcher(buildDeepgramUrl(input), {
      method: input.method,
      headers: buildDeepgramHeaders(input.apiKey),
      signal,
    });
    const payload = await readDeepgramPayload(response);

    if (!response.ok) {
      throw createDeepgramError(response.status, payload, input.phase);
    }

    return payload;
  });
}

function buildDeepgramHeaders(apiKey: string) {
  return {
    accept: "application/json",
    authorization: `Token ${apiKey}`,
    "user-agent": providerUserAgent,
  };
}

function buildDeepgramUrl(input: { path: string; params?: Record<string, string | undefined> }) {
  const normalizedPath = input.path.startsWith("/") ? input.path.slice(1) : input.path;
  const url = new URL(normalizedPath, `${deepgramApiBaseUrl}/`);

  for (const [key, value] of Object.entries(input.params ?? {})) {
    if (value === undefined) {
      continue;
    }
    url.searchParams.set(key, value);
  }

  return url;
}

async function readDeepgramPayload(response: Response) {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Deepgram returned invalid JSON");
  }
}

function createDeepgramError(status: number, payload: unknown, phase: DeepgramPhase) {
  const message = extractDeepgramErrorMessage(payload) ?? `Deepgram request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }

  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message);
  }

  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(409, message);
  }

  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message);
  }

  return new ProviderRequestError(status || 500, message);
}

function extractDeepgramErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const directMessage = optionalString(record.message)?.trim();
  if (directMessage) {
    return directMessage;
  }

  const directErrMsg = optionalString(record.err_msg)?.trim();
  if (directErrMsg) {
    return directErrMsg;
  }

  const directError = optionalString(record.error)?.trim();
  if (directError) {
    return directError;
  }

  return optionalString(record.detail)?.trim();
}

function buildIncludeOutdatedParams(input: Record<string, unknown>) {
  const includeOutdated = optionalBoolean(input.includeOutdated);
  return compactObject({
    include_outdated: includeOutdated === undefined ? undefined : String(includeOutdated),
  });
}

function normalizeProjectList(payload: unknown) {
  const payloadRecord = optionalRecord(payload);
  return {
    projects: normalizeProjectSummaryArray(payloadRecord?.projects),
    raw: recordOrEmpty(payload),
  };
}

function normalizeProject(payload: unknown) {
  const record = optionalRecord(payload);
  return {
    project_id: readNullableString(record?.project_id),
    name: readNullableString(record?.name),
    mip_opt_out: readNullableBoolean(record?.mip_opt_out),
  };
}

function normalizeProjectKeys(payload: unknown) {
  const payloadRecord = optionalRecord(payload);
  return {
    apiKeys: normalizeProjectKeyArray(payloadRecord?.api_keys),
    raw: recordOrEmpty(payload),
  };
}

function normalizeProjectBalances(payload: unknown) {
  const payloadRecord = optionalRecord(payload);
  return {
    balances: normalizeBalanceArray(payloadRecord?.balances),
    raw: recordOrEmpty(payload),
  };
}

function normalizeModelList(payload: unknown) {
  const payloadRecord = optionalRecord(payload);
  return {
    stt: normalizeModelArray(payloadRecord?.stt),
    tts: normalizeModelArray(payloadRecord?.tts),
    raw: recordOrEmpty(payload),
  };
}

function normalizeProjectSummaryArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    const record = optionalRecord(item);
    return {
      project_id: readNullableString(record?.project_id),
      name: readNullableString(record?.name),
    };
  });
}

function normalizeProjectKeyArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    const record = optionalRecord(item);
    const member = optionalRecord(record?.member);
    const apiKey = optionalRecord(record?.api_key);

    return {
      member: {
        member_id: readNullableString(member?.member_id),
        email: readNullableString(member?.email),
      },
      api_key: {
        api_key_id: readNullableString(apiKey?.api_key_id),
        comment: readNullableString(apiKey?.comment),
        scopes: normalizeStringArray(apiKey?.scopes),
        created: readNullableString(apiKey?.created),
      },
    };
  });
}

function normalizeBalanceArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    const record = optionalRecord(item);
    return {
      balance_id: readNullableString(record?.balance_id),
      amount: readNullableNumber(record?.amount),
      units: readNullableString(record?.units),
      purchase_order_id: readNullableString(record?.purchase_order_id),
    };
  });
}

function normalizeModelArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const flattened = value.flatMap((item) => (Array.isArray(item) ? item : [item]));
  return flattened.map((item) => normalizeModel(item));
}

function normalizeModel(value: unknown) {
  const record = optionalRecord(value);
  const metadata = optionalRecord(record?.metadata);

  return {
    name: readNullableString(record?.name),
    canonical_name: readNullableString(record?.canonical_name),
    architecture: readNullableString(record?.architecture),
    languages: normalizeStringArray(record?.languages),
    version: readNullableString(record?.version),
    uuid: readNullableString(record?.uuid),
    batch: readNullableBoolean(record?.batch),
    streaming: readNullableBoolean(record?.streaming),
    formatted_output: readNullableBoolean(record?.formatted_output),
    metadata: metadata
      ? {
          accent: readNullableString(metadata.accent),
          age: readNullableString(metadata.age),
          color: readNullableString(metadata.color),
          display_name: readNullableString(metadata.display_name),
          image: readNullableString(metadata.image),
          sample: readNullableString(metadata.sample),
          tags: normalizeStringArray(metadata.tags),
          use_cases: normalizeStringArray(metadata.use_cases),
        }
      : null,
  };
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (typeof item !== "string") {
      return [];
    }
    return [item];
  });
}

function readRequiredString(value: unknown, fieldName: string) {
  const trimmed = optionalString(value)?.trim();
  if (!trimmed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return trimmed;
}

function readOptionalEnum<const T extends string>(value: unknown, allowed: readonly T[]) {
  const trimmed = optionalString(value)?.trim();
  if (!trimmed) {
    return undefined;
  }
  return allowed.includes(trimmed as T) ? trimmed : undefined;
}

function readNullableString(value: unknown) {
  return nullableString(value) ?? null;
}

function readNullableNumber(value: unknown) {
  return optionalNumber(value) ?? null;
}

function readNullableBoolean(value: unknown) {
  if (value === null) {
    return null;
  }
  const parsed = optionalBoolean(value);
  return parsed ?? null;
}
