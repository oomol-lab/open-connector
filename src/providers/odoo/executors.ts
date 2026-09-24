import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { OdooActionContext } from "./runtime.ts";

import { isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import {
  createProviderFetch,
  defineProviderExecutors,
  ProviderRequestError,
  providerInputError,
  requireCustomCredential,
} from "../provider-runtime.ts";
import { createOdooContext, odooActionHandlers } from "./runtime.ts";

export const executors: ProviderExecutors = defineProviderExecutors<OdooActionContext>({
  service: "odoo",
  handlers: odooActionHandlers,
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
  async createContext(context, fetcher): Promise<OdooActionContext> {
    const credential = await requireCustomCredential(context, "odoo");
    return createOdooContext(credential.values, fetcher, context.signal);
  },
});

export const credentialValidators: CredentialValidators = {
  async customCredential(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const guardedFetcher = createProviderFetch({ fetch: fetcher, allowPrivateNetwork: isPrivateNetworkAccessAllowed });
    try {
      const context = await createOdooContext(input.values, guardedFetcher, signal);
      return {
        profile: {
          accountId: `${context.endpoint}:${context.database}:${context.uid}`,
          displayName: `${context.username} (${context.database})`,
        },
      };
    } catch (error) {
      if (error instanceof ProviderRequestError && (error.status === 401 || error.status === 403)) {
        throw providerInputError(error.message);
      }
      throw error;
    }
  },
};
