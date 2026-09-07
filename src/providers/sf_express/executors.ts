import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
} from "../../core/types.ts";
import type { SfExpressActionContext } from "./runtime.ts";

import {
  combineProviderActionHandlers,
  defineProviderExecutors,
  requireCustomCredential,
} from "../provider-runtime.ts";
import { sfExpressColdchainHandlers } from "./runtime-coldchain.ts";
import { sfExpressFreightCoreHandlers } from "./runtime-freight-core.ts";
import { sfExpressFreightForwardCrossborderHandlers } from "./runtime-freight-forward-crossborder.ts";
import { sfExpressFreightInstallHandlers } from "./runtime-freight-install.ts";
import { sfExpressFreightTlCityHandlers } from "./runtime-freight-tl-city.ts";
import { sfExpressOrderHandlers } from "./runtime-order.ts";
import { sfExpressPrintHandlers } from "./runtime-print.ts";
import { sfExpressPushHandlers } from "./runtime-push.ts";
import { sfExpressQueryHandlers } from "./runtime-query.ts";
import { sfExpressStationHandlers } from "./runtime-stations.ts";
import { createSfExpressContext, validateSfExpressCredential } from "./runtime.ts";

const service = "sf_express";

export const executors: ProviderExecutors = defineProviderExecutors<SfExpressActionContext>({
  service,
  handlers: combineProviderActionHandlers(
    service,
    sfExpressQueryHandlers,
    sfExpressOrderHandlers,
    sfExpressPushHandlers,
    sfExpressPrintHandlers,
    sfExpressColdchainHandlers,
    sfExpressFreightCoreHandlers,
    sfExpressFreightTlCityHandlers,
    sfExpressFreightInstallHandlers,
    sfExpressFreightForwardCrossborderHandlers,
    sfExpressStationHandlers,
  ),
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<SfExpressActionContext> {
    const credential = await requireCustomCredential(context, service);
    return createSfExpressContext(credential.values, fetcher, context.signal);
  },
});

export const credentialValidators: CredentialValidators = {
  async customCredential(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    return validateSfExpressCredential(input.values, fetcher, signal);
  },
};
