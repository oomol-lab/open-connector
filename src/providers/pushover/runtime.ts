import type { CredentialValidationResult, ProviderExecutors, TransitFileWriter } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { PushoverActionName } from "./actions.ts";

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { compactObject, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  ProviderRequestError,
  providerUserAgent,
  readTransitFileInput,
} from "../provider-runtime.ts";

const pushoverApiBaseUrl = "https://api.pushover.net";
export const pushoverVersionedApiBaseUrl: string = `${pushoverApiBaseUrl}/1`;
const pushoverIconBaseUrl = `${pushoverApiBaseUrl}/icons`;
const pushoverRealtimeUrl = "wss://client.pushover.net/push";
const pushoverUserAgent = providerUserAgent;
const pushoverDefaultTimeoutMs = 30_000;
const pushoverDefaultRealtimeTimeoutSeconds = 60;
const pushoverMaxRealtimeTimeoutSeconds = 300;
const pushoverMaxAttachmentBytes = 5 * 1024 * 1024;
const pushoverOpenClientOsCode = "O";

type PushoverRequestPhase = "validate" | "execute";
type TokenSource = "input" | "connection";
type PushoverCredentialKind = "app_token" | "team_token" | "client_secret" | "public";
type PushoverJsonValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Blob
  | File
  | Record<string, unknown>
  | Array<unknown>;
type PushoverActionHandler = (input: PushoverActionInput, fetcher: typeof fetch) => Promise<unknown>;
type PushoverActionInput = Record<string, unknown> & {
  apiKey: string;
  values?: Record<string, string>;
  input: Record<string, unknown>;
  transitFiles?: TransitFileWriter;
};
type PushoverSuccessPayload = {
  status: number;
  request: string;
  errors?: string[];
};
type PushoverTokenResolution = {
  token: string;
  source: TokenSource;
};
type TransitAttachmentInput = {
  fileId: string;
  name?: string;
  mimeType?: string;
};

function pushoverError(_code: string, message: string, status = 500, details?: unknown): ProviderRequestError {
  return new ProviderRequestError(status, message, details);
}

function createTimeoutSignal(input: { timeoutMs: number }): {
  signal: AbortSignal;
  didTimeout: boolean;
  cleanup(): void;
} {
  const controller = new AbortController();
  let didTimeout = false;
  const timeout = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, input.timeoutMs);
  return {
    signal: controller.signal,
    get didTimeout() {
      return didTimeout;
    },
    cleanup() {
      clearTimeout(timeout);
    },
  };
}

export const pushoverActionHandlers: Record<PushoverActionName, PushoverActionHandler> = {
  send_message(input, fetcher) {
    return sendPushoverMessage(input, fetcher);
  },
  validate_user_or_group(input, fetcher) {
    return validatePushoverUserOrGroup(input, fetcher);
  },
  get_app_limits(input, fetcher) {
    return getPushoverAppLimits(input, fetcher);
  },
  get_app_token(input) {
    return getResolvedAppToken(input);
  },
  get_team_api_token(input) {
    return getResolvedTeamToken(input);
  },
  store_team_api_token(input, fetcher) {
    return validateAndStoreTeamToken(input, fetcher);
  },
  get_app_icon_image(input, fetcher) {
    return getPushoverAppIconImage(input, fetcher);
  },
  get_receipt_status(input, fetcher) {
    return getPushoverReceiptStatus(input, fetcher);
  },
  cancel_receipt_retries(input, fetcher) {
    return cancelPushoverReceiptRetries(input, fetcher);
  },
  cancel_retries_by_tag(input, fetcher) {
    return cancelPushoverReceiptRetriesByTag(input, fetcher);
  },
  update_glances(input, fetcher) {
    return updatePushoverGlances(input, fetcher);
  },
  create_group(input, fetcher) {
    return createPushoverGroup(input, fetcher);
  },
  list_groups(input, fetcher) {
    return listPushoverGroups(input, fetcher);
  },
  get_group(input, fetcher) {
    return getPushoverGroup(input, fetcher);
  },
  add_group_user(input, fetcher) {
    return addPushoverGroupUser(input, fetcher);
  },
  remove_group_user(input, fetcher) {
    return removePushoverGroupUser(input, fetcher);
  },
  disable_group_user(input, fetcher) {
    return disablePushoverGroupUser(input, fetcher);
  },
  enable_group_user(input, fetcher) {
    return enablePushoverGroupUser(input, fetcher);
  },
  rename_group(input, fetcher) {
    return renamePushoverGroup(input, fetcher);
  },
  assign_license(input, fetcher) {
    return assignPushoverLicense(input, fetcher);
  },
  check_license_credits(input, fetcher) {
    return checkPushoverLicenseCredits(input, fetcher);
  },
  subscription_flow(input) {
    return validatePushoverSubscriptionFlow(input);
  },
  add_team_user(input, fetcher) {
    return addPushoverTeamUser(input, fetcher);
  },
  remove_team_user(input, fetcher) {
    return removePushoverTeamUser(input, fetcher);
  },
  client_login(input, fetcher) {
    return loginPushoverClient(input, fetcher);
  },
  register_client_device(input, fetcher) {
    return registerPushoverClientDevice(input, fetcher);
  },
  fetch_client_messages(input, fetcher) {
    return fetchPushoverClientMessages(input, fetcher);
  },
  ack_delete_messages_up_to_id(input, fetcher) {
    return acknowledgePushoverClientMessages(input, fetcher);
  },
  listen_client_websocket(input) {
    return listenPushoverClientWebsocket(input);
  },
};

