import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import {
  optionalNumber,
  optionalRecord,
  optionalString,
  compactObject,
  optionalInteger,
  optionalBoolean,
} from "../../core/cast.ts";
import { createProviderTimeout, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const datascopeApiBaseUrl = "https://www.mydatascope.com/api/external/";

type DatascopeRequestPhase = "validate" | "execute";
type DatascopeQueryValue = string | number | boolean | undefined;
type DatascopeActionHandler = (
  input: Record<string, unknown>,
  context: { apiKey: string; fetcher: typeof fetch },
) => Promise<unknown>;

const answerReservedKeys = new Set([
  "form_id",
  "form_name",
  "form_answer_id",
  "code",
  "form_code",
  "form_state",
  "created_at",
  "updated_at",
  "user_name",
  "user_identifier",
  "latitude",
  "longitude",
  "answers",
  "finished",
  "assign_id",
  "assign_internal_id",
  "assign_location_name",
  "assign_location_description",
  "assign_location_code",
]);

export const datascopeActionHandlers: ProviderActionHandlers<"datascope", DatascopeActionHandler> = {
  async list_answers(input, context) {
    const payload = await requestDatascopeJson({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      path: "v2/answers",
      phase: "execute",
      query: buildAnswersQuery(input, { includeDateModified: true, includePagination: true }),
    });

    return {
      answers: requireArray(payload, "/v2/answers").map((item) => normalizeDatascopeAnswer(item)),
    };
  },
  async list_answers_with_full_metadata(input, context) {
    const payload = await requestDatascopeJson({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      path: "answers",
      phase: "execute",
      query: buildAnswersQuery(input, { includeDateModified: false, includePagination: false }),
    });

    return {
      answers: requireArray(payload, "/answers").map((item) => normalizeDatascopeAnswerWithMetadata(item)),
    };
  },
  async list_locations(_input, context) {
    const payload = await requestDatascopeJson({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      path: "locations",
      phase: "execute",
    });

    return {
      locations: requireArray(payload, "/locations").map((item) => normalizeDatascopeLocation(item)),
    };
  },
  async create_location(input, context) {
    const payload = await requestDatascopeJson({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      path: "locations",
      phase: "execute",
      method: "POST",
      json: {
        location: buildLocationPayload(input),
      },
    });

    return {
      location: normalizeDatascopeLocation(payload),
    };
  },
  async update_location(input, context) {
    const locationId = requirePositiveInteger(input.locationId, "locationId");
    const payload = await requestDatascopeJson({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      path: `locations/${locationId}`,
      phase: "execute",
      method: "POST",
      json: {
        location: buildLocationPayload(input),
      },
    });

    return {
      location: normalizeDatascopeLocation(payload),
    };
  },
  async list_list_elements(input, context) {
    const metadataType = requireNonEmptyString(input.metadataType, "metadataType");
    const payload = await requestDatascopeJson({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      path: "metadata_objects",
      phase: "execute",
      query: {
        metadata_type: metadataType,
      },
    });

    return {
      elements: requireArray(payload, "/metadata_objects").map((item) => normalizeDatascopeListElement(item)),
    };
  },
  async get_list_element(input, context) {
    const metadataType = requireNonEmptyString(input.metadataType, "metadataType");
    const elementId = requirePositiveInteger(input.elementId, "elementId");
    const payload = await requestDatascopeJson({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      path: "metadata_object",
      phase: "execute",
      query: {
        metadata_type: metadataType,
        metadata_id: elementId,
      },
    });

    return {
      element: normalizeDatascopeListElement(payload),
    };
  },
  async create_list_element(input, context) {
    const metadataType = requireNonEmptyString(input.metadataType, "metadataType");
    const payload = await requestDatascopeJson({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      path: "metadata_object",
      phase: "execute",
      method: "POST",
      query: {
        metadata_type: metadataType,
      },
      json: {
        list_object: buildListObjectPayload(input),
      },
    });

    return {
      element: normalizeDatascopeListElement(payload, { metadataType }),
    };
  },
  async update_list_element(input, context) {
    const elementId = requirePositiveInteger(input.elementId, "elementId");
    const payload = await requestDatascopeJson({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      path: `metadata_object/${elementId}`,
      phase: "execute",
      method: "POST",
      json: {
        list_object: buildListObjectPayload(input),
      },
    });

    return {
      element: normalizeDatascopeListElement(payload),
    };
  },
};

export async function validateDatascopeCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const apiKey = input.apiKey;
  await requestDatascopeJson({
    apiKey,
    fetcher,
    path: "locations",
    phase: "validate",
  });

  return {
    profile: {
      accountId: "datascope",
      displayName: "DataScope API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: "https://www.mydatascope.com/api/external",
      validationEndpoint: "/locations",
    },
  };
}

