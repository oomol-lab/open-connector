import type { ProviderActionHandlerSubset } from "../provider-runtime.ts";

import { nullableString, optionalString, compactObject } from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import { dopplerRequest, readObject } from "./runtime.shared.ts";

interface DopplerTokenActionContext {
  accessToken: string;
  fetcher: typeof fetch;
}

type DopplerTokenActionHandler = (
  input: Record<string, unknown>,
  context: DopplerTokenActionContext,
) => Promise<unknown>;

export const dopplerTokenActionHandlers: Record<
  "list_service_tokens" | "create_service_token" | "delete_service_token",
  DopplerTokenActionHandler
> &
  ProviderActionHandlerSubset<"doppler", DopplerTokenActionHandler> = {
  list_service_tokens(input, context) {
    return dopplerListServiceTokens(input, context.accessToken, context.fetcher);
  },
  create_service_token(input, context) {
    return dopplerCreateServiceToken(input, context.accessToken, context.fetcher);
  },
  delete_service_token(input, context) {
    return dopplerDeleteServiceToken(input, context.accessToken, context.fetcher);
  },
};

async function dopplerListServiceTokens(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await dopplerRequest(
    accessToken,
    {
      path: "/v3/configs/config/tokens",
      query: {
        project: asRequiredString(input.project, "project"),
        config: asRequiredString(input.config, "config"),
      },
    },
    fetcher,
    "execute",
  );
  const record = readObject(payload, "service tokens");

  return {
    tokens: readTokenArray(record.tokens),
  };
}

async function dopplerCreateServiceToken(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await dopplerRequest(
    accessToken,
    {
      method: "POST",
      path: "/v3/configs/config/tokens",
      body: compactObject({
        project: asRequiredString(input.project, "project"),
        config: asRequiredString(input.config, "config"),
        name: asRequiredString(input.name, "name"),
        access: optionalString(input.access),
        expire_at: optionalString(input.expireAt),
      }),
    },
    fetcher,
    "execute",
  );
  const record = readObject(payload, "created service token");

  return {
    token: normalizeToken(record.token),
  };
}

async function dopplerDeleteServiceToken(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const slug = optionalString(input.slug);
  const token = optionalString(input.token);
  if (!slug && !token) {
    throw new ProviderRequestError(400, "slug or token is required");
  }

  await dopplerRequest(
    accessToken,
    {
      method: "DELETE",
      path: "/v3/configs/config/tokens/token",
      body: compactObject({
        project: asRequiredString(input.project, "project"),
        config: asRequiredString(input.config, "config"),
        slug,
        token,
      }),
    },
    fetcher,
    "execute",
  );

  return {
    success: true,
  };
}

function readTokenArray(payload: unknown) {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "malformed Doppler response: service tokens");
  }

  return payload.map((token) => normalizeToken(token));
}

function normalizeToken(payload: unknown) {
  const record = readObject(payload, "service token");

  return compactObject({
    slug: optionalString(record.slug),
    name: optionalString(record.name),
    key: optionalString(record.key),
    access: optionalString(record.access),
    project: optionalString(record.project),
    config: optionalString(record.config),
    environment: optionalString(record.environment),
    createdAt: optionalString(record.created_at),
    expiresAt: nullableString(record.expires_at),
  });
}

function asRequiredString(value: unknown, fieldName: string) {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}
