import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  ProviderRequestError,
  providerUserAgent,
  providerInputError,
  defaultProviderRequestTimeoutMs,
} from "../provider-runtime.ts";

export const gangtiseApiBaseUrl = "https://openapi.gangtise.com";
const gangtiseCredentialUrl = "https://open-platform.gangtise.com/";
const loginPath = "/application/auth/oauth/open/loginV2";
const securitiesSearchPath = "/application/open-reference/securities/search";
const realtimeQuotePath = "/application/open-quote/quote/realtime";
const minuteKlinePath = "/application/open-quote/kline/minute";
const fundFlowPath = "/application/open-quote/fund-flow/daily";
const valuationPath = "/application/open-fundamental/valuation-analysis";
const earningsForecastPath = "/application/open-fundamental/earning-forecast";
const mainBusinessPath = "/application/open-fundamental/main-business";
const topShareholdersPath = "/application/open-fundamental/capital-structure/top-holders";
const companyIndicatorSearchPath = "/application/open-indicator/EDE/search";
const companyIndicatorTimeSeriesPath = "/application/open-indicator/EDE/time-series";
const companyIndicatorCrossSectionPath = "/application/open-indicator/EDE/cross-section";
const reportSearchPath = "/application/open-insight/broker-report/getList";
const meetingSummarySearchPath = "/application/open-insight/summary/v2/getList";

const announcementSearchPathByMarket = {
  a_share: "/application/open-insight/announcement/getList",
  hong_kong: "/application/open-insight/announcement-hk/getList",
  united_states: "/application/open-insight/announcement-us/getList",
} as const;

const dailyKlinePathByMarket = {
  a_share: "/application/open-quote/kline/daily",
  hong_kong: "/application/open-quote/kline-hk/daily",
  united_states: "/application/open-quote/kline-us/daily",
  index: "/application/open-quote/index/kline/daily",
} as const;

const financialPathByContract = {
  a_share: {
    income: {
      accumulated: "/application/open-fundamental/financial-report/income-statement/accumulated",
      quarterly: "/application/open-fundamental/financial-report/income-statement/quarterly",
    },
    balance_sheet: {
      accumulated: "/application/open-fundamental/financial-report/balance-sheet/accumulated",
    },
    cash_flow: {
      accumulated: "/application/open-fundamental/financial-report/cash-flow-statement/accumulated",
      quarterly: "/application/open-fundamental/financial-report/cash-flow-statement/quarterly",
    },
  },
  hong_kong: {
    income: {
      accumulated: "/application/open-fundamental/financial-report/income-statement/hk",
    },
    balance_sheet: {
      accumulated: "/application/open-fundamental/financial-report/balance-sheet/hk",
    },
    cash_flow: {
      accumulated: "/application/open-fundamental/financial-report/cash-flow-statement/hk",
    },
  },
  united_states: {
    income: {
      accumulated: "/application/open-fundamental/financial-report/income-statement/us",
    },
    balance_sheet: {
      accumulated: "/application/open-fundamental/financial-report/balance-sheet/us",
    },
    cash_flow: {
      accumulated: "/application/open-fundamental/financial-report/cash-flow-statement/us",
    },
  },
} as const;

const dailyKlineFields = [
  "securityCode",
  "tradeDate",
  "open",
  "high",
  "low",
  "close",
  "preClose",
  "change",
  "pctChange",
  "volume",
  "amount",
] as const;

const minuteKlineFields = [
  "securityCode",
  "tradeTime",
  "open",
  "high",
  "low",
  "close",
  "change",
  "pctChange",
  "volume",
  "amount",
] as const;

const fundFlowFields = [
  "securityCode",
  "tradeDate",
  "smallNetInflow",
  "mediumNetInflow",
  "largeNetInflow",
  "xlargeNetInflow",
  "totalNetInflow",
  "mainNetInflow",
] as const;

const valuationIndicators = ["peTtm", "psTtm", "pbMrq", "peg", "pcfTtm", "em"] as const;

const earningsForecastFields = ["netIncome", "netIncomeYoy", "eps", "pe", "bps", "pb", "peg", "roe", "ps"] as const;

const mainBusinessMetricFields = [
  "opRevenue",
  "opRevenueYoy",
  "opRevenueRatio",
  "opCost",
  "opCostYoy",
  "opCostRatio",
  "grossProfit",
  "grossProfitYoy",
  "grossProfitRatio",
  "grossMargin",
  "grossMarginYoy",
  "grossMarginRatio",
] as const;

const mainBusinessResponseFields = [
  "periodName",
  "periodEndDate",
  "categoryName",
  ...mainBusinessMetricFields,
] as const;

