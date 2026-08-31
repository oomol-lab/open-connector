import { createHash } from "node:crypto";
import { optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { createProviderTimeout, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const qichachaApiBaseUrl = "https://api.qichacha.com";
const actionPathByName: Record<string, string> = {
  list_company_shareholders: "/ECIPartner/GetList",
  list_company_historical_investments: "/HistoryInvestmentCheck/GetList",
};

export interface QichachaCredentials {
  appKey: string;
  secretKey: string;
}

export function createQichachaToken(appKey: string, timespan: string, secretKey: string): string {
  return createHash("md5").update(`${appKey}${timespan}${secretKey}`).digest("hex").toUpperCase();
}

export function requireQichachaCredentials(input: Record<string, string>): QichachaCredentials {
  const appKey = input.appKey?.trim();
  const secretKey = input.secretKey?.trim();
  if (!appKey) {
    throw new ProviderRequestError(400, "qichacha AppKey is required");
  }
  if (!secretKey) {
    throw new ProviderRequestError(400, "qichacha SecretKey is required");
  }
  return { appKey, secretKey };
}

export async function executeQichachaAction(
  actionName: string,
  input: Record<string, unknown>,
  credentials: QichachaCredentials,
  fetcher: typeof fetch,
): Promise<unknown> {
  const pageIndex = optionalInteger(input.pageIndex) ?? 1;
  const pageSize = optionalInteger(input.pageSize) ?? 10;
  const payload = await requestQichacha({
    path: actionPathByName[actionName],
    searchKey: optionalString(input.searchKey) ?? "",
    pageIndex,
    pageSize,
    credentials,
    fetcher,
  });
  const records = readResultRecords(payload);
  const paging = optionalRecord(payload.Paging);
  const common = {
    pageIndex: optionalInteger(paging?.PageIndex) ?? pageIndex,
    pageSize: optionalInteger(paging?.PageSize) ?? pageSize,
    totalRecords: optionalInteger(paging?.TotalRecords) ?? records.length,
    verifyResult: readVerifyResult(payload),
    orderNumber: optionalString(payload.OrderNumber) ?? null,
  };
  if (actionName == "list_company_shareholders") {
    return { shareholders: records.map(normalizeShareholder), ...common };
  }
  return { historicalInvestments: records.map(normalizeHistoricalInvestment), ...common };
}

interface QichachaRequestInput {
  path: string;
  searchKey: string;
  pageIndex: number;
  pageSize: number;
  credentials: QichachaCredentials;
  fetcher: typeof fetch;
}

async function requestQichacha(input: QichachaRequestInput) {
  const timespan = String(Math.floor(Date.now() / 1000));
  const url = new URL(input.path, qichachaApiBaseUrl);
  url.searchParams.set("key", input.credentials.appKey);
  url.searchParams.set("searchKey", input.searchKey);
  url.searchParams.set("pageIndex", String(input.pageIndex));
  url.searchParams.set("pageSize", String(input.pageSize));
  const timeoutHandle = createProviderTimeout(undefined);
  try {
    const response = await input.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        Timespan: timespan,
        Token: createQichachaToken(input.credentials.appKey, timespan, input.credentials.secretKey),
        "user-agent": providerUserAgent,
      },
      signal: timeoutHandle.signal,
    });
    const payload = await readJsonPayload(response);
    if (!response.ok) {
      throw createQichachaError(response.status, payload);
    }
    const record = optionalRecord(payload);
    if (!record) {
      throw new ProviderRequestError(502, "qichacha returned an invalid response");
    }
    const status = optionalString(record.Status);
    if (status != "200") {
      throw createQichachaError(response.status, record);
    }
    return record;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeoutHandle.didTimeout() || isAbortError(error)) {
      throw new ProviderRequestError(504, "qichacha request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `qichacha request failed: ${error.message}` : "qichacha request failed",
    );
  } finally {
    timeoutHandle.cleanup();
  }
}

