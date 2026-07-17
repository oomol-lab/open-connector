import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { createProviderFetch, defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { pixellabCharacterActionHandlers } from "./runtime-character.ts";
import { pixellabImageExtraActionHandlers } from "./runtime-image-extra.ts";
import { pixellabImageActionHandlers } from "./runtime-image.ts";
import { pixellabObjectActionHandlers } from "./runtime-object.ts";
import { pixellabUiActionHandlers } from "./runtime-ui.ts";
import { pixellabActionHandlers, validatePixellabCredential } from "./runtime.ts";

const service = "pixellab";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  service,
  {
    ...pixellabActionHandlers,
    ...pixellabImageActionHandlers,
    ...pixellabImageExtraActionHandlers,
    ...pixellabUiActionHandlers,
    ...pixellabCharacterActionHandlers,
    ...pixellabObjectActionHandlers,
  },
  { skipDnsValidation: true },
);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    const credentialFetch = createProviderFetch({ fetch: fetcher, skipDnsValidation: true });
    return validatePixellabCredential(input.apiKey, credentialFetch, signal);
  },
};
