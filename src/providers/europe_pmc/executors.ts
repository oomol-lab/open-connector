import type { ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineProviderExecutors, defineProviderProxy, mapProviderActionSources } from "../provider-runtime.ts";
import { europePmcApiBaseUrl } from "./request.ts";
import { europePmcActionHandlers } from "./runtime.ts";
const service = "europe_pmc";
interface EuropePmcContext {
  fetcher: typeof fetch;
}
const handlers = mapProviderActionSources(
  service,
  europePmcActionHandlers,
  (_name, handler) => (input: Record<string, unknown>, context: EuropePmcContext) => handler(input, context.fetcher),
);
export const executors: ProviderExecutors = defineProviderExecutors<EuropePmcContext>({
  service,
  handlers,
  createContext: (_context, fetcher) => ({ fetcher }),
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: europePmcApiBaseUrl,
  auth: { type: "none" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json, application/xml, text/xml, application/zip");
  },
});