const realtimeQuoteFields = [
  "securityCode",
  "exchange",
  "tradeDate",
  "tradeTime",
  "latestPrice",
  "open",
  "high",
  "low",
  "preClose",
  "change",
  "pctChange",
  "volume",
  "amount",
  "amplitude",
] as const;

type GangtiseActionInput = {
  apiKey: string;
  values: Record<string, string>;
  actionName: string;
  input: Record<string, unknown>;
};

type GangtiseRequestPhase = "validate" | "execute";

type GangtiseSession = {
  authorization: string;
  userName?: string;
};

export function createGangtiseSession(
  input: { apiKey?: string; secretKey?: string; values?: Record<string, string> },
  fetcher: typeof fetch,
  phase: GangtiseRequestPhase,
): Promise<GangtiseSession> {
  return loginGangtise(readGangtiseCredentials(input), fetcher, phase);
}

export async function validateGangtiseCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<{ accountLabel: string; providerScopes: string[]; providerMetadata: Record<string, unknown> }> {
  const session = await loginGangtise(readGangtiseCredentials(input), fetcher, "validate");

  return {
    accountLabel: session.userName ?? "Gangtise Account",
    providerScopes: [],
    providerMetadata: compactObject({
      apiBaseUrl: gangtiseApiBaseUrl,
      credentialUrl: gangtiseCredentialUrl,
      validationPath: loginPath,
    }),
  };
}

export async function executeGangtiseAction(input: GangtiseActionInput, fetcher: typeof fetch): Promise<unknown> {
  const session = await loginGangtise(readGangtiseCredentials(input), fetcher, "execute");

  switch (input.actionName) {
    case "search_securities":
      return searchSecurities(input.input, session.authorization, fetcher);
    case "get_realtime_quotes":
      return getRealtimeQuotes(input.input, session.authorization, fetcher);
    case "get_daily_kline":
      return getDailyKline(input.input, session.authorization, fetcher);
    case "get_minute_kline":
      return getMinuteKline(input.input, session.authorization, fetcher);
    case "get_financial_statements":
      return getFinancialStatements(input.input, session.authorization, fetcher);
    case "get_valuation_metrics":
      return getValuationMetrics(input.input, session.authorization, fetcher);
    case "get_earnings_forecast":
      return getEarningsForecast(input.input, session.authorization, fetcher);
    case "get_main_business_breakdown":
      return getMainBusinessBreakdown(input.input, session.authorization, fetcher);
    case "get_top_shareholders":
      return getTopShareholders(input.input, session.authorization, fetcher);
    case "get_fund_flow":
      return getFundFlow(input.input, session.authorization, fetcher);
    case "search_company_indicators":
      return searchCompanyIndicators(input.input, session.authorization, fetcher);
    case "get_company_indicators":
      return getCompanyIndicators(input.input, session.authorization, fetcher);
    case "search_reports":
      return searchResearchContent("report", input.input, session.authorization, fetcher);
    case "search_meeting_summaries":
      return searchResearchContent("meeting_summary", input.input, session.authorization, fetcher);
    case "search_announcements":
      return searchResearchContent("announcement", input.input, session.authorization, fetcher);
  }
}

function readGangtiseCredentials(input: { apiKey?: string; secretKey?: string; values?: Record<string, string> }) {
  const accessKey = input.apiKey?.trim();
  if (!accessKey) throw new ProviderRequestError(400, "Gangtise Access Key is required");
  const secretKey = (input.values?.secretKey ?? input.secretKey)?.trim();
  if (!secretKey) {
    throw new ProviderRequestError(400, "secretKey is required");
  }
  return { accessKey, secretKey };
}

async function loginGangtise(
  credentials: { accessKey: string; secretKey: string },
  fetcher: typeof fetch,
  phase: GangtiseRequestPhase,
): Promise<GangtiseSession> {
  const payload = await postGangtiseJson({
    path: loginPath,
    body: credentials,
    fetcher,
    phase,
  });
  const data = optionalRecord(payload.data);
  const accessToken = optionalString(data?.accessToken)?.trim();
  if (!accessToken) {
    throw new ProviderRequestError(
      phase === "validate" ? 400 : 401,
      extractGangtiseMessage(payload) ?? "Gangtise did not return an access token",
    );
  }

  return {
    authorization: accessToken.toLowerCase().startsWith("bearer ") ? accessToken : `Bearer ${accessToken}`,
    userName: optionalString(data?.userName)?.trim() || undefined,
  };
}

