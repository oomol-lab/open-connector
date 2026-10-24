import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { HrmosContext } from "./runtime.ts";

import { defineProviderExecutors, mapProviderActionHandlers, requireApiKeyCredential } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { providerInputError } from "../provider-runtime.ts";
import { hrmosKintaiActions } from "./actions.ts";
import { authenticate, executeHrmosAction, hrmosBaseUrl, normalizeCompany, readHrmosError } from "./runtime.ts";

export const executors: ProviderExecutors = defineProviderExecutors<HrmosContext>({
  service: "hrmos_kintai",
  handlers: mapProviderActionHandlers(
    "hrmos_kintai",
    hrmosKintaiActions,
    (action) => (input: Record<string, unknown>, context: HrmosContext) =>
      executeHrmosAction(action.name, input, context),
  ),
  async createContext(context, fetcher) {
    const credential = await requireApiKeyCredential(context, "hrmos_kintai");
    return {
      company: normalizeCompany(credential.values.companyUrl ?? credential.metadata?.companyUrl),
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
      transitFiles: context.transitFiles,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const company = normalizeCompany(input.values.companyUrl);
    await authenticate(company, input.apiKey, fetcher, signal, true);
    return {
      profile: { accountId: company, displayName: company },
      grantedScopes: [],
      metadata: { companyUrl: company },
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "hrmos_kintai",
  async baseUrl(context) {
    const credential = await requireApiKeyCredential(context, "hrmos_kintai");
    return hrmosBaseUrl(normalizeCompany(credential.values.companyUrl ?? credential.metadata?.companyUrl));
  },
  auth: { type: "none" },
  readError: readHrmosError,
  async customizeRequest({ context, url, headers, fetcher }) {
    const credential = await requireApiKeyCredential(context, "hrmos_kintai");
    const company = normalizeCompany(credential.values.companyUrl ?? credential.metadata?.companyUrl);
    const prefix = new URL(hrmosBaseUrl(company)).pathname;
    if (url.origin !== "https://ieyasu.co" || !url.pathname.startsWith(`${prefix}/`)) {
      throw providerInputError("HRMOS Kintai proxy must stay within the connected company API");
    }
    let relativePath: string;
    try {
      relativePath = decodeURIComponent(url.pathname.slice(prefix.length));
    } catch {
      throw providerInputError("HRMOS Kintai proxy path has invalid encoding");
    }
    const segments = relativePath.split("/").filter(Boolean);
    if (segments.some((segment) => segment === "." || segment === ".." || segment.includes("\\"))) {
      throw providerInputError("HRMOS Kintai proxy path must not contain traversal segments");
    }
    if (segments[0] === "authentication") {
      throw providerInputError("HRMOS Kintai authentication endpoints are managed by the connection");
    }
    headers.set("authorization", `Token ${await authenticate(company, credential.apiKey, fetcher, context.signal)}`);
    headers.set("accept", "application/json");
  },
});
