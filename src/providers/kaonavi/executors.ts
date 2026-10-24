import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { defineProviderExecutors, requireCustomCredential } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { runProviderRequest, ProviderRequestError } from "../provider-runtime.ts";
import { kaonaviActionDefinitions } from "./actions.ts";
import { getKaonaviToken, kaonaviBaseUrl, readKaonaviResponse } from "./runtime.ts";

interface KaonaviContext {
  values: Record<string, string>;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}
export const executors: ProviderExecutors = defineProviderExecutors<KaonaviContext>({
  service: "kaonavi",
  async createContext(context, fetcher) {
    const credential = await requireCustomCredential(context, "kaonavi");
    return { values: credential.values, fetcher, signal: context.signal };
  },
  handlers: Object.fromEntries(
    kaonaviActionDefinitions.map((definition) => [
      definition.name,
      async (data: Record<string, unknown>, context: KaonaviContext) => {
        let path = definition.path;
        for (const key of ["sheetId", "customFieldId", "userId", "taskId"]) {
          if (data[key] !== undefined) path = path.replace(`{${key}}`, encodeURIComponent(String(data[key])));
        }
        const url = new URL(kaonaviBaseUrl + path);
        if (data.updatedSince !== undefined) url.searchParams.set("updated_since", String(data.updatedSince));
        if (data.getCalcType !== undefined) url.searchParams.set("get_calc_type", String(data.getCalcType));
        const bodyValue = definition.bodyField ? data[definition.bodyField] : undefined;
        const body =
          bodyValue === undefined
            ? undefined
            : JSON.stringify(definition.bodyWrapper ? { [definition.bodyWrapper]: bodyValue } : bodyValue);
        const token = await getKaonaviToken(context.values, context.fetcher, context.signal);
        return runProviderRequest({ label: "Kaonavi", signal: context.signal }, async (signal) => {
          const headers = new Headers({ "Kaonavi-Token": token, accept: "application/json" });
          if (body !== undefined) headers.set("content-type", "application/json");
          if (data.dryRun !== undefined) headers.set("Dry-Run", data.dryRun ? "1" : "0");
          const response = await context.fetcher(url, { method: definition.method ?? "GET", headers, body, signal });
          if (definition.method === "DELETE" && response.status === 204) return { success: true };
          return readKaonaviResponse(response);
        });
      },
    ]),
  ),
});
export const credentialValidators: CredentialValidators = {
  async customCredential(input, { fetcher, signal }) {
    await getKaonaviToken(input.values, fetcher, signal, true);
    return { profile: { displayName: "Kaonavi Account" }, grantedScopes: [] };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "kaonavi",
  baseUrl: kaonaviBaseUrl,
  auth: { type: "none" },
  sensitiveHeaders: ["Kaonavi-Token"],
  async customizeRequest({ context, fetcher, headers }) {
    const credential = await requireCustomCredential(context, "kaonavi");
    headers.set("Kaonavi-Token", await getKaonaviToken(credential.values, fetcher, context.signal));
    headers.set("accept", "application/json");
  },
  async readError(response) {
    try {
      await readKaonaviResponse(response);
    } catch (error) {
      if (error instanceof ProviderRequestError) return error;
      throw error;
    }
    return new ProviderRequestError(response.status, "Kaonavi request failed", undefined, "provider_error");
  },
});
