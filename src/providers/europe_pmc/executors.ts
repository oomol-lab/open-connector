import type { ProviderExecutors } from "../../core/types.ts";

import { defineProviderExecutors, mapProviderActionSources } from "../provider-runtime.ts";
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
