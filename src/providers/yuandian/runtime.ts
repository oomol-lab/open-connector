import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, rawStringOrNull } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const yuandianApiBaseUrl = "https://open.chineselaw.com/open";
const yuandianRequestBaseUrl = `${yuandianApiBaseUrl}/`;
const yuandianValidationPath = "/rh_enterpriseSearch";
const yuandianValidationCompanyName = "百度网讯";

type YuandianQueryValue = string | number | boolean | undefined;
type YuandianActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;
type EnterpriseExecutionRiskType = "executed_person" | "dishonest_execution";
type EnterpriseCourtNoticeType = "court_session_notice" | "court_notice";
type EnterpriseComplianceRecordType = "punishment" | "abnormal_operation" | "serious_illegal" | "corporate_tax";
type EnterpriseBusinessRecordType = "change_info" | "out_invest" | "guaranty" | "pledge" | "frozen_equity";
type EnterpriseIpAssetType = "patent" | "trademark" | "software_copyright" | "works_copyright" | "icp";

interface YuandianRequestInput {
  method?: "GET" | "POST";
  path: string;
  query?: Record<string, YuandianQueryValue>;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
}

export const yuandianActionHandlers: ProviderActionHandlers<"yuandian", YuandianActionHandler> = {
  search_regulations(input, context) {
    return executeListAction("/rh_fg_search", buildRegulationSearchBody(input), context);
  },
  search_clauses(input, context) {
    return executeListAction("/rh_ft_search", buildClauseSearchBody(input), context);
  },
  get_regulation_detail(input, context) {
    return executeDetailAction("/rh_fg_detail", buildRegulationDetailBody(input), context);
  },
  get_clause_detail(input, context) {
    return executeDetailAction("/rh_ft_detail", buildClauseDetailBody(input), context);
  },
  semantic_search_regulations(input, context) {
    return executeSemanticAction("/law_vector_search", buildSemanticRegulationBody(input), "fatiao", context);
  },
  search_ordinary_cases(input, context) {
    return executeCaseSearchAction("/rh_ptal_search", buildOrdinaryCaseSearchBody(input), context);
  },
  search_authoritative_cases(input, context) {
    return executeCaseSearchAction("/rh_qwal_search", buildAuthoritativeCaseSearchBody(input), context);
  },
  get_case_details(input, context) {
    return executeCaseDetailAction(buildCaseDetailQuery(input), context);
  },
  semantic_search_cases(input, context) {
    return executeSemanticAction("/case_vector_search", buildSemanticCaseBody(input), "wenshu", context);
  },
  search_enterprises(input, context) {
    return executeEnterpriseSearchAction("/rh_enterpriseSearch", buildEnterpriseSearchQuery(input), context);
  },
  search_enterprise_profiles(input, context) {
    return executeEnterpriseSearchAction("/rh_company_info", buildEnterpriseProfileSearchQuery(input), context);
  },
  get_enterprise_detail(input, context) {
    return executeEnterpriseDetailAction("/rh_company_detail", buildEnterpriseLocatorQuery(input), context);
  },
  get_enterprise_base_info(input, context) {
    return executeEnterpriseDetailAction("/rh_enterpriseBaseInfo", buildEnterpriseLocatorQuery(input), context);
  },
  get_enterprise_aggregation_summary(input, context) {
    return executeEnterpriseDetailAction(
      "/rh_enterpriseAggregationSummary",
      buildEnterpriseLocatorQuery(input),
      context,
    );
  },
  get_enterprise_litigation_statistics(input, context) {
    return executeEnterpriseDetailAction("/rh_enterpriseWritAgg", buildEnterpriseLocatorQuery(input), context);
  },
  list_enterprise_writs(input, context) {
    return executeEnterprisePageAction("/rh_enterpriseWritList", buildEnterprisePageQuery(input), context);
  },
  list_enterprise_execution_risks(input, context) {
    return executeEnterprisePageAction(
      enterpriseExecutionRiskPaths[input.recordType as EnterpriseExecutionRiskType],
      buildEnterprisePageQuery(input),
      context,
    );
  },
  list_enterprise_court_notices(input, context) {
    return executeEnterprisePageAction(
      enterpriseCourtNoticePaths[input.noticeType as EnterpriseCourtNoticeType],
      buildEnterprisePageQuery(input),
      context,
    );
  },
  list_enterprise_compliance_records(input, context) {
    return executeEnterprisePageAction(
      enterpriseComplianceRecordPaths[input.recordType as EnterpriseComplianceRecordType],
      buildEnterprisePageQuery(input),
      context,
    );
  },
  list_enterprise_business_records(input, context) {
    return executeEnterprisePageAction(
      enterpriseBusinessRecordPaths[input.recordType as EnterpriseBusinessRecordType],
      buildEnterprisePageQuery(input),
      context,
    );
  },
  list_enterprise_ip_assets(input, context) {
    return executeEnterprisePageAction(
      enterpriseIpAssetPaths[input.assetType as EnterpriseIpAssetType],
      buildEnterprisePageQuery(input),
      context,
    );
  },
  get_enterprise_annual_report(input, context) {
    return executeEnterpriseDetailAction(
      "/rh_enterpriseAnnualReport",
      buildEnterpriseAnnualReportQuery(input),
      context,
    );
  },
  check_legal_hallucinations(input, context) {
    return executeHallucinationCheck(input, context);
  },
};