async function searchSecurities(input: Record<string, unknown>, authorization: string, fetcher: typeof fetch) {
  const payload = await postGangtiseJson({
    path: securitiesSearchPath,
    body: compactObject({
      keyword: optionalString(input.keyword)?.trim(),
      category: Array.isArray(input.categories) ? input.categories : undefined,
      top: optionalInteger(input.top) ?? 10,
    }),
    authorization,
    fetcher,
    phase: "execute",
  });
  const list = optionalRecord(payload.data)?.list;

  return {
    results: Array.isArray(list)
      ? list.flatMap((item) => {
          const row = optionalRecord(item);
          const code = optionalString(row?.gtsCode)?.trim();
          const name = cleanGangtiseName(optionalString(row?.gtsName));
          if (!code || !name) {
            return [];
          }
          return [
            {
              code,
              name,
              category: optionalString(row?.category) ?? null,
              matchScore: readNumber(row?.matchScore),
            },
          ];
        })
      : [],
  };
}

async function getRealtimeQuotes(input: Record<string, unknown>, authorization: string, fetcher: typeof fetch) {
  const payload = await postGangtiseJson({
    path: realtimeQuotePath,
    body: {
      securityList: input.securities,
      fieldList: realtimeQuoteFields,
    },
    authorization,
    fetcher,
    phase: "execute",
  });

  return {
    quotes: normalizeMatrix(payload.data, realtimeQuoteFields),
  };
}

async function getDailyKline(input: Record<string, unknown>, authorization: string, fetcher: typeof fetch) {
  const market = optionalString(input.market) as keyof typeof dailyKlinePathByMarket;
  const path = dailyKlinePathByMarket[market];
  if (!path) {
    throw new ProviderRequestError(400, "unsupported Gangtise market");
  }

  const payload = await postGangtiseJson({
    path,
    body: {
      securityList: input.securities,
      startDate: input.startDate,
      endDate: input.endDate,
      limit: optionalInteger(input.limit) ?? 5_000,
      fieldList: dailyKlineFields,
    },
    authorization,
    fetcher,
    phase: "execute",
  });

  return {
    market,
    rows: normalizeMatrix(payload.data, dailyKlineFields),
  };
}

async function getMinuteKline(input: Record<string, unknown>, authorization: string, fetcher: typeof fetch) {
  const rows: Array<Record<string, unknown>> = [];
  for (const securityCode of asStringArray(input.securities)) {
    const payload = await postGangtiseJson({
      path: minuteKlinePath,
      body: {
        securityCode,
        startTime: input.startTime,
        endTime: input.endTime,
        limit: optionalInteger(input.limit) ?? 5_000,
        fieldList: minuteKlineFields,
      },
      authorization,
      fetcher,
      phase: "execute",
    });
    rows.push(...normalizeMatrix(payload.data, minuteKlineFields));
  }
  return { rows };
}

async function getFinancialStatements(input: Record<string, unknown>, authorization: string, fetcher: typeof fetch) {
  const market = requireInputString(input, "market");
  const statement = requireInputString(input, "statement");
  const granularity = requireInputString(input, "granularity");
  const path = resolveFinancialPath(market, statement, granularity);
  const rows: Array<Record<string, unknown>> = [];

  for (const securityCode of asStringArray(input.securities)) {
    const payload = await postGangtiseJson({
      path,
      body: compactObject({
        securityCode,
        startDate: input.startDate,
        endDate: input.endDate,
        fiscalYear: optionalStringArray(input.fiscalYears),
        period: optionalStringArray(input.periods) ?? ["Q0"],
        reportType: optionalStringArray(input.reportTypes) ?? ["consolidated"],
        fieldList: optionalStringArray(input.fields) ?? [],
      }),
      authorization,
      fetcher,
      phase: "execute",
    });
    rows.push(
      ...normalizeDynamicMatrix(payload.data).map((row) => ({
        ...row,
        securityCode: row.securityCode ?? securityCode,
      })),
    );
  }

  return { market, statement, granularity, rows };
}

async function getValuationMetrics(input: Record<string, unknown>, authorization: string, fetcher: typeof fetch) {
  const indicators = optionalStringArray(input.indicators) ?? [...valuationIndicators];
  const rows: Array<Record<string, unknown>> = [];

  for (const securityCode of asStringArray(input.securities)) {
    const results = await Promise.all(
      indicators.map(async (indicator) => {
        const payload = await postGangtiseJson({
          path: valuationPath,
          body: {
            securityCode,
            indicator,
            startDate: input.startDate,
            endDate: input.endDate,
            limit: optionalInteger(input.limit) ?? 2_000,
            fieldList: ["value", "percentileRank"],
          },
          authorization,
          fetcher,
          phase: "execute",
        });
        return normalizeMatrix(payload.data, ["tradeDate", "value", "percentileRank"]).map((row) => ({
          securityCode,
          indicator,
          ...row,
        }));
      }),
    );
    rows.push(...results.flat());
  }

  return { rows };
}

