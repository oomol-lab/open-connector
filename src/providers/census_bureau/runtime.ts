import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const censusBureauApiBaseUrl = "https://api.census.gov";

type CensusBureauPhase = "validate" | "execute";
type CensusBureauQueryValue = string | number | boolean;
type CensusBureauActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const censusBureauActionHandlers: ProviderActionHandlers<"census_bureau", CensusBureauActionHandler> = {
  list_datasets: listDatasets,
  list_variables: listVariables,
  list_groups: listGroups,
  get_group: getGroup,
  query_dataset(input, context) {
    return queryDataset(input, context, "execute");
  },
};

export async function validateCensusBureauCredential(
  input: { apiKey: string },
  options: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<CredentialValidationResult> {
  await queryDataset(
    {
      datasetPath: "2022/acs/acs5",
      variables: ["NAME"],
      for: "us:*",
    },
    {
      apiKey: requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message)),
      fetcher: options.fetcher,
      signal: options.signal,
    },
    "validate",
  );

  return {
    profile: {
      accountId: "census_bureau",
      displayName: "Census Bureau API Key",
    },
    grantedScopes: [],
    metadata: {
      validationEndpoint: "/data/2022/acs/acs5",
      apiBaseUrl: censusBureauApiBaseUrl,
      authMethod: "query_key",
    },
  };
}

async function listDatasets(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await censusBureauJsonRequest({
    path: "/data.json",
    query: {},
    context,
    phase: "execute",
  });
  const record = readRecord(payload, "Census datasets response");
  const datasets = readArray(record.dataset, "Census datasets response dataset").map(normalizeDataset);
  const filtered = filterDatasets(datasets, input);
  const offset = readOptionalInteger(input.offset, "offset") ?? 0;
  const limit = readOptionalInteger(input.limit, "limit") ?? 50;
  const page = filtered.slice(offset, offset + limit);

  return {
    datasets: page,
    count: page.length,
    totalMatched: filtered.length,
  };
}

async function listVariables(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const datasetPath = normalizeDatasetPath(input.datasetPath);
  const payload = await censusBureauJsonRequest({
    path: `/data/${datasetPath}/variables.json`,
    query: {},
    context,
    phase: "execute",
  });
  const record = readRecord(payload, "Census variables response");
  const variables = normalizeVariables(record.variables);

  return {
    variables,
    count: variables.length,
    raw: record,
  };
}

async function listGroups(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const datasetPath = normalizeDatasetPath(input.datasetPath);
  const payload = await censusBureauJsonRequest({
    path: `/data/${datasetPath}/groups.json`,
    query: {},
    context,
    phase: "execute",
  });
  const record = readRecord(payload, "Census groups response");
  const groups = readArray(record.groups, "Census groups response groups").map(normalizeGroup);

  return {
    groups,
    count: groups.length,
    raw: record,
  };
}

async function getGroup(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const datasetPath = normalizeDatasetPath(input.datasetPath);
  const group = readRequiredInputString(input.group, "group");
  const payload = await censusBureauJsonRequest({
    path: `/data/${datasetPath}/groups/${encodeURIComponent(group)}.json`,
    query: {},
    context,
    phase: "execute",
  });
  const record = readRecord(payload, "Census group response");

  return {
    group: {
      name: optionalString(record.name) ?? group,
      description: optionalString(record.description) ?? null,
      variables: normalizeVariables(record.variables),
      raw: record,
    },
  };
}

async function queryDataset(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  phase: CensusBureauPhase,
): Promise<unknown> {
  const datasetPath = normalizeDatasetPath(input.datasetPath);
  const query = buildDatasetQuery(input);
  const payload = await censusBureauJsonRequest({
    path: `/data/${datasetPath}`,
    query,
    context,
    phase,
  });

  return normalizeQueryRows(payload);
}