const enterpriseExecutionRiskPaths: Record<EnterpriseExecutionRiskType, string> = {
  executed_person: "/rh_enterpriseExecutedPerson",
  dishonest_execution: "/rh_enterpriseExecutions",
};
const enterpriseCourtNoticePaths: Record<EnterpriseCourtNoticeType, string> = {
  court_session_notice: "/rh_enterpriseCourtSessionNotice",
  court_notice: "/rh_enterpriseCourtNotice",
};
const enterpriseComplianceRecordPaths: Record<EnterpriseComplianceRecordType, string> = {
  punishment: "/rh_enterprisePunishment",
  abnormal_operation: "/rh_enterpriseAbnormalOperation",
  serious_illegal: "/rh_enterpriseSeriousIllegal",
  corporate_tax: "/rh_enterpriseCorporateTax",
};
const enterpriseBusinessRecordPaths: Record<EnterpriseBusinessRecordType, string> = {
  change_info: "/rh_enterpriseChangeInfo",
  out_invest: "/rh_enterpriseOutInvest",
  guaranty: "/rh_enterpriseGuaranty",
  pledge: "/rh_enterprisePledge",
  frozen_equity: "/rh_enterpriseFrozenEquity",
};
const enterpriseIpAssetPaths: Record<EnterpriseIpAssetType, string> = {
  patent: "/rh_enterprisePatent",
  trademark: "/rh_enterpriseBrand",
  software_copyright: "/rh_enterpriseSoftRight",
  works_copyright: "/rh_enterpriseWorksRight",
  icp: "/rh_enterpriseIcp",
};

export async function validateYuandianCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const { payload } = await yuandianRequest(
    {
      method: "GET",
      path: yuandianValidationPath,
      query: { name: yuandianValidationCompanyName, top_k: 1 },
    },
    { apiKey, fetcher, signal },
    "validate",
  );
  return {
    profile: {
      accountId: "yuandian-api-key",
      displayName: "Yuan Dian API Key",
    },
    metadata: {
      apiBaseUrl: yuandianApiBaseUrl,
      validationEndpoint: yuandianValidationPath,
      validationConsumesPoints: true,
      validationPointCost: 1,
      matchedCompanies: getRecordArray(asRecord(payload).data).length,
    },
  };
}

async function executeListAction(path: string, body: Record<string, unknown>, context: ApiKeyProviderContext) {
  return normalizeListPayload((await yuandianRequest({ method: "POST", path, body }, context, "execute")).payload);
}

async function executeDetailAction(path: string, body: Record<string, unknown>, context: ApiKeyProviderContext) {
  return normalizeDetailPayload((await yuandianRequest({ method: "POST", path, body }, context, "execute")).payload);
}

async function executeSemanticAction(
  path: string,
  body: Record<string, unknown>,
  resultKey: "fatiao" | "wenshu",
  context: ApiKeyProviderContext,
) {
  return normalizeSemanticPayload(
    (await yuandianRequest({ method: "POST", path, body }, context, "execute")).payload,
    resultKey,
  );
}

async function executeCaseSearchAction(path: string, body: Record<string, unknown>, context: ApiKeyProviderContext) {
  return normalizeCaseSearchPayload(
    (await yuandianRequest({ method: "POST", path, body }, context, "execute")).payload,
  );
}

