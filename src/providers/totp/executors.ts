import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { defineProviderExecutors, requireCustomCredential } from "../provider-runtime.ts";
import { generateTotpCode, readTotpCredential, totpDigits, totpPeriodSeconds } from "./runtime.ts";

const service = "totp";

interface TotpActionContext {
  secret: string;
  username: string;
  website: string;
}

const totpActionHandlers: ProviderActionHandlers<
  "totp",
  (input: Record<string, unknown>, context: TotpActionContext) => Promise<unknown>
> = {
  async generate_code(_input, context): Promise<unknown> {
    return {
      ...(await generateTotpCode(context.secret)),
      website: context.website,
      username: context.username,
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<TotpActionContext>({
  service,
  handlers: totpActionHandlers,
  async createContext(context: ExecutionContext): Promise<TotpActionContext> {
    const credential = readTotpCredential((await requireCustomCredential(context, service)).values);
    return {
      secret: credential.secret,
      username: credential.username,
      website: credential.website,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async customCredential(input): Promise<CredentialValidationResult> {
    const credential = readTotpCredential(input.values);
    return {
      profile: {
        accountId: `${credential.websiteUrl.origin}#${credential.username}`,
        displayName: `${credential.username} at ${credential.websiteUrl.host}`,
      },
      grantedScopes: [],
      metadata: {
        websiteOrigin: credential.websiteUrl.origin,
        algorithm: "SHA-1",
        digits: totpDigits,
        periodSeconds: totpPeriodSeconds,
      },
    };
  },
};