async function censusBureauJsonRequest(input: {
  path: string;
  query: Record<string, CensusBureauQueryValue | CensusBureauQueryValue[]>;
  context: ApiKeyProviderContext;
  phase: CensusBureauPhase;
}): Promise<unknown> {
  const url = new URL(input.path, censusBureauApiBaseUrl);
  for (const [key, value] of Object.entries(input.query)) {
    appendQueryValue(url, key, value);
  }
  url.searchParams.set("key", input.context.apiKey);

  let response: Response;
  let payload: unknown;
  try {
    response = await input.context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: input.context.signal,
    });
    payload = await readCensusBureauPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Census Bureau request failed: ${error.message}` : "Census Bureau request failed",
    );
  }

  if (!response.ok) {
    throw buildCensusBureauError(response.status, payload, input.phase);
  }

  return payload;
}

async function readCensusBureauPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function buildCensusBureauError(status: number, payload: unknown, phase: CensusBureauPhase): ProviderRequestError {
  const message = extractErrorMessage(payload) ?? "Census Bureau request failed";

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (status === 400 || status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(401, message, payload);
  }
  if (status === 400) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(status >= 500 ? 502 : status || 500, message, payload);
}

function extractErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return (
    optionalString(record.error) ??
    optionalString(record.message) ??
    optionalString(record.title) ??
    optionalString(record.description)
  );
}

function buildDatasetQuery(
  input: Record<string, unknown>,
): Record<string, CensusBureauQueryValue | CensusBureauQueryValue[]> {
  const variables = readStringArray(input.variables, "variables");
  const geoFor = readRequiredInputString(input.for, "for");
  const query: Record<string, CensusBureauQueryValue | CensusBureauQueryValue[]> = {
    get: variables.join(","),
    for: geoFor,
  };

  if (input.in !== undefined) {
    query.in = Array.isArray(input.in)
      ? input.in.map((value, index) => readRequiredInputString(value, `in[${index}]`)).join("+")
      : readRequiredInputString(input.in, "in");
  }

  const predicates = optionalRecord(input.predicates) ?? {};
  for (const [key, value] of Object.entries(predicates)) {
    if (["get", "for", "in", "key"].includes(key)) {
      throw new ProviderRequestError(400, `predicates must not include reserved Census query parameter: ${key}`);
    }
    query[key] = readPredicateValue(value, key);
  }

  return query;
}

function appendQueryValue(url: URL, key: string, value: CensusBureauQueryValue | CensusBureauQueryValue[]): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      url.searchParams.append(key, String(item));
    }
    return;
  }

  url.searchParams.set(key, String(value));
}

function normalizeDataset(value: unknown): Record<string, unknown> {
  const record = readRecord(value, "Census dataset");
  const identifier = readOptionalStringArray(record.identifier);
  const vintage = readNullableInteger(record.c_vintage);
  const datasetPath = deriveDatasetPath(record, vintage);
  const distributionUrl = deriveDistributionUrl(record);

  return {
    title: optionalString(record.title) ?? "",
    description: optionalString(record.description) ?? null,
    vintage,
    datasetPath,
    identifier,
    distributionUrl,
    raw: record,
  };
}

function filterDatasets(
  datasets: Array<Record<string, unknown>>,
  input: Record<string, unknown>,
): Array<Record<string, unknown>> {
  const search = optionalString(input.search)?.toLocaleLowerCase();
  const vintage = readOptionalInteger(input.vintage, "vintage");

  return datasets.filter((dataset) => {
    if (vintage !== undefined && dataset.vintage !== vintage) {
      return false;
    }
    if (!search) {
      return true;
    }

    const title = optionalString(dataset.title)?.toLocaleLowerCase() ?? "";
    const description = optionalString(dataset.description)?.toLocaleLowerCase();
    const datasetPath = optionalString(dataset.datasetPath)?.toLocaleLowerCase();
    return (
      title.includes(search) || (description?.includes(search) ?? false) || (datasetPath?.includes(search) ?? false)
    );
  });
}

function deriveDatasetPath(record: Record<string, unknown>, vintage: number | null): string | null {
  const components = readOptionalStringArray(record.c_dataset);
  if (vintage !== null && components.length > 0) {
    return [String(vintage), ...components].join("/");
  }

  const accessUrl = deriveDistributionUrl(record);
  if (!accessUrl) {
    return null;
  }

  try {
    const parsed = new URL(accessUrl);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const dataIndex = parts.indexOf("data");
    return dataIndex >= 0 ? parts.slice(dataIndex + 1).join("/") || null : null;
  } catch {
    return null;
  }
}

function deriveDistributionUrl(record: Record<string, unknown>): string | null {
  const distribution = Array.isArray(record.distribution) ? record.distribution : [];
  for (const item of distribution) {
    const itemRecord = optionalRecord(item);
    const accessUrl = optionalString(itemRecord?.accessURL);
    if (accessUrl) {
      return accessUrl;
    }
  }
  return null;
}

function normalizeVariables(value: unknown): Array<Record<string, unknown>> {
  const variables = readRecord(value, "Census variables object");
  return Object.entries(variables)
    .map(([name, child]) => normalizeVariable(name, child))
    .sort((left, right) => String(left.name).localeCompare(String(right.name)));
}

function normalizeVariable(name: string, value: unknown): Record<string, unknown> {
  const record = readRecord(value, `Census variable ${name}`);
  return {
    name,
    label: optionalString(record.label) ?? null,
    concept: optionalString(record.concept) ?? null,
    predicateType: optionalString(record.predicateType) ?? null,
    group: optionalString(record.group) ?? null,
    limit: readNullableInteger(record.limit),
    predicateOnly: readNullableBoolean(record.predicateOnly),
    required: readNullableBoolean(record.required),
    attributes: optionalString(record.attributes) ?? null,
    values: optionalRecord(record.values) ?? null,
    raw: record,
  };
}

function normalizeGroup(value: unknown): Record<string, unknown> {
  const record = readRecord(value, "Census group");
  return {
    name: optionalString(record.name) ?? "",
    description: optionalString(record.description) ?? null,
    variablesUrl: optionalString(record.variables) ?? null,
    raw: record,
  };
}

function normalizeQueryRows(payload: unknown): Record<string, unknown> {
  const rows = readArray(payload, "Census query response").map((row, index) =>
    readArray(row, `Census query response row ${index}`).map(normalizeCell),
  );
  if (rows.length === 0) {
    throw new ProviderRequestError(502, "Census Bureau query response was empty");
  }

  const columns = rows[0]!.map((cell, index) => {
    if (cell === null || cell === "") {
      throw new ProviderRequestError(502, `Census Bureau query response column ${index} was empty`);
    }
    return cell;
  });

  const dataRows = rows.slice(1).map((row) => {
    const normalized: Record<string, string | null> = {};
    columns.forEach((column, index) => {
      normalized[column] = row[index] ?? null;
    });
    return normalized;
  });

  return {
    columns,
    rows: dataRows,
    rawRows: rows,
    rowCount: dataRows.length,
  };
}

function normalizeCell(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return String(value);
}

function normalizeDatasetPath(value: unknown): string {
  const raw = readRequiredInputString(value, "datasetPath");
  const withoutDataPrefix = raw.startsWith("/data/")
    ? raw.slice("/data/".length)
    : raw.startsWith("data/")
      ? raw.slice("data/".length)
      : raw;
  const segments = withoutDataPrefix
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment !== "");

  if (segments.length === 0) {
    throw new ProviderRequestError(400, "datasetPath must include a Census dataset path");
  }
  if (
    segments.some(
      (segment) =>
        segment === "." ||
        segment === ".." ||
        segment.includes("?") ||
        segment.includes("#") ||
        segment.includes("\\") ||
        segment.includes(":"),
    )
  ) {
    throw new ProviderRequestError(400, "datasetPath contains an unsupported segment");
  }

  return segments.map((segment) => encodeURIComponent(segment)).join("/");
}

function readRecord(value: unknown, context: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${context} was not an object`);
  }
  return record;
}