async function executeCaseDetailAction(query: Record<string, YuandianQueryValue>, context: ApiKeyProviderContext) {
  return normalizeDetailPayload(
    (await yuandianRequest({ method: "GET", path: "/rh_case_details", query }, context, "execute")).payload,
  );
}

async function executeEnterpriseSearchAction(
  path: string | undefined,
  query: Record<string, YuandianQueryValue>,
  context: ApiKeyProviderContext,
) {
  return normalizeListPayload(
    (await yuandianRequest({ method: "GET", path: requirePath(path), query }, context, "execute")).payload,
  );
}

async function executeEnterpriseDetailAction(
  path: string,
  query: Record<string, YuandianQueryValue>,
  context: ApiKeyProviderContext,
) {
  return normalizeDetailPayload((await yuandianRequest({ method: "GET", path, query }, context, "execute")).payload);
}

async function executeEnterprisePageAction(
  path: string | undefined,
  query: Record<string, YuandianQueryValue>,
  context: ApiKeyProviderContext,
) {
  return normalizeEnterprisePagePayload(
    (await yuandianRequest({ method: "GET", path: requirePath(path), query }, context, "execute")).payload,
  );
}

async function executeHallucinationCheck(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const { payload, response } = await yuandianRequest(
    {
      method: "POST",
      path: "/hall_detect",
      body: { text: input.text },
      headers: typeof input.requestId === "string" ? { "X-Request-ID": input.requestId } : undefined,
    },
    context,
    "execute",
  );
  return normalizeHallucinationPayload(payload, response.headers.get("x-request-id"));
}

