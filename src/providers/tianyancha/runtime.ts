import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
  optionalStringArray,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  readProviderJsonBody,
} from "../provider-runtime.ts";

export const tianyanchaApiBaseUrl = "https://open.api.tianyancha.com";

const tenderSearchTypeCode: Record<string, number> = { title: 1, purchaser: 2, supplier: 3 };
const tenderNoticeTypeCode: Record<string, number> = { forecast: 1, announcement: 2, result: 4 };
const relationshipTypeCode: Record<string, string> = {
  legal_representative: "OWN",
  employment: "SERVE_ALL",
  investment: "INVEST",
  branch: "BRANCH",
  legal: "LAW",
  pledge_and_mortgage: "EQ",
  business_cooperation: "CAC",
  shared_contact: "CI",
  historical_shareholder: "HISTORICAL_SHAREHOLDER",
  historical_employment: "HISTORICAL_SERVE_ALL",
  historical_legal_representative: "HISTORICAL_OWN",
  all: "ALL",
};
const actionPathByName: Record<string, string> = {
  search_companies: "/services/open/search/2.0",
  search_companies_advanced: "/services/open/searchx",
  get_company_basic_info: "/services/open/ic/baseinfo/normal",
  verify_company_identity: "/services/open/ic/verify/2.0",
  get_company_contact_info: "/services/open/ic/contact",
  list_company_key_personnel: "/services/open/ic/staff/2.0",
  list_company_shareholders: "/services/open/ic/holder/2.0",
  list_company_investments: "/services/open/ic/inverst/2.0",
  list_company_equity_changes: "/services/open/ic/holderChange/2.0",
  list_company_historical_shareholders: "/services/open/hi/holder/2.0",
  list_company_historical_investments: "/services/open/hi/invest/2.0",
  list_company_branches: "/services/open/ic/branch/2.0",
  list_company_changes: "/services/open/ic/changeinfo/2.0",
  get_company_annual_reports: "/services/open/ic/annualreport/2.0",
  get_company_risk: "/services/open/risk/riskInfo/2.0",
  get_company_risk_detail: "/services/v4/open/riskDetail",
  get_company_judicial_risk: "/services/open/cb/judicial/2.0",
  get_company_development_info: "/services/open/cb/development/2.0",
  get_company_intellectual_property: "/services/open/cb/ipr/3.0",
  list_company_ultimate_beneficiaries: "/services/open/ic/humanholding/2.0",
  get_company_actual_control: "/services/open/ic/actualControl/3.0",
  find_company_relationship_paths: "/services/open/rela/shortPath/2.0",
  search_tenders: "/services/open/m/bids/search",
  list_company_news: "/services/open/ps/news/2.0",
};

export const tianyanchaActionHandlers: ProviderActionHandlers<
  "tianyancha",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  search_companies: action("search_companies"),
  search_companies_advanced: action("search_companies_advanced"),
  get_company_basic_info: action("get_company_basic_info"),
  verify_company_identity: action("verify_company_identity"),
  get_company_contact_info: action("get_company_contact_info"),
  list_company_key_personnel: action("list_company_key_personnel"),
  list_company_shareholders: action("list_company_shareholders"),
  list_company_investments: action("list_company_investments"),
  list_company_equity_changes: action("list_company_equity_changes"),
  list_company_historical_shareholders: action("list_company_historical_shareholders"),
  list_company_historical_investments: action("list_company_historical_investments"),
  list_company_branches: action("list_company_branches"),
  list_company_changes: action("list_company_changes"),
  get_company_annual_reports: action("get_company_annual_reports"),
  get_company_risk: action("get_company_risk"),
  get_company_risk_detail: action("get_company_risk_detail"),
  get_company_judicial_risk: action("get_company_judicial_risk"),
  get_company_development_info: action("get_company_development_info"),
  get_company_intellectual_property: action("get_company_intellectual_property"),
  list_company_ultimate_beneficiaries: action("list_company_ultimate_beneficiaries"),
  get_company_actual_control: action("get_company_actual_control"),
  find_company_relationship_paths: action("find_company_relationship_paths"),
  search_tenders: action("search_tenders"),
  list_company_news: action("list_company_news"),
};

