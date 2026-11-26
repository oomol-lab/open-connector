import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { InstagramContext } from "./runtime.ts";

import { optionalRecord } from "../../core/cast.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import { instagramLoginMode } from "./oauth.ts";
import {
  instagramActionHandlers,
  validateInstagramCredential,
  validateInstagramFacebookLoginCredential,
} from "./runtime.ts";

export { oauth } from "./oauth.ts";

const service = "instagram";

export const executors: ProviderExecutors = defineProviderExecutors<InstagramContext>({
  service,
  handlers: instagramActionHandlers,
  skipDnsValidation: true,
  async createContext(context, fetcher): Promise<InstagramContext> {
    const credential = await context.getCredential(service);
    if (credential?.authType === "oauth2") {
      return {
        accessToken: credential.accessToken,
        tokenType: credential.tokenType,
        accountId: credential.profile.accountId,
        providerSecret: credential.providerSecret,
        apiHost:
          instagramLoginMode(optionalRecord(credential.metadata.oauthClientExtra)) === "unified"
            ? "facebook"
            : "instagram",
        fetcher,
        transitFiles: context.transitFiles,
        signal: context.signal,
      };
    }
    if (credential?.authType === "api_key") {
      return {
        accessToken: credential.apiKey,
        accountId: credential.profile.accountId,
        apiHost: "facebook",
        fetcher,
        transitFiles: context.transitFiles,
        signal: context.signal,
      };
    }
    throw new ProviderRequestError(401, `Connect ${service} with OAuth or an access token first.`);
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateInstagramFacebookLoginCredential(input, fetcher, signal);
  },
  oauth2(credential, { fetcher, signal }) {
    return validateInstagramCredential(credential, fetcher, signal);
  },
};
