import type { OAuthProviderContext } from "../provider-runtime.ts";
import type { FeishuActionName } from "./actions.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";

const feishuOpenBaseUrl = "https://open.feishu.cn/open-apis";
const feishuUserInfoUrl = `${feishuOpenBaseUrl}/authen/v1/user_info`;

type FeishuActionContext = Pick<OAuthProviderContext, "accessToken" | "fetcher" | "signal">;
type FeishuActionHandler = (input: Record<string, unknown>, context: FeishuActionContext) => Promise<unknown>;

interface FeishuEnvelope {
  code?: unknown;
  msg?: unknown;
  data?: unknown;
}

export const feishuActionHandlers: Record<FeishuActionName, FeishuActionHandler> = {
  get_current_user(_input, context) {
    return feishuGetCurrentUser(context);
  },
};

async function feishuGetCurrentUser(context: FeishuActionContext): Promise<Record<string, unknown>> {
  const data = await fetchFeishuUserInfo({
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    signal: context.signal,
  });
  return normalizeFeishuUser(data);
}

/**
 * Fetch the authorized user's profile from Feishu's user_info endpoint.
 *
 * Shared by the get_current_user action and the OAuth credential validator so
 * the identity call has a single owner.
 */
export async function fetchFeishuUserInfo(input: {
  accessToken: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}): Promise<Record<string, unknown>> {
  const response = await input.fetcher(feishuUserInfoUrl, {
    method: "GET",
    headers: { authorization: `Bearer ${input.accessToken}` },
    signal: input.signal,
  });

  const rawText = await response.text();
  let envelope: FeishuEnvelope;
  try {
    envelope = JSON.parse(rawText) as FeishuEnvelope;
  } catch {
    throw new ProviderRequestError(502, "invalid Feishu JSON response");
  }

  const code = typeof envelope.code === "number" ? envelope.code : 0;
  if (!response.ok || code !== 0) {
    const message = optionalString(envelope.msg) ?? `Feishu user_info failed (HTTP ${response.status}).`;
    const status =
      response.status === 401 ? 401 : response.status >= 400 && response.status < 500 ? response.status : 502;
    throw new ProviderRequestError(status, code ? `Feishu ${code}: ${message}` : message);
  }

  return optionalRecord(envelope.data) ?? {};
}

function normalizeFeishuUser(data: Record<string, unknown>): Record<string, unknown> {
  return {
    openId: optionalString(data.open_id) ?? null,
    unionId: optionalString(data.union_id) ?? null,
    userId: optionalString(data.user_id) ?? null,
    name: optionalString(data.name) ?? null,
    enName: optionalString(data.en_name) ?? null,
    email: optionalString(data.email) ?? null,
    avatarUrl: optionalString(data.avatar_url) ?? null,
    tenantKey: optionalString(data.tenant_key) ?? null,
    raw: data,
  };
}