function action(name: string): ProviderRuntimeHandler<ApiKeyProviderContext> {
  return (input, context) => executeTianyanchaAction(name, input, context);
}

async function executeTianyanchaAction(
  actionName: string,
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const path = actionPathByName[actionName];
  if (!path) throw new ProviderRequestError(400, `unknown Tianyancha action: ${actionName}`);
  const result = await requestTianyanchaResult({
    path,
    query: buildActionQuery(actionName, input),
    context,
  });
  return normalizeActionResult(actionName, input, result);
}

function buildActionQuery(
  actionName: string,
  input: Record<string, unknown>,
): Record<string, string | number | undefined> {
  const page = { pageNum: optionalInteger(input.pageNum), pageSize: optionalInteger(input.pageSize) };
  switch (actionName) {
    case "search_companies":
      return { word: optionalString(input.keyword), ...page };
    case "search_companies_advanced":
      return {
        word: optionalString(input.keyword),
        categoryGuobiao: optionalString(input.industryCode),
        areaCode: optionalString(input.areaCode),
        ...page,
      };
    case "get_company_basic_info":
    case "get_company_contact_info":
    case "get_company_risk":
    case "get_company_judicial_risk":
    case "get_company_development_info":
    case "get_company_intellectual_property":
    case "get_company_actual_control":
      return { keyword: optionalString(input.keyword) };
    case "verify_company_identity":
      return {
        name: optionalString(input.companyName),
        legalPersonName: optionalString(input.legalPersonName),
        code: optionalString(input.registrationCode),
      };
    case "list_company_shareholders":
      return { keyword: optionalString(input.keyword), ...page, source: optionalInteger(input.source) };
    case "list_company_investments":
    case "list_company_key_personnel":
    case "list_company_branches":
    case "list_company_changes":
    case "list_company_ultimate_beneficiaries":
      return { keyword: optionalString(input.keyword), ...page };
    case "get_company_annual_reports":
      return { keyword: optionalString(input.keyword), year: optionalString(input.year) };
    case "get_company_risk_detail":
      return { id: optionalInteger(input.riskId), type: optionalInteger(input.riskType), ...page };
    case "find_company_relationship_paths": {
      const sourceCompanyName = optionalString(input.sourceCompanyName);
      const sourceCompanyId = optionalInteger(input.sourceCompanyId);
      const targetCompanyName = optionalString(input.targetCompanyName);
      const targetCompanyId = optionalInteger(input.targetCompanyId);
      if (!sourceCompanyName && sourceCompanyId === undefined) {
        throw new ProviderRequestError(400, "sourceCompanyName or sourceCompanyId is required");
      }
      if (!targetCompanyName && targetCompanyId === undefined) {
        throw new ProviderRequestError(400, "targetCompanyName or targetCompanyId is required");
      }
      return {
        nameFrom: sourceCompanyName,
        idFrom: sourceCompanyId,
        nameTo: targetCompanyName,
        idTo: targetCompanyId,
        types: optionalStringArray(input.relationshipTypes)
          ?.map((value) => relationshipTypeCode[value])
          .join(","),
        depth: optionalInteger(input.maxDepth),
      };
    }
    case "search_tenders": {
      const noticeType = optionalString(input.noticeType);
      return {
        keyword: optionalString(input.keyword),
        searchType: optionalStringArray(input.searchTypes)
          ?.map((value) => tenderSearchTypeCode[value])
          .join(","),
        type: noticeType ? tenderNoticeTypeCode[noticeType] : undefined,
        province: optionalString(input.province),
        publishStartTime: optionalString(input.publishStartDate),
        publishEndTime: optionalString(input.publishEndDate),
        ...page,
      };
    }
    case "list_company_news": {
      const companyName = optionalString(input.companyName);
      const companyId = optionalInteger(input.companyId);
      if (!companyName && companyId === undefined) {
        throw new ProviderRequestError(400, "companyName or companyId is required");
      }
      return {
        name: companyName,
        id: companyId,
        startTime: toCompactDate(optionalString(input.startDate)),
        endTime: toCompactDate(optionalString(input.endDate)),
        tags: optionalStringArray(input.tags)?.join(","),
        ...page,
      };
    }
    default:
      throw new ProviderRequestError(400, `unknown Tianyancha action: ${actionName}`);
  }
}