async function getEarningsForecast(input: Record<string, unknown>, authorization: string, fetcher: typeof fetch) {
  const consensusFields = optionalStringArray(input.consensusFields) ?? [...earningsForecastFields];
  const rows: Array<Record<string, unknown>> = [];

  for (const securityCode of asStringArray(input.securities)) {
    const payload = await postGangtiseJson({
      path: earningsForecastPath,
      body: {
        securityCode,
        startDate: input.startDate,
        endDate: input.endDate,
        consensusList: consensusFields,
      },
      authorization,
      fetcher,
      phase: "execute",
    });
    const data = optionalRecord(payload.data);
    const responseCode = optionalString(data?.securityCode)?.trim() || securityCode;
    const securityName = optionalString(data?.securityName)?.trim() || null;
    const updateList = Array.isArray(data?.updateList) ? data.updateList : [];
    for (const updateValue of updateList) {
      const update = optionalRecord(updateValue);
      const updateDate = optionalString(update?.date)?.trim();
      const fieldList = Array.isArray(update?.fieldList) ? update.fieldList : [];
      if (!updateDate) {
        continue;
      }
      for (const fieldValue of fieldList) {
        const field = optionalRecord(fieldValue);
        const forecastYear = optionalString(field?.forecastYear)?.trim();
        if (!field || !forecastYear) {
          continue;
        }
        rows.push({
          securityCode: responseCode,
          securityName,
          updateDate,
          forecastYear,
          ...Object.fromEntries(earningsForecastFields.map((name) => [name, normalizeScalar(field[name])])),
        });
      }
    }
  }

  return { rows };
}

async function getMainBusinessBreakdown(input: Record<string, unknown>, authorization: string, fetcher: typeof fetch) {
  const breakdown = requireInputString(input, "breakdown");
  const rows: Array<Record<string, unknown>> = [];

  for (const securityCode of asStringArray(input.securities)) {
    const payload = await postGangtiseJson({
      path: mainBusinessPath,
      body: compactObject({
        securityCode,
        startDate: input.startDate,
        endDate: input.endDate,
        breakdown,
        period: input.period,
        fieldList: mainBusinessMetricFields,
      }),
      authorization,
      fetcher,
      phase: "execute",
    });
    const data = optionalRecord(payload.data);
    const responseCode = optionalString(data?.securityCode)?.trim() || securityCode;
    const securityName = optionalString(data?.securityName)?.trim() || null;
    rows.push(
      ...normalizeMatrix(payload.data, mainBusinessResponseFields).map((row) => ({
        securityCode: responseCode,
        securityName,
        breakdown,
        ...row,
      })),
    );
  }

  return { rows };
}

async function getTopShareholders(input: Record<string, unknown>, authorization: string, fetcher: typeof fetch) {
  const holderType = requireInputString(input, "holderType");
  const rows: Array<Record<string, unknown>> = [];

  for (const securityCode of asStringArray(input.securities)) {
    const payload = await postGangtiseJson({
      path: topShareholdersPath,
      body: compactObject({
        securityCode,
        holderType,
        startDate: input.startDate,
        endDate: input.endDate,
        fiscalYear: optionalStringArray(input.fiscalYears),
        period: optionalStringArray(input.periods) ?? ["latest"],
      }),
      authorization,
      fetcher,
      phase: "execute",
    });
    const list = optionalRecord(payload.data)?.list;
    if (!Array.isArray(list)) {
      continue;
    }
    for (const value of list) {
      const row = optionalRecord(value);
      if (!row) {
        continue;
      }
      rows.push({
        securityCode,
        holderType,
        reportPeriod: normalizeString(row.reportPeriod),
        rank: normalizeScalar(row.rank),
        shareholderName: normalizeString(row.shareholderName),
        shareholderType: normalizeString(row.shareholderType),
        holdingNum: normalizeScalar(row.holdingNum),
        holdingPct: normalizeScalar(row.holdingPct),
        chgNum: normalizeScalar(row.chgNum),
        chgPct: normalizeScalar(row.chgPct),
        shareCategory: normalizeString(row.shareCategory),
      });
    }
  }

  return { rows };
}

async function getFundFlow(input: Record<string, unknown>, authorization: string, fetcher: typeof fetch) {
  const payload = await postGangtiseJson({
    path: fundFlowPath,
    body: {
      securityList: input.securities,
      startDate: input.startDate,
      endDate: input.endDate,
      limit: optionalInteger(input.limit) ?? 5_000,
      fieldList: fundFlowFields.slice(2),
    },
    authorization,
    fetcher,
    phase: "execute",
  });
  return { rows: normalizeMatrix(payload.data, fundFlowFields) };
}

