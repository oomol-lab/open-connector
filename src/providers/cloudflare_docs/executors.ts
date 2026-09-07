import type { ExecutionContext, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { CloudflareDocsActionContext } from "./runtime.ts";

import { defineProviderExecutors, defineProviderProxy, requireCustomCredential } from "../provider-runtime.ts";
import { cloudflareDocsActionHandlers, cloudflareDocsMcpUrl } from "./runtime.ts";

const service = "cloudflare_docs";

export const executors: ProviderExecutors = defineProviderExecutors<CloudflareDocsActionContext>({
  service,
  handlers: cloudflareDocsActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<CloudflareDocsActionContext> {
    await requireCustomCredential(context, service);
    return {
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: cloudflareDocsMcpUrl,
  auth: { type: "none" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json, text/event-stream");
  },
});
