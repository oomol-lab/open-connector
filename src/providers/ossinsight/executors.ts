import type {
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
} from "../../core/types.ts";
import type { OssinsightActionName } from "./actions.ts";

import { optionalBoolean, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  providerUserAgent,
  ProviderRequestError,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  toProviderProxyError,
} from "../provider-runtime.ts";

const service = "ossinsight";
const ossinsightBaseUrl = "https://api.ossinsight.io/v1";

interface OssinsightSqlColumn {
  col: string;
  data_type: string;
  nullable: boolean;
}

interface OssinsightSqlResult {
  code: number;
  message: string;
  start_ms: number;
  end_ms: number;
  latency: string;
  row_count: number;
  row_affect: number;
  limit: number;
}

interface OssinsightSqlResponse {
  type: "sql_endpoint";
  data: {
    columns: OssinsightSqlColumn[];
    rows: Array<Record<string, unknown>>;
    result: OssinsightSqlResult;
  };
}

interface OssinsightActionContext {
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type OssinsightActionHandler = (input: Record<string, unknown>, context: OssinsightActionContext) => Promise<unknown>;

export const ossinsightActionHandlers: Record<OssinsightActionName, OssinsightActionHandler> = {
  async list_collections(_input, context): Promise<unknown> {
    const response = await requestOssinsightSql("/collections/", {}, context);
    return {
      collections: response.data.rows.map(normalizeCollection),
      metadata: buildMetadata(response),
    };
  },
  async list_hot_collections(_input, context): Promise<unknown> {
    const response = await requestOssinsightSql("/collections/hot/", {}, context);
    return {
      collections: response.data.rows.map(normalizeHotCollection),
      metadata: buildMetadata(response),
    };
  },
  async list_collection_repos(input, context): Promise<unknown> {
    const response = await requestOssinsightSql(
      `/collections/${encodeURIComponent(requiredCollectionId(input.collection_id))}/repos/`,
      {},
      context,
    );
    return {
      repositories: response.data.rows.map(normalizeCollectionRepository),
      metadata: buildMetadata(response),
    };
  },
  async rank_collection_repos_by_stars(input, context): Promise<unknown> {
    return rankCollectionRepositories(input, "ranking_by_stars", context);
  },
  async rank_collection_repos_by_pull_requests(input, context): Promise<unknown> {
    return rankCollectionRepositories(input, "ranking_by_prs", context);
  },
  async rank_collection_repos_by_issues(input, context): Promise<unknown> {
    return rankCollectionRepositories(input, "ranking_by_issues", context);
  },
  async list_trending_repos(input, context): Promise<unknown> {
    const response = await requestOssinsightSql(
      "/trends/repos/",
      {
        period: optionalString(input.period) ?? "past_24_hours",
        language: optionalString(input.language) ?? "All",
      },
      context,
    );
    return {
      repositories: response.data.rows.map(normalizeTrendingRepository),
      metadata: buildMetadata(response),
    };
  },
  async list_issue_creators(input, context): Promise<unknown> {
    const response = await requestOssinsightSql(
      buildRepoPath(input, "issue_creators"),
      {
        sort: optionalString(input.sort) ?? "issues-desc",
        exclude_bots: optionalBoolean(input.exclude_bots) ?? true,
        page: optionalInteger(input.page) ?? 1,
        page_size: optionalInteger(input.page_size) ?? 30,
      },
      context,
    );
    return {
      creators: response.data.rows.map(normalizeIssueCreator),
      metadata: buildMetadata(response),
    };
  },
  async list_issue_creator_countries(input, context): Promise<unknown> {
    const response = await requestOssinsightSql(
      buildRepoPath(input, "issue_creators/countries"),
      repoAnalysisQuery(input),
      context,
    );
    return {
      countries: response.data.rows.map(normalizeIssueCreatorCountry),
      metadata: buildMetadata(response),
    };
  },
  async list_issue_creator_organizations(input, context): Promise<unknown> {
    const response = await requestOssinsightSql(
      buildRepoPath(input, "issue_creators/organizations"),
      repoAnalysisQuery(input),
      context,
    );
    return {
      organizations: response.data.rows.map(normalizeIssueCreatorOrganization),
      metadata: buildMetadata(response),
    };
  },
  async get_issue_creators_history(input, context): Promise<unknown> {
    const response = await requestOssinsightSql(
      buildRepoPath(input, "issue_creators/history"),
      repoHistoryQuery(input),
      context,
    );
    return {
      history: response.data.rows.map(normalizeIssueCreatorHistoryPoint),
      metadata: buildMetadata(response),
    };
  },
  async list_pull_request_creators(input, context): Promise<unknown> {
    const response = await requestOssinsightSql(
      buildRepoPath(input, "pull_request_creators"),
      {
        sort: optionalString(input.sort) ?? "prs-desc",
        exclude_bots: optionalBoolean(input.exclude_bots) ?? true,
        page: optionalInteger(input.page) ?? 1,
        page_size: optionalInteger(input.page_size) ?? 30,
      },
      context,
    );
    return {
      creators: response.data.rows.map(normalizePullRequestCreator),
      metadata: buildMetadata(response),
    };
  },
  async list_pull_request_creator_countries(input, context): Promise<unknown> {
    const response = await requestOssinsightSql(
      buildRepoPath(input, "pull_request_creators/countries"),
      repoAnalysisQuery(input),
      context,
    );
    return {
      countries: response.data.rows.map(normalizePullRequestCreatorCountry),
      metadata: buildMetadata(response),
    };
  },
  async list_pull_request_creator_organizations(input, context): Promise<unknown> {
    const response = await requestOssinsightSql(
      buildRepoPath(input, "pull_request_creators/organizations"),
      repoAnalysisQuery(input),
      context,
    );
    return {
      organizations: response.data.rows.map(normalizePullRequestCreatorOrganization),
      metadata: buildMetadata(response),
    };
  },
  async get_pull_request_creators_history(input, context): Promise<unknown> {
    const response = await requestOssinsightSql(
      buildRepoPath(input, "pull_request_creators/history"),
      repoHistoryQuery(input),
      context,
    );
    return {
      history: response.data.rows.map(normalizePullRequestCreatorHistoryPoint),
      metadata: buildMetadata(response),
    };
  },
  async list_stargazer_countries(input, context): Promise<unknown> {
    const response = await requestOssinsightSql(
      buildRepoPath(input, "stargazers/countries"),
      repoAnalysisQuery(input),
      context,
    );
    return {
      countries: response.data.rows.map(normalizeStargazerCountry),
      metadata: buildMetadata(response),
    };
  },
  async list_stargazer_organizations(input, context): Promise<unknown> {
    const response = await requestOssinsightSql(
      buildRepoPath(input, "stargazers/organizations"),
      repoAnalysisQuery(input),
      context,
    );
    return {
      organizations: response.data.rows.map(normalizeStargazerOrganization),
      metadata: buildMetadata(response),
    };
  },
  async get_stargazers_history(input, context): Promise<unknown> {
    const response = await requestOssinsightSql(
      buildRepoPath(input, "stargazers/history"),
      repoHistoryQuery(input),
      context,
    );
    return {
      history: response.data.rows.map(normalizeStargazerHistoryPoint),
      metadata: buildMetadata(response),
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<OssinsightActionContext>({
  service,
  handlers: ossinsightActionHandlers,
  createContext(context: ExecutionContext, fetcher: typeof fetch): OssinsightActionContext {
    return {
      fetcher,
      signal: context.signal,
    };
  },
  fallbackMessage: "ossinsight request failed",
});

export const proxy: ProviderProxyExecutor = async (input, context): Promise<ProxyExecutionResult> => {
  try {
    if (input.method !== "GET") {
      throw new ProviderRequestError(400, "OSSInsight proxy only supports GET requests.");
    }

    const url = createProviderProxyUrl(ossinsightBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
    headers.set("user-agent", providerUserAgent);

    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: context.signal,
    });
    if (!response.ok) {
      const message = await readErrorMessage(response, true);
      const status =
        response.status === 400 || response.status === 404 || response.status === 422 ? 400 : response.status;
      throw new ProviderRequestError(status, message);
    }

    return {
      ok: true,
      response: await readProviderProxyResponse(response),
    };
  } catch (error) {
    return toProviderProxyError(error, "ossinsight request failed");
  }
};

async function rankCollectionRepositories(
  input: Record<string, unknown>,
  metricPath: string,
  context: OssinsightActionContext,
): Promise<unknown> {
  const response = await requestOssinsightSql(
    `/collections/${encodeURIComponent(requiredCollectionId(input.collection_id))}/${metricPath}/`,
    { period: optionalString(input.period) ?? "past_28_days" },
    context,
  );
  return {
    rankings: response.data.rows.map(normalizeCollectionRanking),
    metadata: buildMetadata(response),
  };
}

async function requestOssinsightSql(
  path: string,
  query: Record<string, string | number | boolean>,
  context: OssinsightActionContext,
): Promise<OssinsightSqlResponse> {
  const url = new URL(stripLeadingSlashes(path), `${ossinsightBaseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, String(value));
  }

  let response: Response;
  try {
    response = await context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      isTimeoutLikeError(error) ? 504 : 502,
      error instanceof Error ? `ossinsight request failed: ${error.message}` : "ossinsight request failed",
    );
  }

  if (!response.ok) {
    const message = await readErrorMessage(response);
    const status =
      response.status === 400 || response.status === 404 || response.status === 422 ? 400 : response.status;
    throw new ProviderRequestError(status, message);
  }

  return normalizeSqlResponse(await readJson(response));
}

function stripLeadingSlashes(path: string): string {
  let index = 0;
  while (path[index] === "/") {
    index += 1;
  }
  return path.slice(index);
}

function isTimeoutLikeError(error: unknown): boolean {
  const record = optionalRecord(error);
  if (!record) {
    return false;
  }
  return [record.name, record.code, record.type].some(
    (marker) => marker === "AbortError" || marker === "TimeoutError" || marker === "ETIMEDOUT",
  );
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new ProviderRequestError(502, "ossinsight returned invalid JSON");
  }
}

async function readErrorMessage(response: Response, bounded = false): Promise<string> {
  const fallback = `ossinsight request failed with status ${response.status}`;
  let text: string;
  try {
    text = bounded ? await readProviderProxyErrorMessage(response, "") : await response.text();
  } catch {
    return fallback;
  }

  try {
    const payload = JSON.parse(text) as unknown;
    const record = optionalRecord(payload);
    const message =
      optionalString(record?.message) ?? optionalString(record?.error) ?? optionalString(record?.errorMessage);
    return message ?? (text.trim() || fallback);
  } catch {
    return text.trim() || fallback;
  }
}

function normalizeSqlResponse(payload: unknown): OssinsightSqlResponse {
  const record = optionalRecord(payload);
  if (!record || record.type !== "sql_endpoint") {
    throw new ProviderRequestError(502, "ossinsight returned an unexpected response type");
  }

  const data = optionalRecord(record.data);
  if (!data || !Array.isArray(data.columns) || !Array.isArray(data.rows)) {
    throw new ProviderRequestError(502, "ossinsight returned an invalid data payload");
  }
  const result = optionalRecord(data.result);
  if (!result) {
    throw new ProviderRequestError(502, "ossinsight returned an invalid result payload");
  }

  return {
    type: "sql_endpoint",
    data: {
      columns: data.columns.map(normalizeColumn),
      rows: data.rows.map((row) => {
        const recordRow = optionalRecord(row);
        if (!recordRow) {
          throw new ProviderRequestError(502, "ossinsight returned an invalid row");
        }
        return recordRow;
      }),
      result: normalizeResult(result),
    },
  };
}

function normalizeColumn(value: unknown): OssinsightSqlColumn {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, "ossinsight returned an invalid column");
  }
  return {
    col: requiredString(record.col, "column col", providerDataError),
    data_type: requiredString(record.data_type, "column data_type", providerDataError),
    nullable: booleanValue(record.nullable, "column nullable"),
  };
}

function normalizeResult(value: Record<string, unknown>): OssinsightSqlResult {
  return {
    code: requiredNumber(value.code, "result code"),
    message: requiredString(value.message, "result message", providerDataError),
    start_ms: requiredNumber(value.start_ms, "result start_ms"),
    end_ms: requiredNumber(value.end_ms, "result end_ms"),
    latency: requiredString(value.latency, "result latency", providerDataError),
    row_count: requiredInteger(value.row_count, "result row_count"),
    row_affect: requiredInteger(value.row_affect, "result row_affect"),
    limit: requiredInteger(value.limit, "result limit"),
  };
}

function buildMetadata(response: OssinsightSqlResponse): Record<string, unknown> {
  return {
    columns: response.data.columns,
    result: response.data.result,
  };
}

function buildRepoPath(input: Record<string, unknown>, familyPath: string): string {
  const owner = encodeURIComponent(requiredString(input.owner, "owner"));
  const repo = encodeURIComponent(requiredString(input.repo, "repo"));
  return `/repos/${owner}/${repo}/${familyPath}/`;
}

function repoAnalysisQuery(input: Record<string, unknown>): Record<string, string | boolean> {
  return {
    exclude_unknown: optionalBoolean(input.exclude_unknown) ?? true,
    from: optionalString(input.from) ?? "2000-01-01",
    to: optionalString(input.to) ?? "2099-01-01",
  };
}

function repoHistoryQuery(input: Record<string, unknown>): Record<string, string> {
  return {
    per: optionalString(input.per) ?? "month",
    from: optionalString(input.from) ?? "2000-01-01",
    to: optionalString(input.to) ?? "2099-01-01",
  };
}

function normalizeCollection(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requiredString(row.id, "collection id", providerDataError),
    name: requiredString(row.name, "collection name", providerDataError),
  };
}

function normalizeHotCollection(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requiredString(row.id, "collection id", providerDataError),
    name: requiredString(row.name, "collection name", providerDataError),
    repos: nullableInteger(row.repos),
    repo_id: requiredString(row.repo_id, "repo_id", providerDataError),
    repo_name: requiredString(row.repo_name, "repo_name", providerDataError),
    repo_current_period_rank: nullableInteger(row.repo_current_period_rank),
    repo_past_period_rank: nullableInteger(row.repo_past_period_rank),
    repo_rank_changes: nullableInteger(row.repo_rank_changes),
  };
}

function normalizeCollectionRepository(row: Record<string, unknown>): Record<string, unknown> {
  return {
    repo_id: requiredString(row.repo_id, "repo_id", providerDataError),
    repo_name: requiredString(row.repo_name, "repo_name", providerDataError),
  };
}

function normalizeCollectionRanking(row: Record<string, unknown>): Record<string, unknown> {
  return {
    repo_id: requiredString(row.repo_id, "repo_id", providerDataError),
    repo_name: requiredString(row.repo_name, "repo_name", providerDataError),
    current_period_growth: requiredInteger(row.current_period_growth, "current_period_growth"),
    current_period_rank: requiredInteger(row.current_period_rank, "current_period_rank"),
    past_period_growth: requiredInteger(row.past_period_growth, "past_period_growth"),
    past_period_rank: requiredInteger(row.past_period_rank, "past_period_rank"),
    growth_pop: requiredNumber(row.growth_pop, "growth_pop"),
    rank_pop: requiredInteger(row.rank_pop, "rank_pop"),
    total: requiredInteger(row.total, "total"),
  };
}

function normalizeTrendingRepository(row: Record<string, unknown>): Record<string, unknown> {
  return {
    repo_id: requiredString(row.repo_id, "repo_id", providerDataError),
    repo_name: requiredString(row.repo_name, "repo_name", providerDataError),
    primary_language: nullableString(row.primary_language),
    description: nullableString(row.description),
    stars: nullableInteger(row.stars),
    forks: nullableInteger(row.forks),
    pull_requests: nullableInteger(row.pull_requests),
    pushes: nullableInteger(row.pushes),
    total_score: nullableNumber(row.total_score),
    contributor_logins: splitCsv(row.contributor_logins),
    collection_names: splitCsv(row.collection_names),
  };
}

function normalizeStargazerCountry(row: Record<string, unknown>): Record<string, unknown> {
  return {
    country_code: nullableString(row.country_code),
    stargazers: requiredInteger(row.stargazers, "stargazers"),
    percentage: nullableNumber(row.percentage),
  };
}

function normalizeStargazerOrganization(row: Record<string, unknown>): Record<string, unknown> {
  return {
    org_name: nullableString(row.org_name),
    stargazers: requiredInteger(row.stargazers, "stargazers"),
    percentage: nullableNumber(row.percentage),
  };
}

function normalizeStargazerHistoryPoint(row: Record<string, unknown>): Record<string, unknown> {
  return {
    date: requiredString(row.date, "date", providerDataError),
    stargazers: requiredInteger(row.stargazers, "stargazers"),
  };
}

function normalizeIssueCreator(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requiredString(row.id, "creator id", providerDataError),
    login: requiredString(row.login, "creator login", providerDataError),
    name: nullableString(row.name),
    issues: nullableInteger(row.issues),
    first_issue_opened_at: nullableString(row.first_issue_opened_at),
  };
}

function normalizeIssueCreatorCountry(row: Record<string, unknown>): Record<string, unknown> {
  return {
    country_code: nullableString(row.country_code),
    issue_creators: requiredInteger(row.issue_creators, "issue_creators"),
    percentage: nullableNumber(row.percentage),
  };
}

function normalizeIssueCreatorOrganization(row: Record<string, unknown>): Record<string, unknown> {
  return {
    org_name: nullableString(row.org_name),
    issue_creators: requiredInteger(row.issue_creators, "issue_creators"),
    percentage: nullableNumber(row.percentage),
  };
}

function normalizeIssueCreatorHistoryPoint(row: Record<string, unknown>): Record<string, unknown> {
  return {
    date: requiredString(row.date, "date", providerDataError),
    issue_creators: requiredInteger(row.issue_creators, "issue_creators"),
  };
}

function normalizePullRequestCreator(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requiredString(row.id, "creator id", providerDataError),
    login: requiredString(row.login, "creator login", providerDataError),
    name: nullableString(row.name),
    prs: nullableInteger(row.prs),
    first_pr_opened_at: nullableString(row.first_pr_opened_at),
    first_pr_merged_at: nullableString(row.first_pr_merged_at),
  };
}

function normalizePullRequestCreatorCountry(row: Record<string, unknown>): Record<string, unknown> {
  return {
    country_code: nullableString(row.country_code),
    pull_request_creators: requiredInteger(row.pull_request_creators, "pull_request_creators"),
    percentage: nullableNumber(row.percentage),
  };
}

function normalizePullRequestCreatorOrganization(row: Record<string, unknown>): Record<string, unknown> {
  return {
    org_name: nullableString(row.org_name),
    pull_request_creators: requiredInteger(row.pull_request_creators, "pull_request_creators"),
    percentage: nullableNumber(row.percentage),
  };
}

function normalizePullRequestCreatorHistoryPoint(row: Record<string, unknown>): Record<string, unknown> {
  return {
    date: requiredString(row.date, "date", providerDataError),
    pull_request_creators: requiredInteger(row.pull_request_creators, "pull_request_creators"),
  };
}

function splitCsv(value: unknown): string[] {
  if (typeof value !== "string" || value.trim() === "") {
    return [];
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

function requiredCollectionId(value: unknown): string {
  if (typeof value === "number" && Number.isInteger(value)) {
    return String(value);
  }
  return requiredString(value, "collection_id");
}

function nullableString(value: unknown): string | null {
  if (value == null || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    throw new ProviderRequestError(502, "ossinsight returned invalid string field");
  }
  return value;
}

function requiredNumber(value: unknown, field: string): number {
  const parsed = parseNumber(value);
  if (parsed == null) {
    throw new ProviderRequestError(502, `ossinsight returned invalid ${field}`);
  }
  return parsed;
}

function requiredInteger(value: unknown, field: string): number {
  const parsed = requiredNumber(value, field);
  if (!Number.isInteger(parsed)) {
    throw new ProviderRequestError(502, `ossinsight returned invalid ${field}`);
  }
  return parsed;
}

function nullableNumber(value: unknown): number | null {
  if (value == null || value === "") {
    return null;
  }
  return requiredNumber(value, "number field");
}

function nullableInteger(value: unknown): number | null {
  const parsed = nullableNumber(value);
  if (parsed == null) {
    return null;
  }
  if (!Number.isInteger(parsed)) {
    throw new ProviderRequestError(502, "ossinsight returned invalid integer field");
  }
  return parsed;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function booleanValue(value: unknown, field: string): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  throw new ProviderRequestError(502, `ossinsight returned invalid ${field}`);
}

function providerDataError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, `ossinsight returned invalid ${message}`);
}