async function requestDatascopeJson(input: {
  apiKey: string;
  fetcher: typeof fetch;
  path: string;
  phase: DatascopeRequestPhase;
  method?: "GET" | "POST";
  query?: Record<string, DatascopeQueryValue>;
  json?: Record<string, unknown>;
}) {
  const url = new URL(input.path, datascopeApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const headers = new Headers({
    Accept: "application/json",
    Authorization: input.apiKey,
    "User-Agent": providerUserAgent,
  });

  let body: string | undefined;
  if (input.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(input.json);
  }

  const timeoutHandle = createProviderTimeout(undefined);

  let response: Response;
  try {
    response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers,
      body,
      signal: timeoutHandle.signal,
    });
  } catch (error) {
    if (timeoutHandle.didTimeout()) {
      throw new ProviderRequestError(504, `DataScope ${input.path} request timed out after 30 seconds`);
    }

    const message = error instanceof Error ? error.message : "DataScope request failed";
    throw new ProviderRequestError(502, message || "DataScope request failed");
  } finally {
    timeoutHandle.cleanup();
  }

  const payload = await readDatascopePayload(response);
  if (!response.ok) {
    throw createDatascopeHttpError(response.status, payload, input.phase);
  }

  return payload;
}

async function readDatascopePayload(response: Response) {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "DataScope returned a non-JSON response");
  }
}

function createDatascopeHttpError(status: number, payload: unknown, phase: DatascopeRequestPhase) {
  const message = readDatascopeErrorMessage(payload) ?? "DataScope request failed";

  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message);
  }

  if (status === 400 || status === 422) {
    return new ProviderRequestError(400, message);
  }

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }

  return new ProviderRequestError(status || 500, message);
}

function readDatascopeErrorMessage(payload: unknown) {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return (
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.detail) ??
    readFirstString(record.errors)
  );
}

function readFirstString(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  for (const item of value) {
    if (typeof item === "string" && item) {
      return item;
    }
  }

  return undefined;
}

function buildAnswersQuery(
  input: Record<string, unknown>,
  options: { includeDateModified: boolean; includePagination: boolean },
) {
  return compactObject({
    form_id: optionalInteger(input.formId),
    user_id: optionalInteger(input.userId),
    location_id: optionalInteger(input.locationId),
    start: optionalString(input.startAt),
    end: optionalString(input.endAt),
    date_modified: options.includeDateModified ? optionalBoolean(input.dateModified) : undefined,
    limit: options.includePagination ? optionalInteger(input.limit) : undefined,
    offset: options.includePagination ? optionalInteger(input.offset) : undefined,
  });
}

function buildLocationPayload(input: Record<string, unknown>) {
  return compactObject({
    code: optionalString(input.code),
    name: optionalString(input.name),
    description: optionalString(input.description),
    address: optionalString(input.address),
    city: optionalString(input.city),
    country: optionalString(input.country),
    region: optionalString(input.region),
    latitude: optionalNumber(input.latitude),
    longitude: optionalNumber(input.longitude),
    phone: optionalString(input.phone),
    email: optionalString(input.email),
    company_code: optionalString(input.companyCode),
    company_name: optionalString(input.companyName),
  });
}

function buildListObjectPayload(input: Record<string, unknown>) {
  return compactObject({
    code: optionalString(input.code),
    name: optionalString(input.name),
    description: optionalString(input.description),
    attribute1: optionalString(input.attribute1),
    attribute2: optionalString(input.attribute2),
  });
}

function requireArray(value: unknown, path: string) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `malformed DataScope response at ${path}`);
  }

  return value;
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `malformed DataScope response at ${label}`);
  }
  return record;
}

function normalizeDatascopeAnswer(value: unknown) {
  const record = requireObject(value, "answer");
  return {
    formId: requirePositiveInteger(record.form_id, "form_id"),
    formAnswerId: requirePositiveInteger(record.form_answer_id, "form_answer_id"),
    answers: extractDynamicAnswers(record),
    ...compactObject({
      formCode: optionalString(record.form_code) ?? optionalString(record.code),
      formName: optionalString(record.form_name),
      formState: optionalString(record.form_state),
      userName: optionalString(record.user_name),
      userIdentifier: optionalString(record.user_identifier),
      createdAt: optionalString(record.created_at),
      latitude: optionalNumber(record.latitude),
      longitude: optionalNumber(record.longitude),
    }),
  };
}