async function searchCompanyIndicators(input: Record<string, unknown>, authorization: string, fetcher: typeof fetch) {
  const payload = await postGangtiseJson({
    path: companyIndicatorSearchPath,
    body: {
      keyword: requireInputString(input, "keyword"),
      limit: optionalInteger(input.limit) ?? 20,
    },
    authorization,
    fetcher,
    phase: "execute",
  });
  const data = optionalRecord(payload.data);
  const rawItems: unknown[] = Array.isArray(payload.data) ? payload.data : Array.isArray(data?.list) ? data.list : [];

  return {
    indicators: rawItems.flatMap((value) => {
      const item = optionalRecord(value);
      const indicatorCode = optionalString(item?.indicatorCode)?.trim();
      const indicatorName = optionalString(item?.indicatorName)?.trim();
      if (!item || !indicatorCode || !indicatorName) {
        return [];
      }
      return [
        {
          indicatorCode,
          indicatorName,
          description: normalizeString(item.description),
          score: readNumber(item.score),
          scopeList: Array.isArray(item.scopeList)
            ? item.scopeList.filter((scope) => optionalRecord(scope) != null)
            : [],
          parameterList: Array.isArray(item.parameterList)
            ? item.parameterList.filter((parameter) => optionalRecord(parameter) != null)
            : [],
        },
      ];
    }),
  };
}

async function getCompanyIndicators(input: Record<string, unknown>, authorization: string, fetcher: typeof fetch) {
  const mode = requireInputString(input, "mode");
  const indicatorCodes = asStringArray(input.indicatorCodes);
  const securities = asStringArray(input.securities);
  const indicatorParamList = buildIndicatorParamList(input.indicatorParameters);
  let path: string;
  let body: Record<string, unknown>;

  if (mode === "time_series") {
    if (!input.startDate) {
      throw new ProviderRequestError(400, "startDate is required for Gangtise time_series indicator queries");
    }
    if (indicatorCodes.length > 1 && securities.length > 1) {
      throw new ProviderRequestError(
        400,
        "Gangtise time_series supports multiple indicators for one security or one indicator for multiple securities",
      );
    }
    path = companyIndicatorTimeSeriesPath;
    body = compactObject({
      indicatorCodeList: indicatorCodes,
      securityCodeList: securities,
      startDate: input.startDate,
      endDate: input.endDate,
      calendarType: input.calendarType,
      scale: input.scale,
      indicatorParamList,
    });
  } else {
    path = companyIndicatorCrossSectionPath;
    body = compactObject({
      indicatorCodeList: indicatorCodes,
      securityCodeList: securities,
      date: input.endDate,
      scale: input.scale,
      indicatorParamList,
    });
  }

  const payload = await postGangtiseJson({
    path,
    body,
    authorization,
    fetcher,
    phase: "execute",
  });
  const block = optionalRecord(payload.data) ?? {};
  const rows = mode === "time_series" ? normalizeIndicatorTimeSeries(block) : normalizeIndicatorCrossSection(block);
  const cellCount = countIndicatorCells(block.values);

  return {
    mode,
    rows,
    cellCount,
    estimatedPoints: Math.ceil(cellCount / 100) * 0.05,
  };
}

type ResearchContentType = "report" | "meeting_summary" | "announcement";

async function searchResearchContent(
  type: ResearchContentType,
  input: Record<string, unknown>,
  authorization: string,
  fetcher: typeof fetch,
) {
  const market = optionalString(input.market);
  const path = resolveResearchSearchPath(type, market);
  const offset = optionalInteger(input.offset) ?? 0;
  const limit = optionalInteger(input.limit) ?? 20;
  const body = buildResearchSearchBody(type, input, offset, limit, market);
  const payload = await postGangtiseJson({
    path,
    body,
    authorization,
    fetcher,
    phase: "execute",
  });
  const data = optionalRecord(payload.data) ?? {};
  const rawList = type === "meeting_summary" ? (Array.isArray(data.summList) ? data.summList : data.list) : data.list;
  const list = Array.isArray(rawList) ? rawList : [];
  const results = list.flatMap((value) => {
    const item = optionalRecord(value);
    return item ? normalizeResearchItem(type, item) : [];
  });
  const total = optionalInteger(data.total) ?? null;
  const candidateNextOffset = offset + list.length;
  const hasNext = total == null ? list.length === limit : candidateNextOffset < total;

  return {
    results,
    nextOffset: hasNext ? candidateNextOffset : null,
    total,
  };
}