function readArray(value: unknown, context: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${context} was not an array`);
  }
  return value;
}

function readRequiredInputString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}

function readStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a non-empty array`);
  }
  return value.map((item, index) => readRequiredInputString(item, `${fieldName}[${index}]`));
}

function readOptionalStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const parsed = optionalString(item);
    return parsed ? [parsed] : [];
  });
}

function readPredicateValue(value: unknown, fieldName: string): CensusBureauQueryValue | CensusBureauQueryValue[] {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      throw new ProviderRequestError(400, `predicates.${fieldName} must not be an empty array`);
    }
    return value.map((item, index) => readPredicateScalar(item, `${fieldName}[${index}]`));
  }

  return readPredicateScalar(value, fieldName);
}

function readPredicateScalar(value: unknown, fieldName: string): CensusBureauQueryValue {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "boolean") {
    return value;
  }

  throw new ProviderRequestError(400, `predicates.${fieldName} must be a scalar value`);
}

function readOptionalInteger(value: unknown, fieldName: string): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const parsed = optionalInteger(value);
  if (parsed === undefined) {
    throw new ProviderRequestError(400, `${fieldName} must be an integer`);
  }
  return parsed;
}

function readNullableInteger(value: unknown): number | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function readNullableBoolean(value: unknown): boolean | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLocaleLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }
  return null;
}