async function requestTianyanchaResult(input: {
  path: string;
  query: Record<string, string | number | undefined>;
  context: ApiKeyProviderContext;
}): Promise<unknown> {
  const url = new URL(input.path, tianyanchaApiBaseUrl);
  for (const [name, value] of Object.entries(input.query)) {
    if (value !== undefined) url.searchParams.set(name, String(value));
  }

  const timeout = createProviderTimeout(input.context.signal);
  try {
    const response = await input.context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: input.context.apiKey,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: null,
      invalidJsonMessage: "Tianyancha returned invalid JSON",
    });
    if (!response.ok) throw createTianyanchaError(response.status, payload);
    return parseTianyanchaResult(payload);
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Tianyancha request timed out");
    }
    throw new ProviderRequestError(502, "Tianyancha request failed");
  } finally {
    timeout.cleanup();
  }
}

function parseTianyanchaResult(payload: unknown): unknown {
  const root = optionalRecord(payload);
  const errorCode = optionalInteger(root?.error_code);
  if (!root || errorCode === undefined) {
    throw new ProviderRequestError(502, "Tianyancha returned an invalid response");
  }
  if (errorCode === 0) return root.result;
  if (errorCode === 300000) return null;
  throw createTianyanchaError(200, payload);
}

function createTianyanchaError(status: number, payload: unknown): ProviderRequestError {
  const root = optionalRecord(payload);
  const upstreamCode = optionalInteger(root?.error_code);
  const message =
    optionalString(root?.reason) ?? optionalString(root?.message) ?? `Tianyancha request failed with status ${status}`;

  if (status === 429 || [300004, 300006, 300007].includes(upstreamCode ?? -1)) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 401 || status === 403 || [300002, 300003, 300009].includes(upstreamCode ?? -1)) {
    return new ProviderRequestError(401, message, payload);
  }
  if ([300005, 300011].includes(upstreamCode ?? -1)) {
    return new ProviderRequestError(403, message, payload);
  }
  if (status === 400 || status === 422 || upstreamCode === 300008) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(502, message, payload);
}