export async function validatePushoverCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(400, message));
  const appLimits = await requestPushoverJson({
    path: "/apps/limits.json",
    query: {
      token: apiKey,
    },
    fetcher,
    phase: "validate",
    credentialKind: "app_token",
    tokenSource: "input",
  });

  const teamToken = optionalString(input.teamToken);
  let teamInfo: Record<string, unknown> | undefined;
  if (teamToken) {
    teamInfo = await requestPushoverJson({
      path: "/teams.json",
      query: {
        token: teamToken,
      },
      fetcher,
      phase: "validate",
      credentialKind: "team_token",
      tokenSource: "input",
    });
  }

  return {
    profile: {
      accountId: buildPushoverProviderAccountId(apiKey),
      displayName: "Pushover Application",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: pushoverVersionedApiBaseUrl,
      validationEndpoint: "/apps/limits.json",
      monthlyLimit: readRequiredInteger(appLimits, "limit"),
      remaining: readRequiredInteger(appLimits, "remaining"),
      reset: readRequiredInteger(appLimits, "reset"),
      teamName: teamInfo ? readOptionalString(teamInfo.name) : undefined,
      teamUserCount: teamInfo ? readOptionalArray(teamInfo.users).filter(isObject).length : undefined,
      teamValidationEndpoint: teamInfo ? "/teams.json" : undefined,
    }),
  };
}

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "pushover",
  Object.fromEntries(
    Object.entries(pushoverActionHandlers).map(([name, handler]) => [
      name,
      (input: Record<string, unknown>, context: ApiKeyProviderContext) =>
        handler({ apiKey: context.apiKey, values: {}, input, transitFiles: context.transitFiles }, context.fetcher),
    ]),
  ) as Record<string, (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>>,
  { skipDnsValidation: true },
);

async function sendPushoverMessage(input: PushoverActionInput, fetcher: typeof fetch) {
  const parsed = input.input as {
    token?: string;
    user: string;
    device?: string;
    message: string;
    title?: string;
    url?: string;
    url_title?: string;
    priority?: number;
    ttl?: number;
    retry?: number;
    expire?: number;
    html?: boolean;
    monospace?: boolean;
    timestamp?: number;
    callback?: string;
    sound?: string;
    tags?: string;
    attachment?: TransitAttachmentInput;
    attachment_type?: string;
    attachment_base64?: string;
  };
  const appToken = resolveAppToken(input, parsed.token);
  const attachment = await resolvePushoverAttachment({
    attachment: parsed.attachment,
    attachmentBase64: parsed.attachment_base64,
    attachmentType: parsed.attachment_type,
    transitFiles: input.transitFiles,
  });
  const form = createPushoverFormData({
    token: appToken.token,
    user: parsed.user,
    device: parsed.device,
    message: parsed.message,
    title: parsed.title,
    url: parsed.url,
    url_title: parsed.url_title,
    priority: parsed.priority,
    ttl: parsed.ttl,
    retry: parsed.retry,
    expire: parsed.expire,
    html: parsed.html ? "1" : undefined,
    monospace: parsed.monospace ? "1" : undefined,
    timestamp: parsed.timestamp,
    callback: parsed.callback,
    sound: parsed.sound,
    tags: parsed.tags,
    attachment: attachment?.file,
  });

  const payload = await requestPushoverJson({
    method: "POST",
    path: "/messages.json",
    body: form,
    fetcher,
    phase: "execute",
    credentialKind: "app_token",
    tokenSource: appToken.source,
  });

  return {
    status: readRequiredInteger(payload, "status"),
    request: readRequiredString(payload, "request"),
    ...(readOptionalString(payload.receipt) ? { receipt: readOptionalString(payload.receipt) } : {}),
    ...(isObject(payload.parameter_flags) ? { parameter_flags: payload.parameter_flags } : {}),
  };
}

async function validatePushoverUserOrGroup(input: PushoverActionInput, fetcher: typeof fetch) {
  const parsed = input.input as {
    token?: string;
    user: string;
    device?: string;
  };
  const appToken = resolveAppToken(input, parsed.token);
  const payload = await requestPushoverJson({
    method: "POST",
    path: "/users/validate.json",
    body: createPushoverFormData({
      token: appToken.token,
      user: parsed.user,
      ...(parsed.device ? { device: parsed.device } : {}),
    }),
    fetcher,
    phase: "execute",
    credentialKind: "app_token",
    tokenSource: appToken.source,
  });

  return {
    status: readRequiredInteger(payload, "status"),
    request: readRequiredString(payload, "request"),
    devices: readStringArray(payload.devices),
    licenses: readStringArray(payload.licenses),
  };
}

async function getPushoverAppLimits(input: PushoverActionInput, fetcher: typeof fetch) {
  const parsed = input.input as {
    token?: string;
  };
  const appToken = resolveAppToken(input, parsed.token);
  const payload = await requestPushoverJson({
    path: "/apps/limits.json",
    query: {
      token: appToken.token,
    },
    fetcher,
    phase: "execute",
    credentialKind: "app_token",
    tokenSource: appToken.source,
  });

  return {
    status: readRequiredInteger(payload, "status"),
    request: readRequiredString(payload, "request"),
    limit: readRequiredInteger(payload, "limit"),
    remaining: readRequiredInteger(payload, "remaining"),
    reset: readRequiredInteger(payload, "reset"),
    ...(isObject(payload.parameter_flags) ? { parameter_flags: payload.parameter_flags } : {}),
  };
}

