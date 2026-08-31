import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { createProviderTimeout, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const qingflowApiBaseUrl = "https://api.qingflow.com";

const qingflowValidationPath = "/app";

type QingflowRequestPhase = "validate" | "execute";
type QingflowActionContext = { accessToken: string; fetcher: typeof fetch };
type QingflowActionHandler = (input: Record<string, unknown>, context: QingflowActionContext) => Promise<unknown>;

export const qingflowActionHandlers: ProviderActionHandlers<"qingflow", QingflowActionHandler> = {
  list_apps(input, context) {
    if (input.favoritesOnly === true && !optionalString(input.userId)?.trim()) {
      throw new ProviderRequestError(400, "userId is required when favoritesOnly is true");
    }
    return listQingflowApps(input, context, "execute");
  },
  async get_form(input, context) {
    const envelope = await requestQingflowEnvelope({
      path: `/app/${encodeURIComponent(String(input.appKey))}/form`,
      headers: qingflowUserHeaders(input),
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      phase: "execute",
    });
    return {
      form: requireQingflowObject(envelope.result, "form"),
      questionRelations: requireQingflowObjectArray(envelope.questionRelations, "form questionRelations"),
    };
  },
  async list_records(input, context) {
    if (input.type === 1 && !optionalString(input.userId)?.trim()) {
      throw new ProviderRequestError(400, "userId is required when type is 1");
    }
    const result = await requestQingflowResult({
      path: `/app/${encodeURIComponent(String(input.appKey))}/apply/filter`,
      method: "POST",
      body: {
        pageNum: optionalInteger(input.pageNumber) ?? 1,
        pageSize: optionalInteger(input.pageSize) ?? 50,
        ...compactObject({
          type: optionalInteger(input.type),
          sorts: input.sorts,
          queriesRel: optionalString(input.queriesRelation),
          queries: input.queries,
          queryKey: optionalString(input.queryKey),
          applyIds: input.applyIds,
        }),
      },
      headers: qingflowUserHeaders(input),
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      phase: "execute",
    });
    return normalizeQingflowPage(result, "record page");
  },
  async get_record(input, context) {
    const result = await requestQingflowResult({
      path: `/${encodeURIComponent(String(input.appKey))}/apply/${encodeURIComponent(String(input.applyId))}`,
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      phase: "execute",
    });
    return { record: requireQingflowObject(result, "record") };
  },
  async create_record(input, context) {
    const result = await requestQingflowResult({
      path: `/app/${encodeURIComponent(String(input.appKey))}/apply`,
      method: "POST",
      body: compactObject({
        applyUser: optionalRecord(input.applyUser),
        answers: input.answers,
      }),
      headers: qingflowUserHeaders(input),
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      phase: "execute",
    });
    return normalizeQingflowMutation(result, "record creation");
  },
  async update_record(input, context) {
    const result = await requestQingflowResult({
      path: `/${encodeURIComponent(String(input.appKey))}/apply/${encodeURIComponent(String(input.applyId))}`,
      method: "POST",
      body: { answers: input.answers },
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      phase: "execute",
    });
    return normalizeQingflowMutation(result, "record update");
  },
  async get_operation_result(input, context) {
    const envelope = await requestQingflowEnvelope({
      path: `/operation/${encodeURIComponent(String(input.requestId))}`,
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      phase: "execute",
    });
    return compactObject({
      result: envelope.result,
      memberInfo: envelope.memberInfo,
      successUsers: envelope.successUsers,
      errorUsers: envelope.errorUsers,
    });
  },
  async list_members(input, context) {
    const result = await requestQingflowResult({
      path: "/user",
      query: pageQuery(input),
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      phase: "execute",
    });
    return normalizeQingflowPage(result, "member page");
  },
  async get_member(input, context) {
    const result = await requestQingflowResult({
      path: `/user/${encodeURIComponent(String(input.userId))}`,
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      phase: "execute",
    });
    return { member: requireQingflowObject(result, "member") };
  },
  async find_members(input, context) {
    if (!optionalString(input.email)?.trim() && !optionalString(input.mobile)?.trim()) {
      throw new ProviderRequestError(400, "email or mobile is required");
    }
    const result = await requestQingflowResult({
      path: "/user/getId",
      query: compactObject({
        email: optionalString(input.email),
        mobile: optionalString(input.mobile),
      }),
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      phase: "execute",
    });
    return normalizeQingflowCollection(result, undefined, "member lookup");
  },
  async list_departments(input, context) {
    const result = await requestQingflowResult({
      path: "/department",
      query: compactObject({ deptId: input.departmentId }),
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      phase: "execute",
    });
    return normalizeQingflowCollection(result, "department", "department list");
  },
  async get_department(input, context) {
    const result = await requestQingflowResult({
      path: `/department/${encodeURIComponent(String(input.departmentId))}`,
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      phase: "execute",
    });
    return { department: requireQingflowObject(result, "department") };
  },
  async list_roles(_input, context) {
    const result = await requestQingflowResult({
      path: "/role",
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      phase: "execute",
    });
    return normalizeQingflowCollection(result, "role", "role list");
  },
  async list_record_comments(input, context) {
    const result = await requestQingflowResult({
      path: recordPath(input, "/comment"),
      query: pageQuery(input),
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      phase: "execute",
    });
    return normalizeQingflowPage(result, "comment page");
  },
  async add_record_comment(input, context) {
    const result = await requestQingflowResult({
      path: recordPath(input, "/comment"),
      method: "POST",
      body: {
        commentMsg: input.message,
        mentionUserIds: input.mentionUserIds ?? [],
      },
      headers: qingflowUserHeaders(input),
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      phase: "execute",
    });
    return { comment: requireQingflowObject(result, "created comment") };
  },
  async list_workflow_logs(input, context) {
    const result = await requestQingflowResult({
      path: `/${encodeURIComponent(String(input.appKey))}/${encodeURIComponent(String(input.applyId))}/workflowNodeRecord`,
      query: pageQuery(input),
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      phase: "execute",
    });
    return normalizeQingflowPage(result, "workflow log page");
  },
  async list_record_change_logs(input, context) {
    const result = await requestQingflowResult({
      path: `/${encodeURIComponent(String(input.appKey))}/${encodeURIComponent(String(input.applyId))}/rowrecord/log`,
      method: "POST",
      body: compactObject({
        fieldId: optionalInteger(input.fieldId),
        pageNum: optionalInteger(input.pageNumber) ?? 1,
        pageSize: optionalInteger(input.pageSize) ?? 50,
      }),
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      phase: "execute",
    });
    return normalizeQingflowPage(result, "record change log page");
  },
  async process_record(input, context) {
    if (input.answers !== undefined && input.decision !== "approve" && input.decision !== "reject") {
      throw new ProviderRequestError(400, "answers are only supported for approve or reject decisions");
    }
    const result = await requestQingflowResult({
      path: `/${encodeURIComponent(String(input.appKey))}/${encodeURIComponent(String(input.applyId))}/audit`,
      method: "POST",
      body: compactObject({
        auditResult: qingflowAuditResultByDecision[String(input.decision)],
        auditNodeId: input.auditNodeId,
        auditFeedback: optionalString(input.feedback),
        answers: input.answers,
      }),
      headers: qingflowUserHeaders(input),
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      phase: "execute",
    });
    return { success: normalizeQingflowBoolean(result, "workflow command") };
  },
  async urge_record(input, context) {
    const result = await requestQingflowResult({
      path: recordPath(input, "/urge"),
      method: "POST",
      headers: qingflowUserHeaders(input),
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      phase: "execute",
    });
    return { applyId: requireQingflowResultId(result, "applyId") };
  },
  async reassign_record(input, context) {
    const result = await requestQingflowResult({
      path: recordPath(input, "/reassign"),
      method: "POST",
      body: {
        reassignmentInfo: (input.reassignments as Record<string, unknown>[]).map((item) => ({
          auditNodeId: item.auditNodeId,
          userIdList: item.userIds,
        })),
      },
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      phase: "execute",
    });
    return { applyId: requireQingflowResultId(result, "applyId") };
  },
  async rollback_record(input, context) {
    await requestQingflowResult({
      path: `/${encodeURIComponent(String(input.appKey))}/${encodeURIComponent(String(input.applyId))}/audit/rollback`,
      method: "POST",
      body: compactObject({
        userId: input.userId,
        auditNodeId: input.auditNodeId,
        targetAuditNodeId: input.targetAuditNodeId,
        auditFeedback: optionalString(input.feedback),
      }),
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      phase: "execute",
    });
    return { success: true };
  },
};

export async function validateQingflowCredential(
  accessToken: string,
  fetcher: typeof fetch,
): Promise<{
  accountLabel: string;
  providerScopes: string[];
  providerMetadata: Record<string, unknown>;
}> {
  const apps = await listQingflowApps({}, { accessToken, fetcher }, "validate");
  return {
    accountLabel: "Qingflow Workspace",
    providerScopes: [],
    providerMetadata: {
      apiBaseUrl: qingflowApiBaseUrl,
      validationEndpoint: qingflowValidationPath,
      appCount: apps.totalCount,
    },
  };
}

async function listQingflowApps(
  input: Record<string, unknown>,
  context: QingflowActionContext,
  phase: QingflowRequestPhase,
) {
  const favoritesOnly = optionalBoolean(input.favoritesOnly);
  const result = await requestQingflowResult({
    path: qingflowValidationPath,
    query: compactObject({
      userId: optionalString(input.userId),
      favourite: favoritesOnly === undefined ? undefined : Number(favoritesOnly),
    }),
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    phase,
  });
  const wrapped = optionalRecord(result);
  const items = Array.isArray(result) ? result : Array.isArray(wrapped?.appList) ? wrapped.appList : undefined;
  if (!items || items.some((item) => !optionalRecord(item))) {
    throw new ProviderRequestError(502, "Qingflow app response is invalid");
  }
  return { items, totalCount: items.length };
}

type QingflowRequestInput = {
  path: string;
  method?: string;
  query?: Record<string, unknown>;
  body?: unknown;
  headers?: Record<string, string>;
  accessToken: string;
  fetcher: typeof fetch;
  phase: QingflowRequestPhase;
};

async function requestQingflowResult(input: QingflowRequestInput) {
  return (await requestQingflowEnvelope(input)).result;
}

async function requestQingflowEnvelope(input: QingflowRequestInput) {
  const url = new URL(input.path, qingflowApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const timeout = createProviderTimeout(undefined);
  try {
    const response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        ...input.headers,
        accessToken: input.accessToken,
        ...(input.body === undefined ? {} : { "content-type": "application/json" }),
        "user-agent": providerUserAgent,
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const responseText = await response.text();
    const payload = parseQingflowPayload(responseText);
    if (!response.ok) throw mapQingflowHttpError(response.status, payload, input.phase);
    if (payload === undefined) {
      throw new ProviderRequestError(502, "Qingflow returned invalid JSON");
    }

    const envelope = optionalRecord(payload);
    if (!envelope) {
      throw new ProviderRequestError(502, "Qingflow response is invalid");
    }
    const errorCode = parseQingflowInteger(envelope.errCode ?? envelope.errorCode);
    if (errorCode === undefined) {
      throw new ProviderRequestError(502, "Qingflow response has an invalid error code");
    }
    if (errorCode !== 0) throw mapQingflowApiError(errorCode, envelope, input.phase);
    if (!("result" in envelope)) {
      throw new ProviderRequestError(502, "Qingflow response is missing result");
    }
    return envelope;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout() || isAbortError(error)) {
      throw new ProviderRequestError(504, "Qingflow request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Qingflow request failed: ${error.message}` : "Qingflow request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function normalizeQingflowPage(result: unknown, label: string) {
  const page = requireQingflowObject(result, label);
  if (!Array.isArray(page.result) || page.result.some((item) => !optionalRecord(item))) {
    throw new ProviderRequestError(502, `Qingflow ${label} items are invalid`);
  }
  return {
    items: page.result,
    pageNumber: requireQingflowInteger(page.pageNum, "pageNum"),
    pageSize: requireQingflowInteger(page.pageSize, "pageSize"),
    pageCount: requireQingflowInteger(page.pageAmount, "pageAmount", true),
    totalCount: requireQingflowInteger(page.resultAmount, "resultAmount", true),
  };
}

function normalizeQingflowCollection(result: unknown, key: string | undefined, label: string) {
  const object = optionalRecord(result);
  const items = Array.isArray(result) ? result : key && Array.isArray(object?.[key]) ? object[key] : null;
  if (!items || items.some((item) => !optionalRecord(item))) {
    throw new ProviderRequestError(502, `Qingflow ${label} response is invalid`);
  }
  return { items, totalCount: items.length };
}

function normalizeQingflowMutation(result: unknown, label: string) {
  const mutation = requireQingflowObject(result, label);
  const applyId = optionalQingflowId(mutation.applyId);
  const applyIds = Array.isArray(mutation.applyIds)
    ? mutation.applyIds.map((value) => requireQingflowId(value, "applyIds"))
    : undefined;
  return compactObject({
    requestId: requireQingflowId(mutation.requestId, "requestId"),
    applyId,
    applyIds,
  });
}

function pageQuery(input: Record<string, unknown>) {
  return {
    pageNum: optionalInteger(input.pageNumber) ?? 1,
    pageSize: optionalInteger(input.pageSize) ?? 50,
  };
}

function qingflowUserHeaders(input: Record<string, unknown>) {
  const userId = optionalString(input.userId)?.trim();
  if (!userId) return undefined;
  try {
    return { userId: new Headers({ userId }).get("userId") ?? userId };
  } catch {
    throw new ProviderRequestError(400, "qingflow userId is not a valid header value");
  }
}

function recordPath(input: Record<string, unknown>, suffix: string) {
  return `/${encodeURIComponent(String(input.appKey))}/apply/${encodeURIComponent(String(input.applyId))}${suffix}`;
}

function normalizeQingflowBoolean(result: unknown, label: string) {
  // Some Qingflow workflow endpoints misspell a successful result as "ture".
  if (result === true || result === "true" || result === "ture") return true;
  if (result === false || result === "false") return false;
  throw new ProviderRequestError(502, `Qingflow ${label} response is invalid`);
}

function requireQingflowResultId(result: unknown, field: string) {
  return requireQingflowId(optionalRecord(result)?.[field] ?? result, field);
}

function requireQingflowObject(value: unknown, label: string) {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `Qingflow ${label} response is invalid`);
  }
  return object;
}

function requireQingflowObjectArray(value: unknown, label: string) {
  if (!Array.isArray(value) || value.some((item) => !optionalRecord(item))) {
    throw new ProviderRequestError(502, `Qingflow ${label} response is invalid`);
  }
  return value;
}

function requireQingflowInteger(value: unknown, field: string, allowZero = false) {
  const number = parseQingflowInteger(value);
  if (number === undefined || (allowZero ? number < 0 : number <= 0)) {
    throw new ProviderRequestError(502, `Qingflow response is missing ${field}`);
  }
  return number;
}

function parseQingflowInteger(value: unknown) {
  if (typeof value === "number") return Number.isSafeInteger(value) ? value : undefined;
  if (typeof value !== "string" || !value.trim()) return undefined;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : undefined;
}

function requireQingflowId(value: unknown, field: string) {
  if ((typeof value !== "string" && typeof value !== "number") || String(value).trim() === "") {
    throw new ProviderRequestError(502, `Qingflow response is missing ${field}`);
  }
  return String(value);
}

function optionalQingflowId(value: unknown) {
  return value == null ? undefined : requireQingflowId(value, "applyId");
}

function parseQingflowPayload(text: string) {
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function mapQingflowHttpError(status: number, payload: unknown, phase: QingflowRequestPhase) {
  const message =
    optionalString(optionalRecord(payload)?.errMsg)?.trim() ||
    optionalString(optionalRecord(payload)?.message)?.trim() ||
    `Qingflow request failed with status ${status}`;
  if (status === 429) return new ProviderRequestError(429, message);
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message);
  }
  return new ProviderRequestError(status >= 500 ? status : 502, message);
}

function mapQingflowApiError(errorCode: number, envelope: Record<string, unknown>, phase: QingflowRequestPhase) {
  const message =
    optionalString(envelope.errMsg)?.trim() ||
    optionalString(envelope.message)?.trim() ||
    qingflowErrorMessageByCode[errorCode] ||
    `Qingflow API error ${errorCode}`;
  if (errorCode === 49301) return new ProviderRequestError(429, message);
  if (errorCode === 49300) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message);
  }
  if (qingflowPermissionErrorCodes.has(errorCode)) {
    return new ProviderRequestError(403, message);
  }
  return new ProviderRequestError(400, message);
}

const qingflowPermissionErrorCodes = new Set([40002, 40064, 40065, 40066, 40069, 40095]);
const qingflowAuditResultByDecision: Record<string, string> = {
  submit: "1",
  approve: "2",
  reject: "3",
  start: "5",
  resubmit: "6",
  cc: "7",
};
const qingflowErrorMessageByCode: Record<number, string> = {
  49300: "Invalid Qingflow access token",
  49301: "Qingflow daily API call limit reached",
  49302: "The caller IP is not on the Qingflow API allowlist",
  49303: "Qingflow application key not found",
  49304: "Qingflow record not found",
  49308: "Qingflow request ID not found",
};

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}
