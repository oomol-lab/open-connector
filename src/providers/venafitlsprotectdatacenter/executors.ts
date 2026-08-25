import type { CredentialValidators } from "../../core/types.ts";

import { isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { createProviderFetch } from "../provider-runtime.ts";
import { executors, validateVenafiDatacenterCredential } from "./runtime.ts";

export { executors };

export const credentialValidators: CredentialValidators = {
  customCredential(input, { fetcher, signal }) {
    const guardedFetcher = createProviderFetch({
      fetch: fetcher,
      allowPrivateNetwork: isPrivateNetworkAccessAllowed,
    });
    return validateVenafiDatacenterCredential(input.values, guardedFetcher, signal);
  },
};
