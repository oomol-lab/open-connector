import type { ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-executors.ts";

import { defineProviderExecutors } from "../provider-executors.ts";
import {
  runProviderRequest,
  readProviderJsonBody,
  readProviderErrorTextBody,
  ProviderRequestError,
} from "../provider-runtime.ts";

interface Context {
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

const service = "datacircle";
const base = "https://api.datacircle.dev/v1";

async function read(context: Context, path: string) {
  return runProviderRequest({ signal: context.signal, label: service }, async (signal) => {
    const response = await context.fetcher(`${base}${path}`, { signal });
    if (!response.ok) {
      throw new ProviderRequestError(response.status, await readProviderErrorTextBody(response, service, signal));
    }
    const data = await readProviderJsonBody(response, {
      emptyBody: null,
      invalidJsonMessage: "Provider returned invalid JSON.",
    });
    return { data };
  });
}

const handlers: ProviderActionHandlers<
  typeof service,
  (input: Record<string, unknown>, context: Context) => Promise<unknown>
> = {
  async list_apis(_input, context) {
    return read(context, "/apis");
  },
  async get_best_for_api(input, context) {
    return read(context, `/apis/${encodeURIComponent(String(input.slug))}/best`);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers,
  createContext: (context, fetcher): Context => ({ fetcher, signal: context.signal }),
});
