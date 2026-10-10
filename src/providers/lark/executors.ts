import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { optionalString } from "../../core/cast.ts";
import { createFeishuBaseActionHandlers } from "../feishu/shared/base-runtime.ts";
import { createFeishuCalendarActionHandlers } from "../feishu/shared/calendar-runtime.ts";
import { createFeishuJsonRequest } from "../feishu/shared/client.ts";
import { createFeishuDocsActionHandlers } from "../feishu/shared/docs-runtime.ts";
import { createFeishuDriveActionHandlers } from "../feishu/shared/drive-runtime.ts";
import { createFeishuTaskActionHandlers } from "../feishu/shared/task-runtime.ts";
import { createFeishuWikiActionHandlers } from "../feishu/shared/wiki-runtime.ts";
import { defineOAuthProviderExecutors, ProviderRequestError } from "../provider-runtime.ts";
import { larkActions } from "./actions.ts";

export const executors: ProviderExecutors = defineOAuthProviderExecutors(
  "lark",
  Object.fromEntries(
    larkActions.map((action) => [
      action.name,
      async (input, context) => {
        const request = createFeishuJsonRequest({ ...context, provider: "lark" });
        const handlers = {
          ...createFeishuDocsActionHandlers(request),
          ...createFeishuDriveActionHandlers(request),
          ...createFeishuWikiActionHandlers(request),
          ...createFeishuBaseActionHandlers(request),
          ...createFeishuCalendarActionHandlers(request),
          ...createFeishuTaskActionHandlers(request),
        };
        const handler = handlers[action.name];
        if (!handler) throw new ProviderRequestError(400, `Unknown Lark action: ${action.name}`);
        return handler(input);
      },
    ]),
  ),
);

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher, signal }) {
    const request = createFeishuJsonRequest({
      accessToken: input.accessToken,
      fetcher,
      signal,
      provider: "lark",
      phase: "validate",
    });
    const data = await request({ path: "/authen/v1/user_info" });
    const openId = optionalString(data.open_id);
    if (!openId) throw new ProviderRequestError(502, "Lark user_info response is missing open_id.");
    return {
      profile: { accountId: openId, displayName: optionalString(data.name) ?? openId },
      metadata: {
        ...input.metadata,
        openId,
        unionId: optionalString(data.union_id),
        tenantKey: optionalString(data.tenant_key),
      },
    };
  },
};
