import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderOAuthRuntime } from "../../oauth/oauth-token.ts";
import type { OAuthProviderContext } from "../provider-executors.ts";
import type { FeishuActionRuntimeContext } from "./shared/client.ts";

import { optionalNumber, optionalString } from "../../core/cast.ts";
import { expiresAtFromLifetime } from "../../oauth/oauth-token.ts";
import {
  defineOAuthProviderExecutors,
  getProviderActionHandler,
  mapProviderActionHandlers,
} from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  ProviderRequestError,
  readProviderJsonBody,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
import { feishuActions } from "./actions.ts";
import { feishuActionHandlers, feishuOpenBaseUrl, fetchFeishuUserInfo } from "./runtime.ts";
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

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: feishuOpenBaseUrl,
  auth: { type: "oauth_bearer" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

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

const expiredRefreshTokenCodes = new Set([20037, 20064, 20073]);
/** Feishu's refresh errors distinguish expired tokens from client configuration failures. */
export const oauth: ProviderOAuthRuntime = {
  async refreshAccessToken(input) {
    const { payload, ok, status } = await runProviderRequest({ label: "Feishu OAuth refresh" }, async (signal) => {
      const response = await input.fetcher("https://open.feishu.cn/open-apis/authen/v2/oauth/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grant_type: "refresh_token",
          client_id: input.clientConfig.clientId,
          client_secret: input.clientConfig.clientSecret,
          refresh_token: input.refreshToken,
        }),
        redirect: "manual",
        signal,
      });
      const payload = requiredResponseRecord(
        await readProviderJsonBody(response, {
          maxBytes: 1024 * 1024,
          emptyBody: {},
          invalidJsonMessage: "Feishu returned invalid token JSON",
        }),
        "Feishu token response",
      );
      return { payload, ok: response.ok, status: response.status };
    });
    const code = optionalNumber(payload.code);
    if (!ok || (code !== undefined && code !== 0)) {
      const message = `Feishu ${code ?? status}: ${optionalString(payload.error_description) ?? optionalString(payload.msg) ?? optionalString(payload.error) ?? "Token request failed"}`;
      if (code !== undefined && expiredRefreshTokenCodes.has(code)) throw input.createError(message);
      throw new ProviderRequestError(ok ? 400 : status, message, undefined, "provider_error");
    }
    const accessToken = optionalString(payload.access_token);
    if (!accessToken)
      throw new ProviderRequestError(502, "Feishu token response is missing access_token", undefined, "provider_error");
    const { access_token: _accessToken, refresh_token: _refreshToken, ...metadata } = payload;
    return {
      accessToken,
      refreshToken: optionalString(payload.refresh_token),
      tokenType: optionalString(payload.token_type) ?? "Bearer",
      expiresAt: expiresAtFromLifetime(payload.expires_in),
      metadata,
    };
  },
};