async function readJsonPayload(response: Response) {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "qichacha returned invalid JSON");
  }
}

function createQichachaError(httpStatus: number, payload: unknown) {
  const record = optionalRecord(payload);
  const message = optionalString(record?.Message) ?? `qichacha request failed (${httpStatus})`;
  const normalized = message.toLowerCase();
  if (
    httpStatus == 401 ||
    ["appkey", "secretkey", "token", "签名", "密钥", "验证"].some((value) => normalized.includes(value))
  ) {
    return new ProviderRequestError(401, message);
  }
  if (httpStatus == 429 || ["频率", "限流", "too many"].some((value) => normalized.includes(value))) {
    return new ProviderRequestError(429, message);
  }
  return new ProviderRequestError(502, message);
}

function readResultRecords(payload: Record<string, unknown>) {
  if (Array.isArray(payload.Result)) return payload.Result.map(asRecord).filter(isRecord);
  const result = optionalRecord(payload.Result);
  if (!Array.isArray(result?.Data)) return [];
  return result.Data.map(asRecord).filter(isRecord);
}

function readVerifyResult(payload: Record<string, unknown>) {
  const result = optionalRecord(payload.Result);
  return optionalInteger(result?.VerifyResult) ?? null;
}

function normalizeShareholder(value: Record<string, unknown>) {
  const subscriptions = Array.isArray(value.SubscribedList)
    ? value.SubscribedList.map(asRecord)
        .filter(isRecord)
        .map((item) => ({
          contributionType: stringOrNull(item.ContributionType),
          capital: stringOrNull(item.Capital),
          date: stringOrNull(item.Date),
        }))
    : [];
  return {
    keyNo: stringOrNull(value.KeyNo),
    name: stringOrNull(value.StockName),
    type: stringOrNull(value.StockType),
    stockPercent: stringOrNull(value.StockPercent),
    subscribedAmount: stringOrNull(value.ShouldCapi),
    subscribedCapital: stringOrNull(value.SubscribedCapital),
    subscribedCapitalUnit: stringOrNull(value.SubscribedCapitalUnit),
    subscribedCapitalCurrency: stringOrNull(value.SubscribedCapitalCCY),
    subscribedDate: stringOrNull(value.ShoudDate),
    stakeDate: stringOrNull(value.StakeDate),
    creditCode: stringOrNull(value.CreditCode),
    area: stringOrNull(value.Area),
    subscriptions,
  };
}

function normalizeHistoricalInvestment(value: Record<string, unknown>) {
  const representative = optionalRecord(value.OperInfo);
  return {
    keyNo: stringOrNull(value.KeyNo),
    companyName: stringOrNull(value.CompanyName),
    legalRepresentative: representative
      ? { keyNo: stringOrNull(representative.KeyNo), name: stringOrNull(representative.Name) }
      : null,
    registeredCapital: stringOrNull(value.RegistCapi),
    registeredCapitalValue: stringOrNull(value.RegisteredCapital),
    registeredCapitalUnit: stringOrNull(value.RegisteredCapitalUnit),
    registeredCapitalCurrency: stringOrNull(value.RegisteredCapitalCCY),
    fundedRatio: stringOrNull(value.FundedRatio),
    status: stringOrNull(value.Status),
    startDate: stringOrNull(value.StartDate),
    subscribedAmount: stringOrNull(value.ShouldCapi),
    subscribedCapital: stringOrNull(value.SubscribedCapital),
    subscribedCapitalUnit: stringOrNull(value.SubscribedCapitalUnit),
    subscribedCapitalCurrency: stringOrNull(value.SubscribedCapitalCCY),
    exitDate: stringOrNull(value.ExitDate),
  };
}

function asRecord(value: unknown) {
  return optionalRecord(value);
}

function isRecord(value: Record<string, unknown> | undefined): value is Record<string, unknown> {
  return value != null;
}

function stringOrNull(value: unknown) {
  return optionalString(value) ?? null;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name == "AbortError";
}