function resolveFinancialPath(market: string, statement: string, granularity: string) {
  const marketPaths = financialPathByContract[market as keyof typeof financialPathByContract] as unknown as
    | Record<string, Record<string, string>>
    | undefined;
  const path = marketPaths?.[statement]?.[granularity];
  if (!path) {
    throw new ProviderRequestError(
      400,
      `Gangtise does not support ${granularity} ${statement} statements for ${market}`,
    );
  }
  return path;
}

function buildIndicatorParamList(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const output = value.flatMap((rawItem) => {
    const item = optionalRecord(rawItem);
    const indicatorCode = optionalString(item?.indicatorCode)?.trim();
    const parameters = optionalRecord(item?.parameters);
    if (!indicatorCode || !parameters) {
      return [];
    }
    const mapped = Object.entries(parameters).map(([paramKey, paramValue]) => ({
      paramKey,
      paramValue: String(paramValue),
    }));
    return mapped.length > 0 ? [{ indicatorCode, parameters: mapped }] : [];
  });
  return output.length > 0 ? output : undefined;
}

function normalizeIndicatorTimeSeries(block: Record<string, unknown>) {
  const dates = asStringArray(block.dates);
  const securityCodes = asStringArray(block.securityCodeList);
  const securityNames = asStringArray(block.securityNameList);
  const indicatorCodes = asStringArray(block.indicatorCodeList);
  const indicatorNames = asStringArray(block.indicatorNameList);
  const values = Array.isArray(block.values) ? block.values : [];
  const rows: Array<Record<string, unknown>> = [];

  if (securityCodes.length === 1) {
    for (const [indicatorIndex, indicatorCode] of indicatorCodes.entries()) {
      const indicatorValues = Array.isArray(values[indicatorIndex]) ? values[indicatorIndex] : [];
      for (const [dateIndex, date] of dates.entries()) {
        rows.push({
          date,
          securityCode: securityCodes[0],
          securityName: securityNames[0] ?? null,
          indicatorCode,
          indicatorName: indicatorNames[indicatorIndex] ?? null,
          value: normalizeScalar(indicatorValues[dateIndex]),
        });
      }
    }
  } else if (indicatorCodes.length === 1) {
    for (const [securityIndex, securityCode] of securityCodes.entries()) {
      const securityValues = Array.isArray(values[securityIndex]) ? values[securityIndex] : [];
      for (const [dateIndex, date] of dates.entries()) {
        rows.push({
          date,
          securityCode,
          securityName: securityNames[securityIndex] ?? null,
          indicatorCode: indicatorCodes[0],
          indicatorName: indicatorNames[0] ?? null,
          value: normalizeScalar(securityValues[dateIndex]),
        });
      }
    }
  }

  return rows;
}

function normalizeIndicatorCrossSection(block: Record<string, unknown>) {
  const date = normalizeString(block.date);
  const securityCodes = asStringArray(block.securityCodeList);
  const securityNames = asStringArray(block.securityNameList);
  const indicatorCodes = asStringArray(block.indicatorCodeList);
  const indicatorNames = asStringArray(block.indicatorNameList);
  const values = Array.isArray(block.values) ? block.values : [];
  const rows: Array<Record<string, unknown>> = [];

  for (const [indicatorIndex, indicatorCode] of indicatorCodes.entries()) {
    const indicatorValues = Array.isArray(values[indicatorIndex]) ? values[indicatorIndex] : [];
    for (const [securityIndex, securityCode] of securityCodes.entries()) {
      rows.push({
        date,
        securityCode,
        securityName: securityNames[securityIndex] ?? null,
        indicatorCode,
        indicatorName: indicatorNames[indicatorIndex] ?? null,
        value: normalizeScalar(indicatorValues[securityIndex]),
      });
    }
  }

  return rows;
}

function countIndicatorCells(value: unknown) {
  return Array.isArray(value) ? value.reduce((total, row) => total + (Array.isArray(row) ? row.length : 0), 0) : 0;
}

function resolveResearchSearchPath(type: ResearchContentType, market: string | undefined) {
  if (type === "report") {
    return reportSearchPath;
  }
  if (type === "meeting_summary") {
    return meetingSummarySearchPath;
  }
  const path = announcementSearchPathByMarket[market as keyof typeof announcementSearchPathByMarket];
  if (!path) {
    throw new ProviderRequestError(400, "unsupported Gangtise announcement market");
  }
  return path;
}

