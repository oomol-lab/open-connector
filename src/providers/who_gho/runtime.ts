import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const whoGhoApiBaseUrl = "https://ghoapi.azureedge.net/api";

interface DimensionFilter {
  field: string;
  operator: "eq" | "ne";
  value: string | null;
}

interface ODataPage {
  value: unknown[];
}

export async function executeWhoGhoAction(
  actionName: string,
  input: Record<string, unknown>,
  fetcher: typeof fetch,
): Promise<unknown> {
  const url = buildWhoGhoUrl(actionName, input);
  let response: Response;
  try {
    response = await fetcher(url, {
      headers: {
        "accept": "application/json",
        "user-agent": providerUserAgent,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "request failed";
    throw new ProviderRequestError(502, `WHO GHO request failed: ${message}`);
  }

  if (!response.ok) {
    const message = await readErrorMessage(response);
    const userSelectedResource = actionName === "list_dimension_values" || actionName === "get_indicator_data";
    if (response.status === 400 || (response.status === 404 && userSelectedResource)) {
      throw new ProviderRequestError(400, message);
    }
    if (response.status === 429) {
      throw new ProviderRequestError(429, message);
    }
    throw new ProviderRequestError(response.status, message);
  }

  const payload = await readODataPage(response);
  const items = payload.value;
  return {
    items,
    count: items.length,
  };
}

function buildWhoGhoUrl(actionName: string, input: Record<string, unknown>): string {
  let path: string;
  let filter: string | undefined;

  if (actionName === "list_dimensions") {
    path = "Dimension";
  } else if (actionName === "list_dimension_values") {
    path = `DIMENSION/${readCode(input.dimensionCode, "dimensionCode")}/DimensionValues`;
  } else if (actionName === "search_indicators") {
    path = "Indicator";
    const query = readOptionalString(input.query);
    if (query) {
      const escapedQuery = escapeODataString(query);
      filter =
        input.exactMatch === true ? `IndicatorName eq '${escapedQuery}'` : `contains(IndicatorName,'${escapedQuery}')`;
    }
  } else {
    path = readCode(input.indicatorCode, "indicatorCode");
    filter = buildIndicatorFilter(input);
  }

  const url = new URL(`${whoGhoApiBaseUrl}/${path}`);
  url.searchParams.set("$top", String(input.top ?? 100));
  appendIntegerQuery(url, "$skip", input.skip);
  if (filter) {
    url.searchParams.set("$filter", filter);
  }
  return url.toString();
}

function buildIndicatorFilter(input: Record<string, unknown>) {
  const clauses: string[] = [];
  if (Array.isArray(input.filters)) {
    for (const candidate of input.filters) {
      const filter = candidate as DimensionFilter;
      const value = filter.value === null ? "null" : `'${escapeODataString(filter.value)}'`;
      clauses.push(`${filter.field} ${filter.operator} ${value}`);
    }
  }

  if (typeof input.startYear === "number") {
    clauses.push(`TimeDim ge ${input.startYear}`);
  }
  if (typeof input.endYear === "number") {
    clauses.push(`TimeDim le ${input.endYear}`);
  }
  if (typeof input.startYear === "number" && typeof input.endYear === "number" && input.startYear > input.endYear) {
    throw new ProviderRequestError(400, "startYear must be less than or equal to endYear");
  }
  return clauses.length > 0 ? clauses.join(" and ") : undefined;
}

function readCode(value: unknown, fieldName: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    const allowed =
      character === "_" || (48 <= code && code <= 57) || (65 <= code && code <= 90) || (97 <= code && code <= 122);
    if (!allowed) {
      throw new ProviderRequestError(400, `${fieldName} may contain only letters, numbers, and underscores`);
    }
  }
  return encodeURIComponent(value);
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function appendIntegerQuery(url: URL, name: string, value: unknown) {
  if (typeof value === "number") {
    url.searchParams.set(name, String(value));
  }
}

function escapeODataString(value: string) {
  return value.split("'").join("''");
}

async function readErrorMessage(response: Response) {
  const text = await response.text();
  if (!text) {
    return `WHO GHO request failed with status ${response.status}`;
  }
  try {
    const payload = JSON.parse(text) as { error?: { message?: string } };
    return payload.error?.message ?? text;
  } catch {
    return text;
  }
}

async function readODataPage(response: Response): Promise<ODataPage> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ProviderRequestError(502, "WHO GHO returned invalid JSON");
  }
  if (payload == null || typeof payload !== "object" || !("value" in payload) || !Array.isArray(payload.value)) {
    throw new ProviderRequestError(502, "WHO GHO response is missing the OData value array");
  }
  return { value: payload.value };
}