function normalizeActionResult(
  actionName: string,
  input: Record<string, unknown>,
  result: unknown,
): Record<string, unknown> {
  if (actionName === "get_company_basic_info") {
    if (result === null) return { company: null };
    return { company: requireResultObject(result, "company") };
  }

  if (actionName === "verify_company_identity") {
    if (result === null) return { matchStatus: null, remark: null };
    const verification = requireResultObject(result, "company verification");
    const matchStatus = optionalInteger(verification.result);
    if (matchStatus === undefined) {
      throw new ProviderRequestError(502, "Tianyancha returned invalid company verification data");
    }
    return { matchStatus, remark: optionalString(verification.remark) ?? null };
  }

  const rawPayloadOutputKey =
    actionName === "get_company_contact_info"
      ? "contact"
      : actionName === "get_company_judicial_risk"
        ? "judicialRisk"
        : actionName === "get_company_development_info"
          ? "development"
          : actionName === "get_company_intellectual_property"
            ? "intellectualProperty"
            : undefined;
  if (rawPayloadOutputKey) {
    return { [rawPayloadOutputKey]: result === null ? null : requireResultObject(result, rawPayloadOutputKey) };
  }

  if (actionName === "get_company_annual_reports") {
    const page = normalizePagedResult(result);
    return { annualReports: page.items, total: page.total };
  }

  if (actionName === "get_company_risk") {
    if (result === null) return { riskLevel: null, risks: [] };
    const risk = requireResultObject(result, "risk");
    if (!Array.isArray(risk.riskList)) {
      throw new ProviderRequestError(502, "Tianyancha returned invalid risk data");
    }
    return { riskLevel: optionalString(risk.riskLevel) ?? null, risks: risk.riskList };
  }

  if (actionName === "get_company_risk_detail") {
    const pageNum = optionalInteger(input.pageNum) ?? 1;
    const pageSize = optionalInteger(input.pageSize) ?? 20;
    const inputRiskType = optionalInteger(input.riskType);
    if (inputRiskType === undefined) throw new ProviderRequestError(400, "riskType is required");
    if (result === null) {
      return { riskType: inputRiskType, records: [], total: 0, pageNum, pageSize };
    }
    const detail = requireResultObject(result, "risk detail");
    const total = optionalNumber(detail.count);
    const riskType = optionalInteger(detail.type);
    if (!Array.isArray(detail.dataList) || total === undefined || !riskType) {
      throw new ProviderRequestError(502, "Tianyancha returned invalid risk detail data");
    }
    return {
      riskType,
      records: detail.dataList,
      total,
      pageNum: optionalInteger(detail.pn) ?? pageNum,
      pageSize,
    };
  }

  if (actionName === "get_company_actual_control") {
    if (result === null) return { controllers: [], paths: {} };
    const actualControl = requireResultObject(result, "actual-control");
    const controllers = actualControl.actualControllerList;
    if (controllers !== undefined && !Array.isArray(controllers)) {
      throw new ProviderRequestError(502, "Tianyancha returned invalid actual-control data");
    }
    return { controllers: controllers ?? [], paths: optionalRecord(actualControl.pathMap) ?? {} };
  }

  if (actionName === "find_company_relationship_paths") {
    if (result === null) return { hasRelationship: false, paths: [] };
    const relationship = requireResultObject(result, "company relationship");
    const paths: Array<Record<string, unknown>> = [];
    for (const [name, value] of Object.entries(relationship)) {
      const path = name.startsWith("p_") ? optionalRecord(value) : undefined;
      if (path) paths.push(path);
    }
    return { hasRelationship: paths.length > 0, paths };
  }

  const page = normalizePagedResult(result);
  return {
    [pagedResultKey(actionName)]: page.items,
    total: page.total,
    pageNum: optionalInteger(input.pageNum) ?? 1,
    pageSize: optionalInteger(input.pageSize) ?? 20,
  };
}

function pagedResultKey(actionName: string): string {
  if (actionName === "search_companies" || actionName === "search_companies_advanced") return "companies";
  if (actionName === "list_company_key_personnel") return "personnel";
  if (actionName === "list_company_shareholders") return "shareholders";
  if (actionName === "list_company_investments") return "investments";
  if (actionName === "list_company_equity_changes") return "equityChanges";
  if (actionName === "list_company_historical_shareholders") return "historicalShareholders";
  if (actionName === "list_company_historical_investments") return "historicalInvestments";
  if (actionName === "list_company_branches") return "branches";
  if (actionName === "list_company_changes") return "changes";
  if (actionName === "list_company_ultimate_beneficiaries") return "beneficiaries";
  if (actionName === "search_tenders") return "tenders";
  return "news";
}

function normalizePagedResult(result: unknown): { items: unknown[]; total: number } {
  if (result === null) return { items: [], total: 0 };
  const page = optionalRecord(result);
  const total = optionalNumber(page?.total);
  if (!page || !Array.isArray(page.items) || total === undefined) {
    throw new ProviderRequestError(502, "Tianyancha returned invalid paginated data");
  }
  return { items: page.items, total };
}

function requireResultObject(value: unknown, name: string): Record<string, unknown> {
  const result = optionalRecord(value);
  if (!result) throw new ProviderRequestError(502, `Tianyancha returned invalid ${name} data`);
  return result;
}

function toCompactDate(value: string | undefined): string | undefined {
  return value?.replaceAll("-", "");
}
