import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { optionalString } from "../../core/cast.ts";
import { defineOAuthProviderExecutors, ProviderRequestError } from "../provider-runtime.ts";
import { feishuActionHandlers, fetchFeishuUserInfo } from "./runtime.ts";

const service = "feishu";

export const executors: ProviderExecutors = defineOAuthProviderExecutors(service, feishuActionHandlers);

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const data = await fetchFeishuUserInfo({ accessToken: input.accessToken, fetcher, signal });
    const openId = optionalString(data.open_id);
    if (!openId) {
      throw new ProviderRequestError(502, "feishu user_info response is missing open_id.");
    }

    return {
      profile: {
        accountId: openId,
        displayName: optionalString(data.name) ?? openId,
      },
      metadata: {
        ...input.metadata,
        openId,
        unionId: optionalString(data.union_id),
        tenantKey: optionalString(data.tenant_key),
      },
    };
  },
};
