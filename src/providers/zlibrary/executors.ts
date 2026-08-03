import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ZLibraryRuntimeContext } from "./runtime.ts";

import { requiredString } from "../../core/cast.ts";
import { defineProviderExecutors, ProviderRequestError, requireCustomCredential } from "../provider-runtime.ts";
import { zlibraryActionHandlers, zlibraryEapiLoginWithFallback } from "./runtime.ts";

const service = "zlibrary";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: zlibraryActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<ZLibraryRuntimeContext> {
    const credential = await requireCustomCredential(context, service);
    const providerContext: ZLibraryRuntimeContext = {
      email: requiredString(credential.values.email, "email", (message) => new ProviderRequestError(400, message)),
      password: requiredString(
        credential.values.password,
        "password",
        (message) => new ProviderRequestError(400, message),
      ),
      eapiDomain: credential.values.eapiDomain ? String(credential.values.eapiDomain) : undefined,
      fetcher,
      signal: context.signal,
    };
    if (context.transitFiles) {
      providerContext.transitFiles = context.transitFiles;
    }
    return providerContext;
  },
});

export const credentialValidators: CredentialValidators = {
  async customCredential(input, { fetcher, signal }) {
    const email = requiredString(input.values.email, "email", (message) => new ProviderRequestError(400, message));
    const password = requiredString(
      input.values.password,
      "password",
      (message) => new ProviderRequestError(400, message),
    );
    const eapiDomain = input.values.eapiDomain ? String(input.values.eapiDomain) : undefined;
    const context: ZLibraryRuntimeContext = { email, password, eapiDomain, fetcher, signal };
    const session = await zlibraryEapiLoginWithFallback(context);
    return {
      profile: {
        accountId: email,
        displayName: email,
      },
      grantedScopes: [],
      metadata: {
        remixUserid: session.remixUserid,
        eapiDomain: session.domain,
      },
    };
  },
};
