import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { OAuthProviderContext } from "../provider-runtime.ts";
import type { FeishuActionRuntimeContext } from "./shared/client.ts";

import { optionalString } from "../../core/cast.ts";
import {
  defineOAuthProviderExecutors,
  getProviderActionHandler,
  mapProviderActionHandlers,
  ProviderRequestError,
} from "../provider-runtime.ts";
import { feishuActions } from "./actions.ts";
import { feishuActionHandlers, fetchFeishuUserInfo } from "./runtime.ts";
import { createFeishuApplicationActionHandlers } from "./shared/application-runtime.ts";
import { createFeishuApprovalActionHandlers } from "./shared/approval-runtime.ts";
import { createFeishuAttendanceActionHandlers } from "./shared/attendance-runtime.ts";
import { createFeishuBaseAdvancedActionHandlers } from "./shared/base-advanced-runtime.ts";
import { createFeishuBaseActionHandlers } from "./shared/base-runtime.ts";
import { createFeishuCalendarActionHandlers } from "./shared/calendar-runtime.ts";
import { createFeishuJsonRequest } from "./shared/client.ts";
import { createFeishuContactActionHandlers } from "./shared/contact-runtime.ts";
import { createFeishuDocsActionHandlers } from "./shared/docs-runtime.ts";
import { createFeishuDomainMediaActionHandlers } from "./shared/domain-media-runtime.ts";
import { createFeishuDriveAdvancedActionHandlers } from "./shared/drive-advanced-runtime.ts";
import { createFeishuDriveActionHandlers } from "./shared/drive-runtime.ts";
import { createFeishuFileActionHandlers } from "./shared/file-runtime.ts";
import { createFeishuImOrganizeActionHandlers } from "./shared/im-organize-runtime.ts";
import { createFeishuImActionHandlers } from "./shared/im-runtime.ts";
import { createFeishuImUserActionHandlers } from "./shared/im-user-runtime.ts";
import { createFeishuMailAdvancedActionHandlers } from "./shared/mail-advanced-runtime.ts";
import { createFeishuMailActionHandlers } from "./shared/mail-runtime.ts";
import { createFeishuMarkdownRuntimeContext } from "./shared/markdown-feishu-runtime.ts";
import { createFeishuMarkdownActionHandlers } from "./shared/markdown-runtime.ts";
import { createFeishuMinutesActionHandlers } from "./shared/minutes-runtime.ts";
import { createFeishuNoteActionHandlers } from "./shared/note-runtime.ts";
import { createFeishuOkrActionHandlers } from "./shared/okr-runtime.ts";
import { createFeishuSheetsAdvancedActionHandlers } from "./shared/sheets-advanced-runtime.ts";
import { createFeishuSheetsActionHandlers } from "./shared/sheets-runtime.ts";
import { createFeishuSlidesActionHandlers } from "./shared/slides-runtime.ts";
import { createFeishuTaskActionHandlers } from "./shared/task-runtime.ts";
import { createFeishuVcActionHandlers } from "./shared/vc-runtime.ts";
import { createFeishuWhiteboardActionHandlers } from "./shared/whiteboard-runtime.ts";
import { createFeishuWikiActionHandlers } from "./shared/wiki-runtime.ts";

const service = "feishu";

interface FeishuHandler {
  (input: Record<string, unknown>, context: OAuthProviderContext): Promise<unknown>;
}

const allFeishuActionHandlers = mapProviderActionHandlers(
  service,
  feishuActions,
  (action): FeishuHandler =>
    async (input, context) => {
      const nativeHandler = getProviderActionHandler(feishuActionHandlers, action.name);
      if (nativeHandler) {
        return nativeHandler(input, context);
      }
      const sharedHandlers = createFeishuSharedHandlers(context);
      const sharedHandler = sharedHandlers[action.name];
      if (!sharedHandler) {
        throw new ProviderRequestError(400, `unknown feishu action: ${action.name}`);
      }
      return sharedHandler(input);
    },
);

export const executors: ProviderExecutors = defineOAuthProviderExecutors(service, allFeishuActionHandlers);

function createFeishuSharedHandlers(
  context: OAuthProviderContext,
): Record<string, (input: Record<string, unknown>) => Promise<unknown>> {
  const runtimeContext: FeishuActionRuntimeContext = {
    identity: "user",
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    transitFiles: context.transitFiles,
    signal: context.signal,
  };
  const request = createFeishuJsonRequest(runtimeContext);
  return {
    ...createFeishuContactActionHandlers({ identity: "user", request }),
    ...createFeishuImActionHandlers({ identity: "user", request, context: runtimeContext }),
    ...createFeishuImUserActionHandlers(request),
    ...createFeishuImOrganizeActionHandlers(request),
    ...createFeishuBaseActionHandlers(request),
    ...createFeishuBaseAdvancedActionHandlers(request),
    ...createFeishuCalendarActionHandlers(request),
    ...createFeishuTaskActionHandlers(request),
    ...createFeishuWikiActionHandlers(request),
    ...createFeishuDocsActionHandlers(request),
    ...createFeishuDriveActionHandlers(request),
    ...createFeishuDriveAdvancedActionHandlers({
      request,
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      transitFiles: context.transitFiles,
      signal: context.signal,
    }),
    ...createFeishuSlidesActionHandlers(request),
    ...createFeishuWhiteboardActionHandlers(request),
    ...createFeishuAttendanceActionHandlers(request),
    ...createFeishuSheetsActionHandlers(request),
    ...createFeishuSheetsAdvancedActionHandlers(request),
    ...createFeishuApprovalActionHandlers(request),
    ...createFeishuMailActionHandlers(request, context.fetcher),
    ...createFeishuMailAdvancedActionHandlers(request),
    ...createFeishuMinutesActionHandlers(request),
    ...createFeishuNoteActionHandlers({
      request,
      transitFiles: context.transitFiles,
      signal: context.signal,
    }),
    ...createFeishuOkrActionHandlers(request),
    ...createFeishuFileActionHandlers({
      request,
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      transitFiles: context.transitFiles,
      signal: context.signal,
    }),
    ...createFeishuVcActionHandlers({ identity: "user", request }),
    ...createFeishuApplicationActionHandlers(request),
    ...createFeishuMarkdownActionHandlers(createFeishuMarkdownRuntimeContext({ request, context: runtimeContext })),
    ...createFeishuDomainMediaActionHandlers({
      request,
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      transitFiles: context.transitFiles,
      signal: context.signal,
    }),
  };
}

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