async function getResolvedAppToken(input: PushoverActionInput) {
  const parsed = input.input as {
    token?: string;
  };
  return {
    token: resolveAppToken(input, parsed.token).token,
  };
}

async function getResolvedTeamToken(input: PushoverActionInput) {
  const parsed = input.input as {
    token?: string;
  };
  return {
    token: resolveTeamToken(input, parsed.token).token,
  };
}

async function validateAndStoreTeamToken(input: PushoverActionInput, fetcher: typeof fetch) {
  const parsed = input.input as {
    token: string;
  };
  await requestPushoverJson({
    path: "/teams.json",
    query: {
      token: parsed.token,
    },
    fetcher,
    phase: "execute",
    credentialKind: "team_token",
    tokenSource: "input",
  });

  return {
    success: true,
  };
}

async function getPushoverAppIconImage(input: PushoverActionInput, fetcher: typeof fetch) {
  const parsed = input.input as {
    icon: string;
  };
  const iconUrl = `${pushoverIconBaseUrl}/${encodeURIComponent(parsed.icon)}.png`;
  const timeout = createTimeoutSignal({ timeoutMs: pushoverDefaultTimeoutMs });
  try {
    const response = await fetcher(iconUrl, {
      method: "GET",
      headers: {
        "user-agent": pushoverUserAgent,
      },
      signal: timeout.signal,
    });
    if (!response.ok) {
      throw pushoverError(
        response.status === 404 ? "invalid_input" : "provider_error",
        response.status === 404
          ? `unknown pushover icon: ${parsed.icon}`
          : `pushover icon request failed with ${response.status} ${response.statusText}`.trim(),
        response.status === 404 ? 400 : 502,
      );
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    return {
      icon: parsed.icon,
      url: iconUrl,
      mimeType: response.headers.get("content-type") ?? "image/png",
      dataBase64: bytes.toString("base64"),
    };
  } finally {
    timeout.cleanup();
  }
}

async function getPushoverReceiptStatus(input: PushoverActionInput, fetcher: typeof fetch) {
  const parsed = input.input as {
    token?: string;
    receipt: string;
  };
  const appToken = resolveAppToken(input, parsed.token);
  const payload = await requestPushoverJson({
    path: `/receipts/${encodeURIComponent(parsed.receipt)}.json`,
    query: {
      token: appToken.token,
    },
    fetcher,
    phase: "execute",
    credentialKind: "app_token",
    tokenSource: appToken.source,
  });

  return {
    status: readRequiredInteger(payload, "status"),
    request: readRequiredString(payload, "request"),
    acknowledged: readBooleanLike(payload.acknowledged),
    acknowledged_at: readNullableUnixTimestamp(payload.acknowledged_at),
    acknowledged_by: readNullableString(payload.acknowledged_by),
    acknowledged_by_device: readNullableString(payload.acknowledged_by_device),
    called_back: readBooleanLike(payload.called_back),
    called_back_at: readNullableUnixTimestamp(payload.called_back_at),
    expires_at: readNullableUnixTimestamp(payload.expires_at),
    last_delivered_at: readNullableUnixTimestamp(payload.last_delivered_at),
    expired: readBooleanLike(payload.expired),
  };
}

async function cancelPushoverReceiptRetries(input: PushoverActionInput, fetcher: typeof fetch) {
  const parsed = input.input as {
    token?: string;
    receipt: string;
  };
  const appToken = resolveAppToken(input, parsed.token);
  const payload = await requestPushoverJson({
    method: "POST",
    path: `/receipts/${encodeURIComponent(parsed.receipt)}/cancel.json`,
    body: createPushoverFormData({
      token: appToken.token,
    }),
    fetcher,
    phase: "execute",
    credentialKind: "app_token",
    tokenSource: appToken.source,
  });

  return buildCommonSuccessPayload(payload);
}

async function cancelPushoverReceiptRetriesByTag(input: PushoverActionInput, fetcher: typeof fetch) {
  const parsed = input.input as {
    token?: string;
    tag: string;
  };
  const appToken = resolveAppToken(input, parsed.token);
  const payload = await requestPushoverJson({
    method: "POST",
    path: `/receipts/cancel_by_tag/${encodeURIComponent(parsed.tag)}.json`,
    body: createPushoverFormData({
      token: appToken.token,
    }),
    fetcher,
    phase: "execute",
    credentialKind: "app_token",
    tokenSource: appToken.source,
  });

  return buildCommonSuccessPayload(payload);
}

async function updatePushoverGlances(input: PushoverActionInput, fetcher: typeof fetch) {
  const parsed = input.input as {
    token?: string;
    user: string;
    device?: string;
    title?: string;
    text?: string;
    subtext?: string;
    count?: number;
    percent?: number;
  };
  const appToken = resolveAppToken(input, parsed.token);
  const payload = await requestPushoverJson({
    method: "POST",
    path: "/glances.json",
    body: createPushoverFormData({
      token: appToken.token,
      user: parsed.user,
      device: parsed.device,
      title: parsed.title,
      text: parsed.text,
      subtext: parsed.subtext,
      count: parsed.count,
      percent: parsed.percent,
    }),
    fetcher,
    phase: "execute",
    credentialKind: "app_token",
    tokenSource: appToken.source,
  });

  return buildCommonSuccessPayload(payload);
}

async function createPushoverGroup(input: PushoverActionInput, fetcher: typeof fetch) {
  const parsed = input.input as {
    token?: string;
    name: string;
  };
  const appToken = resolveAppToken(input, parsed.token);
  const payload = await requestPushoverJson({
    method: "POST",
    path: "/groups.json",
    body: createPushoverFormData({
      token: appToken.token,
      name: parsed.name,
    }),
    fetcher,
    phase: "execute",
    credentialKind: "app_token",
    tokenSource: appToken.source,
  });

  return {
    ...buildCommonSuccessPayload(payload),
    group: readRequiredString(payload, "group"),
  };
}

async function listPushoverGroups(input: PushoverActionInput, fetcher: typeof fetch) {
  const parsed = input.input as {
    token?: string;
  };
  const appToken = resolveAppToken(input, parsed.token);
  const payload = await requestPushoverJson({
    path: "/groups.json",
    query: {
      token: appToken.token,
    },
    fetcher,
    phase: "execute",
    credentialKind: "app_token",
    tokenSource: appToken.source,
  });

  return {
    ...buildCommonSuccessPayload(payload),
    groups: readOptionalArray(payload.groups)
      .filter(isObject)
      .map((group) => ({
        group: readRequiredString(group, "group"),
        name: readRequiredString(group, "name"),
      })),
  };
}

async function getPushoverGroup(input: PushoverActionInput, fetcher: typeof fetch) {
  const parsed = input.input as {
    token?: string;
    group_key: string;
  };
  const appToken = resolveAppToken(input, parsed.token);
  const payload = await requestPushoverJson({
    path: `/groups/${encodeURIComponent(parsed.group_key)}.json`,
    query: {
      token: appToken.token,
    },
    fetcher,
    phase: "execute",
    credentialKind: "app_token",
    tokenSource: appToken.source,
  });

  return {
    ...buildCommonSuccessPayload(payload),
    name: readRequiredString(payload, "name"),
    users: readOptionalArray(payload.users)
      .filter(isObject)
      .map((member) =>
        compactObject({
          ...member,
          user: readRequiredString(member, "user"),
          device: readNullableString(member.device),
          memo: readNullableString(member.memo),
          disabled:
            member.disabled === undefined || member.disabled === null ? undefined : readBooleanLike(member.disabled),
        }),
      ),
  };
}

async function addPushoverGroupUser(input: PushoverActionInput, fetcher: typeof fetch) {
  const parsed = input.input as {
    token?: string;
    group_key: string;
    user: string;
    device?: string;
    memo?: string;
  };
  const appToken = resolveAppToken(input, parsed.token);
  const payload = await requestPushoverJson({
    method: "POST",
    path: `/groups/${encodeURIComponent(parsed.group_key)}/add_user.json`,
    body: createPushoverFormData({
      token: appToken.token,
      user: parsed.user,
      device: parsed.device,
      memo: parsed.memo,
    }),
    fetcher,
    phase: "execute",
    credentialKind: "app_token",
    tokenSource: appToken.source,
  });

  return buildCommonSuccessPayload(payload);
}

async function removePushoverGroupUser(input: PushoverActionInput, fetcher: typeof fetch) {
  const parsed = input.input as {
    token?: string;
    group_key: string;
    user: string;
    device?: string;
  };
  const appToken = resolveAppToken(input, parsed.token);
  const payload = await requestPushoverJson({
    method: "POST",
    path: `/groups/${encodeURIComponent(parsed.group_key)}/remove_user.json`,
    body: createPushoverFormData({
      token: appToken.token,
      user: parsed.user,
      device: parsed.device,
    }),
    fetcher,
    phase: "execute",
    credentialKind: "app_token",
    tokenSource: appToken.source,
  });

  return buildCommonSuccessPayload(payload);
}

async function disablePushoverGroupUser(input: PushoverActionInput, fetcher: typeof fetch) {
  const parsed = input.input as {
    token?: string;
    group_key: string;
    user: string;
    device?: string;
  };
  const appToken = resolveAppToken(input, parsed.token);
  const payload = await requestPushoverJson({
    method: "POST",
    path: `/groups/${encodeURIComponent(parsed.group_key)}/disable_user.json`,
    body: createPushoverFormData({
      token: appToken.token,
      user: parsed.user,
      device: parsed.device,
    }),
    fetcher,
    phase: "execute",
    credentialKind: "app_token",
    tokenSource: appToken.source,
  });

  return buildCommonSuccessPayload(payload);
}

async function enablePushoverGroupUser(input: PushoverActionInput, fetcher: typeof fetch) {
  const parsed = input.input as {
    token?: string;
    group_key: string;
    user: string;
    device?: string;
  };
  const appToken = resolveAppToken(input, parsed.token);
  const payload = await requestPushoverJson({
    method: "POST",
    path: `/groups/${encodeURIComponent(parsed.group_key)}/enable_user.json`,
    body: createPushoverFormData({
      token: appToken.token,
      user: parsed.user,
      device: parsed.device,
    }),
    fetcher,
    phase: "execute",
    credentialKind: "app_token",
    tokenSource: appToken.source,
  });

  return buildCommonSuccessPayload(payload);
}

async function renamePushoverGroup(input: PushoverActionInput, fetcher: typeof fetch) {
  const parsed = input.input as {
    token?: string;
    group_key: string;
    name: string;
  };
  const appToken = resolveAppToken(input, parsed.token);
  const payload = await requestPushoverJson({
    method: "POST",
    path: `/groups/${encodeURIComponent(parsed.group_key)}/rename.json`,
    body: createPushoverFormData({
      token: appToken.token,
      name: parsed.name,
    }),
    fetcher,
    phase: "execute",
    credentialKind: "app_token",
    tokenSource: appToken.source,
  });

  return buildCommonSuccessPayload(payload);
}

async function assignPushoverLicense(input: PushoverActionInput, fetcher: typeof fetch) {
  const parsed = input.input as {
    token?: string;
    user?: string;
    email?: string;
    os?: string;
  };
  if (!parsed.user && !parsed.email) {
    throw pushoverError("invalid_input", "user or email is required", 400);
  }
  const appToken = resolveAppToken(input, parsed.token);
  const payload = await requestPushoverJson({
    method: "POST",
    path: "/licenses/assign.json",
    body: createPushoverFormData({
      token: appToken.token,
      user: parsed.user,
      email: parsed.email,
      os: parsed.os,
    }),
    fetcher,
    phase: "execute",
    credentialKind: "app_token",
    tokenSource: appToken.source,
  });

  return {
    ...buildCommonSuccessPayload(payload),
    credits: readRequiredInteger(payload, "credits"),
  };
}

async function checkPushoverLicenseCredits(input: PushoverActionInput, fetcher: typeof fetch) {
  const parsed = input.input as {
    token?: string;
  };
  const appToken = resolveAppToken(input, parsed.token);
  const payload = await requestPushoverJson({
    path: "/licenses.json",
    query: {
      token: appToken.token,
    },
    fetcher,
    phase: "execute",
    credentialKind: "app_token",
    tokenSource: appToken.source,
  });

  return {
    ...buildCommonSuccessPayload(payload),
    credits: readRequiredInteger(payload, "credits"),
  };
}

async function validatePushoverSubscriptionFlow(input: PushoverActionInput) {
  const parsed = input.input as {
    subscription_code: string;
  };
  return {
    subscription_code: parsed.subscription_code,
  };
}

async function addPushoverTeamUser(input: PushoverActionInput, fetcher: typeof fetch) {
  const parsed = input.input as {
    token?: string;
    email: string;
    name?: string;
    password?: string;
    instant?: boolean;
    admin?: boolean;
    group?: string;
  };
  const teamToken = resolveTeamToken(input, parsed.token);
  const payload = await requestPushoverJson({
    method: "POST",
    path: "/teams/add_user.json",
    body: createPushoverFormData({
      token: teamToken.token,
      email: parsed.email,
      name: parsed.name,
      password: parsed.password,
      instant: parsed.instant ? "true" : undefined,
      admin: parsed.admin ? "true" : undefined,
      group: parsed.group,
    }),
    fetcher,
    phase: "execute",
    credentialKind: "team_token",
    tokenSource: teamToken.source,
  });

  return buildCommonSuccessPayload(payload);
}

async function removePushoverTeamUser(input: PushoverActionInput, fetcher: typeof fetch) {
  const parsed = input.input as {
    token?: string;
    email: string;
  };
  const teamToken = resolveTeamToken(input, parsed.token);
  const payload = await requestPushoverJson({
    method: "POST",
    path: "/teams/remove_user.json",
    body: createPushoverFormData({
      token: teamToken.token,
      email: parsed.email,
    }),
    fetcher,
    phase: "execute",
    credentialKind: "team_token",
    tokenSource: teamToken.source,
  });

  return buildCommonSuccessPayload(payload);
}

async function loginPushoverClient(input: PushoverActionInput, fetcher: typeof fetch) {
  const parsed = input.input as {
    email: string;
    password: string;
    twofa?: string;
  };
  const payload = await requestPushoverJson({
    method: "POST",
    path: "/users/login.json",
    body: createPushoverFormData({
      email: parsed.email,
      password: parsed.password,
      twofa: parsed.twofa,
    }),
    fetcher,
    phase: "execute",
    credentialKind: "public",
    tokenSource: "input",
  });

  return {
    status: readRequiredInteger(payload, "status"),
    request: readRequiredString(payload, "request"),
    id: readRequiredString(payload, "id"),
    secret: readRequiredString(payload, "secret"),
  };
}

async function registerPushoverClientDevice(input: PushoverActionInput, fetcher: typeof fetch) {
  const parsed = input.input as {
    secret: string;
    name: string;
    os?: string;
  };
  const payload = await requestPushoverJson({
    method: "POST",
    path: "/devices.json",
    body: createPushoverFormData({
      secret: parsed.secret,
      name: parsed.name,
      os: parsed.os ?? pushoverOpenClientOsCode,
    }),
    fetcher,
    phase: "execute",
    credentialKind: "client_secret",
    tokenSource: "input",
  });

  return {
    status: readRequiredInteger(payload, "status"),
    request: readRequiredString(payload, "request"),
    id: readRequiredString(payload, "id"),
  };
}

async function fetchPushoverClientMessages(input: PushoverActionInput, fetcher: typeof fetch) {
  const parsed = input.input as {
    secret: string;
    device_id: string;
  };
  const payload = await requestPushoverJson({
    path: "/messages.json",
    query: {
      secret: parsed.secret,
      device_id: parsed.device_id,
    },
    fetcher,
    phase: "execute",
    credentialKind: "client_secret",
    tokenSource: "input",
  });

  return {
    status: readRequiredInteger(payload, "status"),
    request: readRequiredString(payload, "request"),
    messages: readOptionalArray(payload.messages).filter(isObject).map(normalizeClientMessage),
  };
}

async function acknowledgePushoverClientMessages(input: PushoverActionInput, fetcher: typeof fetch) {
  const parsed = input.input as {
    secret: string;
    device_id: string;
    message: string;
  };
  const payload = await requestPushoverJson({
    method: "POST",
    path: `/devices/${encodeURIComponent(parsed.device_id)}/update_highest_message.json`,
    body: createPushoverFormData({
      secret: parsed.secret,
      message: parsed.message,
    }),
    fetcher,
    phase: "execute",
    credentialKind: "client_secret",
    tokenSource: "input",
  });

  return buildCommonSuccessPayload(payload);
}

async function listenPushoverClientWebsocket(input: PushoverActionInput) {
  const parsed = input.input as {
    secret: string;
    device_id: string;
    timeout?: number;
  };
  if (typeof globalThis.WebSocket !== "function") {
    throw pushoverError("provider_not_configured", "WebSocket is unavailable in this runtime");
  }

  const timeoutSeconds = Math.min(
    Math.max(parsed.timeout ?? pushoverDefaultRealtimeTimeoutSeconds, 1),
    pushoverMaxRealtimeTimeoutSeconds,
  );

  return new Promise<{ events: Array<{ code: string; event: string; description: string }> }>((resolve, reject) => {
    const events: Array<{ code: string; event: string; description: string }> = [];
    const socket = new globalThis.WebSocket(pushoverRealtimeUrl);
    let settled = false;
    const timeoutHandle = globalThis.setTimeout(() => {
      try {
        socket.close(1000, "timeout");
      } catch {
        settleResolve();
      }
    }, timeoutSeconds * 1000);

    function settleResolve() {
      if (settled) {
        return;
      }
      settled = true;
      globalThis.clearTimeout(timeoutHandle);
      resolve({ events });
    }

    function settleReject(error: ProviderRequestError) {
      if (settled) {
        return;
      }
      settled = true;
      globalThis.clearTimeout(timeoutHandle);
      reject(error);
    }

    socket.addEventListener("open", () => {
      socket.send(`login:${parsed.device_id}:${parsed.secret}\n`);
    });

    socket.addEventListener("message", (event) => {
      const frames = normalizeWebSocketFrames(event.data);
      for (const frame of frames) {
        if (!frame) {
          continue;
        }
        events.push(normalizePushoverRealtimeEvent(frame));
        if (frame === "A" || frame === "E" || frame === "R") {
          try {
            socket.close();
          } catch {
            settleResolve();
          }
        }
      }
    });

    socket.addEventListener("error", () => {
      settleReject(pushoverError("provider_error", "pushover realtime websocket connection failed", 502));
    });

    socket.addEventListener("close", () => {
      settleResolve();
    });
  });
}

async function requestPushoverJson(input: {
  method?: "GET" | "POST";
  path: string;
  query?: Record<string, string | undefined>;
  body?: URLSearchParams | FormData;
  fetcher: typeof fetch;
  phase: PushoverRequestPhase;
  credentialKind: PushoverCredentialKind;
  tokenSource: TokenSource;
  timeoutMs?: number;
}) {
  const url = new URL(`${pushoverVersionedApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value == null || value === "") {
      continue;
    }
    url.searchParams.set(key, value);
  }

  const timeout = createTimeoutSignal({ timeoutMs: input.timeoutMs ?? pushoverDefaultTimeoutMs });
  try {
    const response = await input.fetcher(url.toString(), {
      method: input.method ?? "GET",
      headers: buildPushoverHeaders(input.body),
      body: input.body,
      signal: timeout.signal,
    });
    const text = await response.text();
    const payload = parseJsonObject(text);
    if (!payload) {
      throw pushoverError("provider_error", `pushover request returned a non-JSON response from ${input.path}`, 502);
    }

    const status = readOptionalInteger(payload.status);
    if (response.ok && status === 1) {
      return payload;
    }

    throw normalizePushoverRequestError({
      response,
      payload,
      phase: input.phase,
      credentialKind: input.credentialKind,
      tokenSource: input.tokenSource,
      rawBody: text,
    });
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout) {
      throw pushoverError(
        "provider_error",
        `pushover request timed out after ${(input.timeoutMs ?? pushoverDefaultTimeoutMs) / 1000} seconds`,
        504,
      );
    }
    throw pushoverError("provider_error", error instanceof Error ? error.message : "pushover request failed", 502);
  } finally {
    timeout.cleanup();
  }
}

function buildPushoverHeaders(body: URLSearchParams | FormData | undefined) {
  const headers: Record<string, string> = {
    "user-agent": pushoverUserAgent,
  };
  if (body instanceof URLSearchParams) {
    headers["content-type"] = "application/x-www-form-urlencoded;charset=UTF-8";
  }
  return headers;
}

function normalizePushoverRequestError(input: {
  response: Response;
  payload: Record<string, unknown>;
  phase: PushoverRequestPhase;
  credentialKind: PushoverCredentialKind;
  tokenSource: TokenSource;
  rawBody: string;
}) {
  const errors = readPushoverErrors(input.payload);
  const message =
    errors[0] ??
    (input.response.status === 412 && input.credentialKind === "public"
      ? "two-factor authentication code required"
      : `pushover request failed with ${input.response.status}`);

  if (input.response.status === 429) {
    return pushoverError("rate_limited", message, 429);
  }

  if (input.phase === "validate") {
    return pushoverError("invalid_input", message, 400);
  }

  if (isCredentialProblem(input.payload, input.response.status, input.credentialKind)) {
    if (input.credentialKind === "client_secret" || input.credentialKind === "public") {
      return pushoverError("invalid_input", message, 400);
    }
    if (input.tokenSource === "connection") {
      return pushoverError("credential_expired", message);
    }
    return pushoverError("invalid_input", message, 400);
  }

  if (input.response.status >= 400 && input.response.status < 500) {
    return pushoverError("invalid_input", message, 400);
  }

  return pushoverError(
    "provider_error",
    errors[0] ?? input.rawBody ?? message,
    input.response.status >= 500 ? 502 : 500,
  );
}

function isCredentialProblem(payload: Record<string, unknown>, status: number, credentialKind: PushoverCredentialKind) {
  if (status === 401 || status === 403) {
    return true;
  }
  const errors = readPushoverErrors(payload).join(" ").toLowerCase();
  if (!errors) {
    return false;
  }
  if (credentialKind === "app_token" || credentialKind === "team_token") {
    return errors.includes("token");
  }
  if (credentialKind === "client_secret") {
    return errors.includes("secret") || errors.includes("session");
  }
  if (credentialKind === "public") {
    return errors.includes("password") || errors.includes("two-factor") || errors.includes("login");
  }
  return false;
}

function resolveAppToken(input: PushoverActionInput, override?: string): PushoverTokenResolution {
  const explicitToken = override?.trim();
  if (explicitToken) {
    return {
      token: explicitToken,
      source: "input",
    };
  }
  return {
    token: requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(400, message)),
    source: "connection",
  };
}

function resolveTeamToken(input: PushoverActionInput, override?: string): PushoverTokenResolution {
  const explicitToken = override?.trim();
  if (explicitToken) {
    return {
      token: explicitToken,
      source: "input",
    };
  }
  const connectedToken = readOptionalString(input.values?.teamToken);
  if (!connectedToken) {
    throw pushoverError(
      "invalid_input",
      "team token is required; provide input.token or configure Team API Token in the provider connection",
      400,
    );
  }
  return {
    token: connectedToken,
    source: "connection",
  };
}

async function resolvePushoverAttachment(input: {
  attachment?: TransitAttachmentInput;
  attachmentBase64?: string;
  attachmentType?: string;
  transitFiles?: TransitFileWriter;
}) {
  const hasTransitAttachment = input.attachment != null;
  const hasInlineAttachment = Boolean(input.attachmentBase64 || input.attachmentType);
  if (hasTransitAttachment && hasInlineAttachment) {
    throw pushoverError(
      "invalid_input",
      "provide either attachment or attachment_base64/attachment_type, not both",
      400,
    );
  }

  if (input.attachment) {
    const transitFile = await readTransitFileInput(input.attachment, input);
    ensureAttachmentSize(new Uint8Array(await transitFile.file.arrayBuffer()), transitFile.name);
    return {
      file: transitFile.file,
    };
  }

  if (!input.attachmentBase64 && !input.attachmentType) {
    return undefined;
  }
  if (!input.attachmentBase64 || !input.attachmentType) {
    throw pushoverError("invalid_input", "attachment_base64 and attachment_type are required together", 400);
  }
  const bytes = decodeBase64Attachment(input.attachmentBase64);
  ensureAttachmentSize(bytes, "attachment");
  return {
    file: new File([bytes], "attachment", {
      type: input.attachmentType,
    }),
  };
}

function ensureAttachmentSize(bytes: Uint8Array, name: string) {
  if (bytes.byteLength > pushoverMaxAttachmentBytes) {
    throw pushoverError("invalid_input", `${name} exceeds the 5MB Pushover attachment limit`, 400);
  }
}

function decodeBase64Attachment(value: string) {
  const normalized = value.trim();
  let bytes: Buffer;
  try {
    bytes = Buffer.from(normalized, "base64");
  } catch {
    throw pushoverError("invalid_input", "attachment_base64 must be valid base64", 400);
  }

  if (bytes.byteLength === 0 || bytes.toString("base64") !== normalized.replace(/\s+/g, "")) {
    throw pushoverError("invalid_input", "attachment_base64 must be valid base64", 400);
  }

  return Uint8Array.from(bytes);
}

function createPushoverFormData(values: Record<string, PushoverJsonValue>) {
  const isMultipart = Object.values(values).some((value) => value instanceof File || value instanceof Blob);
  if (isMultipart) {
    const form = new FormData();
    for (const [key, value] of Object.entries(values)) {
      appendFormValue(form, key, value);
    }
    return form;
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value == null) {
      continue;
    }
    params.set(key, String(value));
  }
  return params;
}

function appendFormValue(form: FormData, key: string, value: PushoverJsonValue) {
  if (value == null) {
    return;
  }
  if (value instanceof File || value instanceof Blob) {
    form.set(key, value);
    return;
  }
  form.set(key, String(value));
}

function buildCommonSuccessPayload(payload: Record<string, unknown>): PushoverSuccessPayload {
  const errors = readPushoverErrors(payload);
  const output: PushoverSuccessPayload = {
    status: readRequiredInteger(payload, "status"),
    request: readRequiredString(payload, "request"),
  };
  if (errors.length > 0) {
    output.errors = errors;
  }
  return output;
}

function normalizeClientMessage(payload: Record<string, unknown>) {
  return compactObject({
    ...payload,
    id: readIdentifierString(payload.id_str, payload.id),
    umid: readNullableIdentifierString(payload.umid_str, payload.umid),
    aid: readNullableIdentifierString(payload.aid_str, payload.aid),
    app: readNullableString(payload.app),
    icon: readNullableString(payload.icon),
    title: readNullableString(payload.title),
    message: readRequiredString(payload, "message"),
    date: readNullableInteger(payload.date),
    priority: readNullableInteger(payload.priority),
    acked: payload.acked == null ? undefined : readBooleanLike(payload.acked),
    url: readNullableString(payload.url),
    url_title: readNullableString(payload.url_title),
    sound: readNullableString(payload.sound),
    html: payload.html == null ? undefined : readBooleanLike(payload.html),
  });
}

function normalizePushoverRealtimeEvent(code: string) {
  switch (code) {
    case "#":
      return {
        code,
        event: "keepalive",
        description: "Keep-alive frame with no follow-up action required.",
      };
    case "!":
      return {
        code,
        event: "new_message",
        description: "A new message is available and the client should sync messages.",
      };
    case "R":
      return {
        code,
        event: "reload",
        description: "Reconnect requested by the server.",
      };
    case "E":
      return {
        code,
        event: "error_relogin_required",
        description: "Permanent error reported by the server. The user should login again or re-enable the device.",
      };
    case "A":
      return {
        code,
        event: "error_session_replaced",
        description: "The device logged in from another session and the current session was closed.",
      };
    default:
      return {
        code,
        event: "unknown",
        description: "Unknown WebSocket frame returned by the Pushover realtime server.",
      };
  }
}

function normalizeWebSocketFrames(value: unknown) {
  const text =
    typeof value === "string"
      ? value
      : value instanceof ArrayBuffer
        ? Buffer.from(value).toString("utf8")
        : ArrayBuffer.isView(value)
          ? Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString("utf8")
          : "";
  return [...text].filter((char) => char !== "\n" && char !== "\r");
}

function buildPushoverProviderAccountId(apiKey: string) {
  return `pushover:app:${createHash("sha256").update(apiKey).digest("hex").slice(0, 16)}`;
}

function readPushoverErrors(payload: Record<string, unknown>) {
  const arrayErrors = readOptionalArray(payload.errors);
  if (arrayErrors.length > 0) {
    return arrayErrors.map((item) => String(item));
  }
  if (isObject(payload.errors)) {
    return Object.values(payload.errors)
      .flatMap((value) => (Array.isArray(value) ? value.map((item) => String(item)) : [String(value)]))
      .filter((item) => item.length > 0);
  }
  const singleError = readOptionalString(payload.error);
  return singleError ? [singleError] : [];
}

function parseJsonObject(value: string) {
  if (!value.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readIdentifierString(preferred: unknown, fallback: unknown) {
  const preferredString = readOptionalString(preferred);
  if (preferredString) {
    return preferredString;
  }
  const fallbackString = normalizeUnknownString(fallback);
  if (!fallbackString) {
    throw pushoverError("provider_error", "pushover response is missing an identifier", 502);
  }
  return fallbackString;
}

function readNullableIdentifierString(preferred: unknown, fallback: unknown) {
  const preferredString = readOptionalString(preferred);
  if (preferredString) {
    return preferredString;
  }
  return normalizeUnknownString(fallback) ?? null;
}

function normalizeUnknownString(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  return undefined;
}

function readRequiredString(payload: Record<string, unknown>, key: string) {
  const value = normalizeUnknownString(payload[key]);
  if (!value) {
    throw pushoverError("provider_error", `pushover response is missing ${key}`, 502);
  }
  return value;
}

function readOptionalString(value: unknown) {
  const normalized = normalizeUnknownString(value);
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function readNullableString(value: unknown) {
  return readOptionalString(value) ?? null;
}

function readRequiredInteger(payload: Record<string, unknown>, key: string) {
  const value = readOptionalInteger(payload[key]);
  if (value == null) {
    throw pushoverError("provider_error", `pushover response is missing ${key}`, 502);
  }
  return value;
}

function readOptionalInteger(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isInteger(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function readNullableInteger(value: unknown) {
  return readOptionalInteger(value) ?? null;
}

function readNullableUnixTimestamp(value: unknown) {
  const parsed = readOptionalInteger(value);
  if (parsed == null || parsed === 0) {
    return null;
  }
  return parsed;
}

function readBooleanLike(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "1" || normalized === "true") {
      return true;
    }
    if (normalized === "0" || normalized === "false") {
      return false;
    }
  }
  throw pushoverError("provider_error", "pushover response is missing a boolean value", 502);
}

function readStringArray(value: unknown) {
  return readOptionalArray(value)
    .map((item) => normalizeUnknownString(item))
    .filter((item): item is string => item != null);
}

function readOptionalArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item) => item !== undefined) : [];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