async function yuandianRequest(
  input: YuandianRequestInput,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: "validate" | "execute",
): Promise<{ response: Response; payload: unknown }> {
  const path = input.path.startsWith("/") ? input.path.slice(1) : input.path;
  const url = new URL(path, yuandianRequestBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  const method = input.method ?? "GET";
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method,
      headers: yuandianHeaders(context.apiKey, {
        ...(method === "POST" ? { "content-type": "application/json; charset=utf-8" } : {}),
        ...input.headers,
      }),
      ...(method === "POST" ? { body: JSON.stringify(input.body ?? {}) } : {}),
      signal: context.signal,
    });
    payload = await readYuandianPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Yuan Dian request failed: ${error.message}` : "Yuan Dian request failed",
    );
  }
  if (!response.ok || isYuandianBusinessError(payload)) throw createYuandianError(response.status, payload, phase);
  return { response, payload };
}

function yuandianHeaders(apiKey: string, extraHeaders: Record<string, string> = {}): Record<string, string> {
  return {
    "X-API-Key": apiKey,
    accept: "application/json",
    "user-agent": providerUserAgent,
    ...extraHeaders,
  };
}

async function readYuandianPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) return text;
    throw new ProviderRequestError(502, "Yuan Dian returned invalid JSON");
  }
}

function createYuandianError(status: number, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const message = extractYuandianMessage(payload) ?? `Yuan Dian request failed with status ${status}`;
  const payloadCode = getPayloadCode(payload);
  const resolvedStatus = payloadCode !== undefined && payloadCode !== 500 && status < 400 ? payloadCode : status;
  if (resolvedStatus === 429) return new ProviderRequestError(429, message, payload);
  if (phase === "validate" && (resolvedStatus === 401 || resolvedStatus === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (resolvedStatus === 401 || resolvedStatus === 403)) {
    return new ProviderRequestError(401, message, payload);
  }
  if ([400, 404, 422].includes(resolvedStatus) || isKnownBusinessInputError(payload)) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(resolvedStatus >= 400 ? resolvedStatus : 502, message, payload);
}

function isYuandianBusinessError(payload: unknown): boolean {
  const record = optionalRecord(payload);
  if (!record) return false;
  if (record.success === false) return true;
  if (typeof record.status === "string" && record.status.toLowerCase() === "failed") return true;
  const code = getPayloadCode(payload);
  return code !== undefined && code !== 200 && code !== 201;
}

function isKnownBusinessInputError(payload: unknown): boolean {
  const code = getPayloadCode(payload);
  if (code === 501) return true;
  const errorCode = optionalRecord(payload)?.error_code;
  if (errorCode === "VALIDATION_ERROR") return true;
  if (code !== 500) return false;
  const message = extractYuandianMessage(payload)?.toLowerCase() ?? "";
  return ["参数", "不能为空", "不可为空", "不合法", "不支持的type", "validation"].some((fragment) =>
    message.includes(fragment),
  );
}

function extractYuandianMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) return payload.trim();
  const record = optionalRecord(payload);
  return (
    optionalString(record?.message) ??
    optionalString(record?.msg) ??
    optionalString(record?.error) ??
    optionalString(record?.error_code) ??
    optionalString(record?.status)
  );
}

function getPayloadCode(payload: unknown): number | undefined {
  const code = optionalRecord(payload)?.code;
  return typeof code === "number" ? code : undefined;
}

function normalizeListPayload(payload: unknown) {
  const record = asRecord(payload);
  return {
    code: getPayloadCode(record) ?? 200,
    status: rawStringOrNull(record.status),
    message: rawStringOrNull(record.message) ?? rawStringOrNull(record.msg),
    results: getRecordArray(record.data),
    raw: record,
  };
}

function normalizeDetailPayload(payload: unknown) {
  const record = asRecord(payload);
  return {
    code: getPayloadCode(record) ?? 200,
    status: rawStringOrNull(record.status),
    message: rawStringOrNull(record.message) ?? rawStringOrNull(record.msg),
    data: record.data ?? null,
    raw: record,
  };
}

function normalizeCaseSearchPayload(payload: unknown) {
  const record = asRecord(payload);
  const data = optionalRecord(record.data);
  return {
    code: getPayloadCode(record) ?? 200,
    status: rawStringOrNull(record.status),
    message: rawStringOrNull(record.message) ?? rawStringOrNull(record.msg),
    total: data?.total ?? null,
    results: getRecordArray(data?.lst),
    raw: record,
  };
}

function normalizeEnterprisePagePayload(payload: unknown) {
  const record = asRecord(payload);
  const data = optionalRecord(record.data);
  return {
    code: getPayloadCode(record) ?? 200,
    status: rawStringOrNull(record.status),
    message: rawStringOrNull(record.message) ?? rawStringOrNull(record.msg),
    total: data?.total ?? null,
    pageNo: data?.pageNo ?? null,
    pageSize: data?.pageSize ?? null,
    results: getRecordArray(data?.list),
    raw: record,
  };
}

function normalizeSemanticPayload(payload: unknown, resultKey: "fatiao" | "wenshu") {
  const record = asRecord(payload);
  const extra = optionalRecord(record.extra);
  return {
    code: getPayloadCode(record) ?? 201,
    message: rawStringOrNull(record.msg) ?? rawStringOrNull(record.message),
    results: getRecordArray(extra?.[resultKey]),
    raw: record,
  };
}

function normalizeHallucinationPayload(payload: unknown, responseRequestId: string | null) {
  const record = asRecord(payload);
  return {
    regulations: getRecordArray(record.regulations),
    cases: getRecordArray(record.cases),
    highlightedText: rawStringOrNull(record.highlighted_text),
    semanticCompareError: rawStringOrNull(record.semantic_compare_error),
    chatModel: rawStringOrNull(record.chat_model),
    requestId: rawStringOrNull(record.request_id) ?? responseRequestId,
    raw: record,
  };
}

function buildRegulationSearchBody(input: Record<string, unknown>) {
  return compactObject({
    keyword: input.keyword,
    search_mode: input.searchMode,
    fgmc: input.regulationName,
    sxx: input.validityStatus,
    dy: input.region,
    xljb_1: input.effectLevel,
    fbbm: input.issuingAuthority,
    fbrq_start: input.publishStartDate,
    fbrq_end: input.publishEndDate,
    ssrq_start: input.effectiveStartDate,
    ssrq_end: input.effectiveEndDate,
    top_k: input.topK,
  });
}

function buildClauseSearchBody(input: Record<string, unknown>) {
  return compactObject({
    keyword: input.keyword,
    search_mode: input.searchMode,
    fgmc: input.regulationName,
    xljb_1: input.effectLevel,
    sxx: input.validityStatus,
    dy: input.region,
    fbbm: input.issuingAuthority,
    fbrq_start: input.publishStartDate,
    fbrq_end: input.publishEndDate,
    ssrq_start: input.effectiveStartDate,
    ssrq_end: input.effectiveEndDate,
    top_k: input.topK,
  });
}

function buildRegulationDetailBody(input: Record<string, unknown>) {
  return compactObject({ id: input.regulationId, fgmc: input.regulationName, refer_date: input.referenceDate });
}

function buildClauseDetailBody(input: Record<string, unknown>) {
  return compactObject({
    id: input.clauseId,
    fgmc: input.regulationName,
    ftnum: input.clauseNumber,
    refer_date: input.referenceDate,
  });
}

function buildSemanticRegulationBody(input: Record<string, unknown>) {
  const filter = optionalRecord(input.filter);
  return compactObject({
    query: input.query,
    rewrite_flag: input.rewriteQuery,
    fatiao_filter: filter
      ? compactObject({
          sxx: filter.validityStatuses,
          effect1: filter.effectLevels,
          law_start: filter.effectiveStartDate,
          law_end: filter.effectiveEndDate,
        })
      : undefined,
    return_num: input.returnCount,
  });
}

function buildOrdinaryCaseSearchBody(input: Record<string, unknown>) {
  return compactObject({
    ah: input.caseNumber,
    title: input.title,
    ay: input.causes,
    jbdw: input.courts,
    xzqh_p: input.provinces,
    wszl: input.documentTypes,
    ajlb: input.caseCategory,
    ja_start: input.judgmentStartDate,
    ja_end: input.judgmentEndDate,
    qw: input.fullTextKeyword,
    fxgc: input.analysisKeyword,
    search_mode: input.searchMode,
    yyft: input.citedClauses,
    ft_search_mode: input.citedClauseSearchMode,
    top_k: input.topK,
  });
}

function buildAuthoritativeCaseSearchBody(input: Record<string, unknown>) {
  return compactObject({
    ah: input.caseNumber,
    title: input.title,
    ay: input.causes,
    jbdw: input.courts,
    source: input.sources,
    xzqh_p: input.provinces,
    wszl: input.documentTypes,
    ajlb: input.caseCategory,
    ja_start: input.judgmentStartDate,
    ja_end: input.judgmentEndDate,
    qw: input.fullTextKeyword,
    search_mode: input.searchMode,
    top_k: input.topK,
  });
}

function buildCaseDetailQuery(input: Record<string, unknown>): Record<string, YuandianQueryValue> {
  return compactObject({
    id: asQueryValue(input.caseId),
    ah: asQueryValue(input.caseNumber),
    type: asQueryValue(input.type),
  });
}

function buildSemanticCaseBody(input: Record<string, unknown>) {
  const filter = optionalRecord(input.filter);
  return compactObject({
    query: input.query,
    rewrite_flag: input.rewriteQuery,
    wenshu_filter: filter
      ? compactObject({
          wenshu_type: filter.caseCategory,
          ay: filter.causes,
          wszl: filter.documentTypeCodes,
          ja_start: filter.judgmentStartDate,
          ja_end: filter.judgmentEndDate,
          dianxing: filter.authoritativeOnly,
          fayuan: filter.courts,
          source: filter.sources,
          cj: filter.courtLevel,
          xzqh_p: filter.province,
          xzqh_c: filter.city,
        })
      : undefined,
    return_num: input.returnCount,
  });
}

function buildEnterpriseSearchQuery(input: Record<string, unknown>): Record<string, YuandianQueryValue> {
  return compactObject({ name: asQueryValue(input.name), top_k: asQueryValue(input.topK) });
}

function buildEnterpriseProfileSearchQuery(input: Record<string, unknown>): Record<string, YuandianQueryValue> {
  return compactObject({ name: asQueryValue(input.name), num: asQueryValue(input.count) });
}

function buildEnterpriseLocatorQuery(input: Record<string, unknown>): Record<string, YuandianQueryValue> {
  return compactObject({ id: asQueryValue(input.enterpriseId), tyshxydm: asQueryValue(input.creditCode) });
}

function buildEnterprisePageQuery(input: Record<string, unknown>): Record<string, YuandianQueryValue> {
  return compactObject({ ...buildEnterpriseLocatorQuery(input), pageNo: asQueryValue(input.pageNo) });
}

function buildEnterpriseAnnualReportQuery(input: Record<string, unknown>): Record<string, YuandianQueryValue> {
  return compactObject({ ...buildEnterpriseLocatorQuery(input), year: asQueryValue(input.year) });
}

function requirePath(value: string | undefined): string {
  if (value) return value;
  throw new ProviderRequestError(400, "record type is required");
}

function asRecord(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) throw new ProviderRequestError(502, "Yuan Dian returned an invalid JSON object");
  return record;
}

function getRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function asQueryValue(value: unknown): YuandianQueryValue {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : undefined;
}
