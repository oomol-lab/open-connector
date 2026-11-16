import type { ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-executors.ts";

import { requiredString } from "../../core/cast.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import {
  ProviderRequestError,
  providerInputError,
  readProviderErrorTextBody,
  readProviderJsonBody,
  runProviderRequest,
} from "../provider-runtime.ts";

interface Context {
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

const service = "internetdata";
const internetdataApiBaseUrl = "https://api.internetdata.io";

const handlers: ProviderActionHandlers<
  typeof service,
  (input: Record<string, unknown>, context: Context) => Promise<unknown>
> = {
  async lookup_ip(input, context) {
    const ip = requiredString(input.ip, "ip", providerInputError);
    return runProviderRequest({ signal: context.signal, label: service }, async (signal) => {
      const response = await context.fetcher(`${internetdataApiBaseUrl}/${encodeURIComponent(ip)}`, { signal });
      if (!response.ok) {
        throw new ProviderRequestError(response.status, await readProviderErrorTextBody(response, service, signal));
      }
      return readProviderJsonBody(response, {
        emptyBody: null,
        invalidJsonMessage: "InternetData returned invalid JSON.",
      });
    });
  },
};

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers,
  createContext: (context, fetcher): Context => ({ fetcher, signal: context.signal }),
});