function buildResearchSearchBody(
  type: ResearchContentType,
  input: Record<string, unknown>,
  offset: number,
  limit: number,
  market: string | undefined,
) {
  const keyword = optionalString(input.keyword)?.trim();
  const searchType = input.searchType === "full_text" ? 2 : 1;
  const rankType = input.rankType === "latest" ? 2 : 1;
  const range = buildResearchDateRange(input.startDate, input.endDate, market);
  return compactObject({
    ...range,
    securityList: optionalStringArray(input.securities),
    keyword: keyword || undefined,
    searchType: keyword || type === "announcement" ? searchType : undefined,
    rankType: type === "meeting_summary" ? undefined : rankType,
    from: offset,
    size: limit,
  });
}

function buildResearchDateRange(startDate: unknown, endDate: unknown, market: string | undefined) {
  const start = optionalString(startDate)?.trim();
  const end = optionalString(endDate)?.trim();
  if (market === "hong_kong" || market === "united_states") {
    return compactObject({
      startTime: start ? `${start} 00:00:00` : undefined,
      endTime: end ? `${end} 23:59:59` : undefined,
    });
  }
  return compactObject({
    startTime: start ? Date.parse(`${start}T00:00:00+08:00`) : undefined,
    endTime: end ? Date.parse(`${end}T23:59:59.999+08:00`) : undefined,
  });
}

function normalizeResearchItem(
  type: ResearchContentType,
  item: Record<string, unknown>,
): Array<Record<string, unknown>> {
  const publisher = optionalRecord(item.publisher);
  const id = readResearchId(type, item);
  const title = cleanGangtiseText(
    optionalString(item.translatedTitle) ?? optionalString(item.titleTranslate) ?? optionalString(item.title),
  );
  if (!id || !title) {
    return [];
  }
  const securities = readResearchSecurities(item);
  const essence = Array.isArray(item.essence)
    ? item.essence
        .flatMap((value) => {
          const row = optionalRecord(value);
          const brief = optionalString(row?.brief)?.trim();
          const content = optionalString(row?.content)?.trim();
          const text = [brief, content].filter(Boolean).join(": ");
          return text ? [text] : [];
        })
        .join("; ")
    : "";

  return [
    {
      id,
      type,
      title,
      publishedAt: normalizePublishedAt(
        item.publishTime ?? item.reportDate ?? item.summaryTime ?? item.announcementDate,
      ),
      source:
        normalizeString(publisher?.brokerName) ??
        normalizeString(item.sourceName) ??
        normalizeString(item.source) ??
        (typeof item.source === "number" && Number.isFinite(item.source) ? String(item.source) : null),
      author: normalizeString(publisher?.author),
      summary: cleanGangtiseText(optionalString(item.translatedBrief) ?? optionalString(item.brief)),
      highlights: essence || null,
      url: normalizeString(item.url),
      pageCount: optionalInteger(item.pageNumber) ?? null,
      securities,
    },
  ];
}

function readResearchId(type: ResearchContentType, item: Record<string, unknown>) {
  const value =
    type === "report" ? item.reportId : type === "meeting_summary" ? (item.summaryId ?? item.id) : item.announcementId;
  return value == null ? undefined : String(value).trim() || undefined;
}

function readResearchSecurities(item: Record<string, unknown>) {
  const list = Array.isArray(item.securityList) ? item.securityList : Array.isArray(item.stock) ? item.stock : [];
  const output = list.flatMap((value) => {
    const security = optionalRecord(value);
    if (!security) {
      return [];
    }
    const code = normalizeString(security.securityCode ?? security.gtsCode);
    const name = normalizeString(security.securityName ?? security.scrAbbr);
    return code || name ? [{ code, name }] : [];
  });
  if (output.length > 0) {
    return output;
  }
  const code = normalizeString(item.securityCode);
  const name = normalizeString(item.securityName);
  return code || name ? [{ code, name }] : [];
}

function normalizePublishedAt(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value < 10_000_000_000 ? value * 1_000 : value;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return normalizeString(value);
}

function normalizeDynamicMatrix(value: unknown): Array<Record<string, unknown>> {
  const data = optionalRecord(value);
  const fieldList = asStringArray(data?.fieldList);
  const rows = Array.isArray(data?.list) ? data.list : [];
  return rows.flatMap((rawRow) =>
    Array.isArray(rawRow)
      ? [Object.fromEntries(fieldList.map((field, index) => [field, normalizeJsonValue(rawRow[index])]))]
      : [],
  );
}

function normalizeMatrix(value: unknown, outputFields: readonly string[]): Array<Record<string, unknown>> {
  const data = optionalRecord(value);
  const fieldList = Array.isArray(data?.fieldList)
    ? data.fieldList.filter((field): field is string => typeof field === "string")
    : [];
  const rows = Array.isArray(data?.list) ? data.list : [];

  return rows.flatMap((rawRow) => {
    if (!Array.isArray(rawRow)) {
      return [];
    }
    const source = Object.fromEntries(fieldList.map((field, index) => [field, rawRow[index]]));
    return [Object.fromEntries(outputFields.map((field) => [field, normalizeScalar(source[field])]))];
  });
}

