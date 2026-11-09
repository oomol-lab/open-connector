import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { TregContext } from "./runtime.ts";

import { optionalString } from "../../core/cast.ts";
import { requireApiKeyCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { providerInputError } from "../provider-runtime.ts";
import { readHome, requestTreg, tregActionHandlers } from "./runtime.ts";

export const executors: ProviderExecutors = defineProviderExecutors<TregContext>({
  service: "treg",
  skipDnsValidation: true,
  handlers: tregActionHandlers,
  async createContext(context, fetcher) {
    const credential = await requireApiKeyCredential(context, "treg");
    return {
      apiKey: credential.apiKey,
      team: optionalString(credential.metadata.team),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const team = optionalString(input.values.team);
    const { payload } = await requestTreg({ apiKey: input.apiKey, team, fetcher, signal, path: "/home" });
    const home = readHome(payload);
    if (team && team !== home.team) throw providerInputError("Treg token belongs to a different team");
    return {
      profile: { accountId: home.team, displayName: home.team },
      metadata: { team: home.team },
      grantedScopes: [],
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "treg",
  baseUrl: "https://treg.to",
  skipDnsValidation: true,
  auth: { type: "api_key_header", name: "X-Treg-Token" },
  async customizeRequest({ context, headers }) {
    const credential = await requireApiKeyCredential(context, "treg");
    headers.delete("X-Treg-Org");
    const team = optionalString(credential.metadata.team);
    if (team) headers.set("X-Treg-Org", team);
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});
