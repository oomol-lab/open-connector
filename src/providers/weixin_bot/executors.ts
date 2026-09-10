import type { ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { WeixinBotContext } from "./runtime.ts";

import { ProviderRequestError, defineProviderExecutors, requireCustomCredential } from "../provider-runtime.ts";
import { weixinBotActionHandlers } from "./runtime.ts";

const service = "weixin_bot";

export const executors: ProviderExecutors = defineProviderExecutors<WeixinBotContext>({
  service,
  handlers: weixinBotActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<WeixinBotContext> {
    const credential = await requireCustomCredential(context, service);
    const botToken = credential.values.botToken?.trim();
    const accountId = credential.values.accountId?.trim();
    if (!botToken || !accountId) {
      throw new ProviderRequestError(401, "Configure the Weixin bot token and bot account ID first.");
    }
    return { botToken, accountId, fetcher, signal: context.signal, transitFiles: context.transitFiles };
  },
});
