import type { ProviderActionHandlerSubset } from "../provider-runtime.ts";

import { nullableString, optionalRecord, optionalString, compactObject } from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import { dopplerRequest, readArray, readObject } from "./runtime.shared.ts";

interface DopplerIntegrationActionContext {
  accessToken: string;
  fetcher: typeof fetch;
}

type DopplerIntegrationActionHandler = (
  input: Record<string, unknown>,
  context: DopplerIntegrationActionContext,
) => Promise<unknown>;

export const dopplerIntegrationActionHandlers: Record<
  "list_integrations" | "get_integration" | "get_sync" | "create_sync" | "delete_sync",
  DopplerIntegrationActionHandler
> &
  ProviderActionHandlerSubset<"doppler", DopplerIntegrationActionHandler> = {
  list_integrations(input, context) {
    return dopplerListIntegrations(input, context.accessToken, context.fetcher);
  },
  get_integration(input, context) {
    return dopplerGetIntegration(input, context.accessToken, context.fetcher);
  },
  get_sync(input, context) {
    return dopplerGetSync(input, context.accessToken, context.fetcher);
  },
  create_sync(input, context) {
    return dopplerCreateSync(input, context.accessToken, context.fetcher);
  },
  delete_sync(input, context) {
    return dopplerDeleteSync(input, context.accessToken, context.fetcher);
  },
};

async function dopplerListIntegrations(_input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await dopplerRequest(
    accessToken,
    {
      path: "/v3/integrations",
    },
    fetcher,
    "execute",
  );
  const record = readObject(payload, "integrations");

  return compactObject({
    success: asOptionalBoolean(record.success),
    integrations: readArray(record.integrations, "integrations").map((integration) =>
      normalizeIntegration(readObject(integration, "integration")),
    ),
  });
}

async function dopplerGetIntegration(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await dopplerRequest(
    accessToken,
    {
      path: "/v3/integrations/integration",
      query: {
        integration: asRequiredString(input.integration, "integration"),
      },
    },
    fetcher,
    "execute",
  );
  const record = readObject(payload, "integration");

  return {
    integration: normalizeIntegration(readObject(record.integration, "integration")),
  };
}

async function dopplerGetSync(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await dopplerRequest(
    accessToken,
    {
      path: "/v3/configs/config/syncs/sync",
      query: {
        project: asRequiredString(input.project, "project"),
        config: asRequiredString(input.config, "config"),
        sync: asRequiredString(input.sync, "sync"),
      },
    },
    fetcher,
    "execute",
  );
  const record = readObject(payload, "sync");

  return {
    sync: normalizeSync(readObject(record.sync, "sync")),
  };
}

async function dopplerCreateSync(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await dopplerRequest(
    accessToken,
    {
      method: "POST",
      path: "/v3/configs/config/syncs",
      query: {
        project: asRequiredString(input.project, "project"),
        config: asRequiredString(input.config, "config"),
      },
      body: compactObject({
        integration: asRequiredString(input.integration, "integration"),
        data: asRequiredObject(input.data, "data"),
        import_option: optionalString(input.importOption),
        await_initial_sync: asOptionalBoolean(input.awaitInitialSync),
      }),
    },
    fetcher,
    "execute",
  );
  const record = readObject(payload, "created sync");

  return {
    sync: normalizeSync(readObject(record.sync, "sync")),
  };
}

async function dopplerDeleteSync(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await dopplerRequest(
    accessToken,
    {
      method: "DELETE",
      path: "/v3/configs/config/syncs/sync",
      query: {
        project: asRequiredString(input.project, "project"),
        config: asRequiredString(input.config, "config"),
        sync: asRequiredString(input.sync, "sync"),
        delete_from_target: asRequiredBoolean(input.deleteFromTarget, "deleteFromTarget"),
      },
    },
    fetcher,
    "execute",
  );

  return optionalRecord(payload) ?? {};
}

function normalizeIntegration(record: Record<string, unknown>) {
  return compactObject({
    ...record,
    slug: optionalString(record.slug),
    name: optionalString(record.name),
    type: optionalString(record.type),
    kind: optionalString(record.kind),
    enabled: asOptionalBoolean(record.enabled),
    syncs: Array.isArray(record.syncs)
      ? record.syncs.map((sync) => normalizeSync(readObject(sync, "sync")))
      : undefined,
  });
}

function normalizeSync(record: Record<string, unknown>) {
  return compactObject({
    slug: optionalString(record.slug),
    integration: optionalString(record.integration),
    project: optionalString(record.project),
    config: optionalString(record.config),
    enabled: asOptionalBoolean(record.enabled),
    lastSyncedAt: nullableString(record.lastSyncedAt),
  });
}

function asRequiredString(value: unknown, fieldName: string) {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}

function asRequiredObject(value: unknown, fieldName: string) {
  const parsed = optionalRecord(value);
  if (!parsed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}

function asRequiredBoolean(value: unknown, fieldName: string) {
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value;
}

function asOptionalBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}
