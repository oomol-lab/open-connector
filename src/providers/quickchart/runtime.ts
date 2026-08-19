import type { ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject } from "../../core/cast.ts";
import { defineProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const quickchartBaseUrl = "https://quickchart.io";

type QuickchartActionHandler = (input: Record<string, unknown>, context: { fetcher: typeof fetch }) => Promise<unknown>;

export const quickchartActionHandlers: ProviderActionHandlers<"quickchart", QuickchartActionHandler> = {
  async build_chart_url(input: Record<string, unknown>) {
    return buildChartUrl(input);
  },
  async create_chart_short_url(input: Record<string, unknown>, context: { fetcher: typeof fetch }) {
    return createChartShortUrl(input, context.fetcher);
  },
  async build_qr_url(input: Record<string, unknown>) {
    return buildQrUrl(input);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors({
  service: "quickchart",
  handlers: quickchartActionHandlers,
  createContext(_context, fetcher): { fetcher: typeof fetch } {
    return { fetcher };
  },
});

type QuickchartChartInput = {
  chart: Record<string, unknown>;
  width?: number;
  height?: number;
  devicePixelRatio?: number;
  backgroundColor?: string;
  version?: string;
  format?: string;
};

type QuickchartShortUrlInput = QuickchartChartInput & {
  key?: string;
};

type QuickchartQrInput = {
  text: string;
  size?: number;
  margin?: number;
  dark?: string;
  light?: string;
  ecLevel?: string;
  format?: string;
};

export function buildChartUrl(input: Record<string, unknown>): { url: string } {
  return {
    url: createChartUrl(input as QuickchartChartInput).toString(),
  };
}

export async function createChartShortUrl(
  input: Record<string, unknown>,
  fetcher: typeof fetch,
): Promise<{ success: boolean; url: string | null; raw: unknown }> {
  const body = buildChartRequestBody(input as QuickchartShortUrlInput);

  let response: Response;
  let payload: unknown;
  try {
    response = await fetcher(new URL("/chart/create", quickchartBaseUrl), {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify(body),
    });
    payload = await readQuickchartPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `quickchart request failed: ${error.message}` : "quickchart request failed",
    );
  }

  if (!response.ok) {
    throw createQuickchartError(response, payload);
  }

  const payloadObject = isRecord(payload) ? payload : {};
  return {
    success: payloadObject.success === true,
    url: typeof payloadObject.url === "string" ? payloadObject.url : null,
    raw: payload,
  };
}

export function buildQrUrl(input: Record<string, unknown>): { url: string } {
  const url = new URL("/qr", quickchartBaseUrl);
  const qrInput = input as QuickchartQrInput;
  url.searchParams.set("text", qrInput.text);

  const params = compactObject({
    size: qrInput.size,
    margin: qrInput.margin,
    dark: qrInput.dark,
    light: qrInput.light,
    ecLevel: qrInput.ecLevel,
    format: qrInput.format,
  });

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  return {
    url: url.toString(),
  };
}

function createChartUrl(input: QuickchartChartInput) {
  const url = new URL("/chart", quickchartBaseUrl);
  url.searchParams.set("chart", JSON.stringify(input.chart));

  const params = compactObject({
    width: input.width,
    height: input.height,
    devicePixelRatio: input.devicePixelRatio,
    backgroundColor: input.backgroundColor,
    version: input.version,
    format: input.format,
  });

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  return url;
}

function buildChartRequestBody(input: QuickchartShortUrlInput) {
  return compactObject({
    chart: input.chart,
    width: input.width,
    height: input.height,
    devicePixelRatio: input.devicePixelRatio,
    backgroundColor: input.backgroundColor,
    version: input.version,
    format: input.format,
    key: input.key,
  });
}

async function readQuickchartPayload(response: Response) {
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

function createQuickchartError(response: Response, payload: unknown) {
  const message = extractQuickchartErrorMessage(payload) ?? response.statusText ?? "quickchart request failed";

  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }

  if ([400, 404, 422].includes(response.status)) {
    return new ProviderRequestError(400, message);
  }

  return new ProviderRequestError(response.status >= 500 ? 502 : response.status || 502, message);
}

function extractQuickchartErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  if (!isRecord(payload)) {
    return undefined;
  }

  for (const field of ["message", "error", "detail"]) {
    const value = payload[field];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
