import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { optionalInteger, optionalString } from "../../core/cast.ts";
import { defineBearerProviderExecutors } from "../provider-runtime.ts";
import { esaActionHandlers, requestEsaJson } from "./runtime.ts";

const service = "esa";

export const executors: ProviderExecutors = defineBearerProviderExecutors(service, esaActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    return validateEsaToken(input.apiKey, fetcher);
  },
  async oauth2(input, { fetcher }) {
    return validateEsaToken(input.accessToken, fetcher);
  },
};

async function validateEsaToken(accessToken: string, fetcher: typeof fetch) {
  const user = await requestEsaJson<Record<string, unknown>>({ accessToken, fetcher }, { path: "/v1/user" });
  const id = optionalInteger(user.id);
  const screenName = optionalString(user.screen_name);
  const name = optionalString(user.name);

  return {
    profile: {
      accountId: screenName ?? (id === undefined ? "esa:user" : String(id)),
      displayName: name ?? screenName ?? (id === undefined ? "esa user" : String(id)),
    },
    metadata: {
      currentUser: user,
    },
  };
}
