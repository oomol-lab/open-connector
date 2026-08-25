import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { defineProviderExecutors, mapProviderActionHandlers, ProviderRequestError } from "../provider-runtime.ts";
import { cochraneActions } from "./actions.ts";
import { executeCochraneAction, validateCochraneCredential } from "./runtime.ts";
const service = "cochrane";
interface CochraneContext {
  values: Record<string, string>;
  fetcher: typeof fetch;
}
const handlers: ProviderActionHandlers<"cochrane", ProviderRuntimeHandler<CochraneContext>> = mapProviderActionHandlers(
  service,
  cochraneActions,
  (_action, name) => (input, context) => executeCochraneAction(name, input, context.values, context.fetcher),
);
export const executors: ProviderExecutors = defineProviderExecutors<CochraneContext>({
  service,
  handlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await context.getCredential(service);
    if (!credential || credential.authType != "custom_credential")
      throw new ProviderRequestError(401, "Configure Cochrane credentials.");
    return { values: credential.values, fetcher };
  },
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  customCredential(input, { fetcher }) {
    return validateCochraneCredential(input.values, fetcher);
  },
};