function normalizeDatascopeAnswerWithMetadata(value: unknown) {
  const record = requireObject(value, "answer");
  const rawQuestions = Array.isArray(record.answers) ? record.answers : [];

  return {
    formId: requirePositiveInteger(record.form_id, "form_id"),
    formAnswerId: requirePositiveInteger(record.form_answer_id, "form_answer_id"),
    questions: rawQuestions.map((item) => normalizeDatascopeAnswerQuestion(item)),
    ...compactObject({
      formCode: optionalString(record.form_code) ?? optionalString(record.code),
      formName: optionalString(record.form_name),
      formState: optionalString(record.form_state),
      userName: optionalString(record.user_name),
      userIdentifier: optionalString(record.user_identifier),
      createdAt: optionalString(record.created_at),
      updatedAt: optionalString(record.updated_at),
      latitude: optionalNumber(record.latitude),
      longitude: optionalNumber(record.longitude),
      finished: optionalBoolean(record.finished),
      assignId: readOptionalIntegerOrString(record.assign_id),
      assignInternalId: readOptionalIntegerOrString(record.assign_internal_id),
      assignLocationName: optionalString(record.assign_location_name),
      assignLocationDescription: optionalString(record.assign_location_description),
      assignLocationCode: optionalString(record.assign_location_code),
    }),
  };
}

function normalizeDatascopeAnswerQuestion(value: unknown) {
  const record = requireObject(value, "answer question");
  return compactObject({
    formId: optionalInteger(record.form_id),
    formAnswerId: optionalInteger(record.form_answer_id),
    formCode: optionalString(record.form_code) ?? optionalString(record.code),
    formState: optionalString(record.form_state),
    questionId: optionalInteger(record.question_id),
    questionName: optionalString(record.question_name),
    name: optionalString(record.name),
    questionValue: record.question_value,
    questionType: optionalString(record.question_type),
    subformIndex: optionalInteger(record.subform_index),
    metadataType: optionalString(record.metadata_type),
    metadataId: optionalInteger(record.metadata_id),
  });
}

function normalizeDatascopeLocation(value: unknown) {
  const record = requireObject(value, "location");
  return compactObject({
    id: requirePositiveInteger(record.id, "id"),
    name: requireNonEmptyString(record.name, "name"),
    code: optionalString(record.code),
    description: optionalString(record.description),
    address: optionalString(record.address),
    city: optionalString(record.city),
    country: optionalString(record.country),
    region: optionalString(record.region),
    latitude: optionalNumber(record.latitude),
    longitude: optionalNumber(record.longitude),
    phone: optionalString(record.phone),
    email: optionalString(record.email),
    companyCode: optionalString(record.company_code),
    companyName: optionalString(record.company_name),
  });
}

function normalizeDatascopeListElement(
  value: unknown,
  fallback?: {
    metadataType?: string;
  },
) {
  const record = requireObject(value, "list element");
  return compactObject({
    id: requirePositiveInteger(record.id, "id"),
    name: requireNonEmptyString(record.name, "name"),
    metadataType: optionalString(record.metadata_type) ?? fallback?.metadataType,
    code: optionalString(record.code),
    description: optionalString(record.description),
    attribute1: optionalString(record.attribute1),
    attribute2: optionalString(record.attribute2),
    listId: optionalInteger(record.list_id),
    accountId: optionalInteger(record.account_id),
    createdAt: optionalString(record.created_at),
    updatedAt: optionalString(record.updated_at),
  });
}

function extractDynamicAnswers(record: Record<string, unknown>) {
  const answers: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    if (answerReservedKeys.has(key)) {
      continue;
    }
    answers[key] = value;
  }

  return answers;
}

function readOptionalIntegerOrString(value: unknown) {
  const intValue = optionalInteger(value);
  if (intValue !== undefined) {
    return intValue;
  }

  return optionalString(value);
}

function requirePositiveInteger(value: unknown, fieldName: string) {
  const parsed = optionalInteger(value);
  if (parsed == null || parsed <= 0) {
    throw new ProviderRequestError(502, `DataScope response missing ${fieldName}`);
  }

  return parsed;
}

function requireNonEmptyString(value: unknown, fieldName: string) {
  const parsed = optionalString(value)?.trim();
  if (!parsed) {
    throw new ProviderRequestError(502, `DataScope response missing ${fieldName}`);
  }

  return parsed;
}