async function postGangtiseJson(input: {
  path: string;
  body: Record<string, unknown>;
  authorization?: string;
  fetcher: typeof fetch;
  phase: GangtiseRequestPhase;
}) {
  const timeout = createTimeoutSignal({ timeoutMs: defaultProviderRequestTimeoutMs });
  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(new URL(input.path, gangtiseApiBaseUrl), {
      method: "POST",
      headers: compactObject({
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
        Authorization: input.authorization,
      }) as Record<string, string>,
      body: JSON.stringify(input.body),
      signal: timeout.signal,
    });
    payload = await readGangtisePayload(response);
  } catch (error) {
    if (timeout.didTimeout || (error instanceof Error && error.name === "AbortError")) {
      throw new ProviderRequestError(504, "Gangtise request timed out", error);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Gangtise request failed: ${error.message}` : "Gangtise request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }

  const body = optionalRecord(payload);
  const code = String(body?.code ?? "").trim();
  const success =
    response.ok && (input.path === loginPath || code === "000000" || code === "200") && body?.status !== false;
  if (!success) {
    throw createGangtiseError(response, body, input.phase);
  }
  if (!body) {
    throw new ProviderRequestError(502, "Gangtise returned an invalid JSON payload");
  }
  return body;
}

async function readGangtisePayload(response: Response) {
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

function createGangtiseError(
  response: Response,
  payload: Record<string, unknown> | undefined,
  phase: GangtiseRequestPhase,
) {
  const code = String(payload?.code ?? "").trim();
  const message = extractGangtiseMessage(payload) ?? "Gangtise request failed";

  if (response.status === 429 || code === "999006" || code === "999005") {
    return new ProviderRequestError(429, message);
  }
  if (code === "999003") {
    return new ProviderRequestError(403, message);
  }
  if (response.status === 401 || code === "999002" || code === "999011" || code === "8000013" || code === "8000014") {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message);
  }
  if (response.status === 400 || response.status === 422) {
    return providerInputError(message);
  }
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status || 502, message);
}

function extractGangtiseMessage(payload: unknown) {
  const body = optionalRecord(payload);
  return (
    optionalString(body?.msg)?.trim() ||
    optionalString(body?.message)?.trim() ||
    optionalString(optionalRecord(body?.error)?.message)?.trim() ||
    undefined
  );
}

function cleanGangtiseName(value: string | undefined) {
  return value?.replaceAll("<em>", "").replaceAll("</em>", "").replaceAll("<b>", "").replaceAll("</b>", "").trim();
}

function cleanGangtiseText(value: string | undefined) {
  const text = value
    ?.replaceAll("<em>", "")
    .replaceAll("</em>", "")
    .replaceAll("<b>", "")
    .replaceAll("</b>", "")
    .replaceAll("<p>", "")
    .replaceAll("</p>", "")
    .replaceAll("<br>", "\n")
    .replaceAll("<br/>", "\n")
    .replaceAll("<br />", "\n")
    .trim();
  return text || null;
}

function requireInputString(input: Record<string, unknown>, key: string) {
  const value = optionalString(input[key])?.trim();
  if (!value) {
    throw new ProviderRequestError(400, `${key} is required`);
  }
  return value;
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const text = typeof item === "string" ? item.trim() : "";
        return text ? [text] : [];
      })
    : [];
}

function optionalStringArray(value: unknown) {
  const items = asStringArray(value);
  return items.length > 0 ? items : undefined;
}

function normalizeString(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeScalar(value: unknown) {
  return typeof value === "string" || (typeof value === "number" && Number.isFinite(value)) ? value : null;
}

function normalizeJsonValue(value: unknown): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(normalizeJsonValue);
  }
  const object = optionalRecord(value);
  return object
    ? Object.fromEntries(Object.entries(object).map(([key, item]) => [key, normalizeJsonValue(item)]))
    : null;
}

function createTimeoutSignal(input: { timeoutMs: number }): {
  signal: AbortSignal;
  didTimeout: boolean;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const state = { didTimeout: false };
  const timeout = setTimeout(() => {
    state.didTimeout = true;
    controller.abort();
  }, input.timeoutMs);
  return {
    signal: controller.signal,
    get didTimeout() {
      return state.didTimeout;
    },
    cleanup() {
      clearTimeout(timeout);
    },
  };
}
