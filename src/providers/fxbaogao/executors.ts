import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalRawString, optionalNumber } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, mapProviderActionHandlers } from "../provider-executors.ts";
import { defineProviderProxy, readProviderProxyErrorMessage } from "../provider-proxy.ts";
import {
  requiredInputString,
  requiredResponseRecord,
  ProviderRequestError,
  runProviderRequest,
  withRetryAfterSeconds,
} from "../provider-runtime.ts";
import { fxbaogaoActions } from "./actions.ts";

const baseUrl = "https://api.fxbaogao.com";
const defaultHeaders = { accept: "application/json", "content-type": "application/json" };
const routes: Record<string, string> = {
  search_reports: "/mofoun/agent/search",
  get_paragraphs: "/mofoun/agent/paragraph",
  get_pdf_url: "/mofoun/agent/download",
};
interface FxbaogaoRequest {
  route: string;
  input: Record<string, unknown>;
  apiKey: string;
  fetcher: typeof fetch;
  parentSignal?: AbortSignal;
}
async function request({ route, input, apiKey, fetcher, parentSignal }: FxbaogaoRequest) {
  try {
    return await runProviderRequest({ signal: parentSignal, label: "Fxbaogao" }, async (signal) => {
      const download = route === routes.get_pdf_url;
      const url = new URL(`${baseUrl}${route}`);
      if (download) url.searchParams.set("reportId", String(input.reportId));
      const response = await fetcher(url.toString(), {
        method: download ? "GET" : "POST",
        headers: { ...defaultHeaders, authorization: `Bearer ${apiKey}` },
        body: download ? undefined : JSON.stringify(input),
        signal,
      });
      const text = await response.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        payload = undefined;
      }
      const body = optionalRecord(payload);
      if (!response.ok || (body?.code != null && body.code !== 0)) {
        const detail =
          [
            optionalRawString(body?.code) ?? optionalNumber(body?.code),
            optionalRawString(body?.msg) ?? optionalRawString(body?.message),
          ]
            .filter((value) => value != null && value !== "")
            .join(": ") || `HTTP ${response.status}`;
        throw new ProviderRequestError(
          response.ok ? 502 : response.status,
          `Fxbaogao request failed: ${detail}`,
          undefined,
          response.status === 429 ? "rate_limited" : "provider_error",
        );
      }
      return requiredResponseRecord(payload, "Fxbaogao response");
    });
  } catch (error) {
    if (error instanceof ProviderRequestError) error.message = error.message.split(apiKey).join("[REDACTED]");
    throw error;
  }
}
function extractPdfResources(payload: Record<string, unknown>) {
  const resources: { field: string; url: string }[] = [];
  const seen = new Set<string>();
  const urlKeys = new Set(["pdfurl", "url", "fileurl", "downloadurl"]);
  function walk(value: unknown) {
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    const object = optionalRecord(value);
    if (!object) return;
    for (const [field, child] of Object.entries(object)) {
      if (typeof child !== "string") {
        walk(child);
        continue;
      }
      const key = field.toLowerCase();
      const reference = child.trim();
      if (
        !reference ||
        !(
          urlKeys.has(key) ||
          (key === "data" &&
            (reference.startsWith("http://") ||
              reference.startsWith("https://") ||
              reference.startsWith("/") ||
              reference.toLowerCase().includes(".pdf")))
        )
      )
        continue;
      try {
        const url = new URL(reference, "https://dr.fxbaogao.com/");
        if ((url.protocol === "https:" || url.protocol === "http:") && !seen.has(url.href)) {
          seen.add(url.href);
          resources.push({ field, url: url.href });
        }
      } catch {
        /* 忽略上游不可解析的下载地址。 */
      }
    }
  }
  walk(payload);
  return resources;
}
const handlers = mapProviderActionHandlers(
  "fxbaogao",
  fxbaogaoActions,
  (action) => async (dataInput: Record<string, unknown>, context: ApiKeyProviderContext) => {
    const route = routes[action.name];
    const query = dataInput;
    const body =
      action.name === "search_reports"
        ? {
            ...query,
            keywords: query.keywords ?? "",
            orgNames: query.orgNames ?? [],
            pageNum: query.pageNum ?? 1,
          }
        : query;
    const raw = await request({
      route: route,
      input: body,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      parentSignal: context.signal,
    });
    if (action.name === "search_reports") {
      const reports = Array.isArray(raw.data) ? raw.data : optionalRecord(raw.data)?.dataList;
      if (!Array.isArray(reports))
        throw new ProviderRequestError(
          502,
          "Fxbaogao search response is missing its report list",
          undefined,
          "provider_error",
        );
      return {
        reports: reports.map((value) => {
          const report = optionalRecord(value);
          if (!report || report.reportId == null) return value;
          return {
            ...report,
            reportUrl: `https://www.fxbaogao.com/view?id=${encodeURIComponent(String(report.reportId))}`,
          };
        }),
        raw,
      };
    }
    if (action.name === "get_pdf_url") return { reportId: query.reportId, resources: extractPdfResources(raw), raw };
    return raw;
  },
);
export const executors: ProviderExecutors = defineApiKeyProviderExecutors("fxbaogao", handlers, {
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input) {
    requiredInputString(input.apiKey, "API Key");
    return { profile: { displayName: "Fxbaogao API Key" }, grantedScopes: [], metadata: { apiBaseUrl: baseUrl } };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "fxbaogao",
  baseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    for (const [name, value] of Object.entries({ accept: "application/json", "content-type": "application/json" }))
      if (!headers.has(name)) headers.set(name, value);
  },
  async readError(response) {
    return new ProviderRequestError(
      response.status,
      await readProviderProxyErrorMessage(response, "Provider request failed"),
      withRetryAfterSeconds(response),
      response.status === 429 ? "rate_limited" : "provider_error",
    );
  },
});
