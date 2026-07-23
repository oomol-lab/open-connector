import type { ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { CloudflareDocsActionContext } from "./runtime.ts";

import { defineProviderExecutors, requireCustomCredential } from "../provider-runtime.ts";
import { cloudflareDocsActionHandlers } from "./runtime.ts";

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
