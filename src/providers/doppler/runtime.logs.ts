import type { ProviderActionHandlerSubset } from "../provider-runtime.ts";

import { optionalBoolean, optionalRecord, optionalString, compactObject } from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import { dopplerRequest, readObject } from "./runtime.shared.ts";

interface DopplerLogActionContext {
  accessToken: string;
  fetcher: typeof fetch;
}

type DopplerLogActionHandler = (input: Record<string, unknown>, context: DopplerLogActionContext) => Promise<unknown>;

export const dopplerLogActionHandlers: ProviderActionHandlerSubset<"doppler", DopplerLogActionHandler> = {
  list_config_logs(input, context) {
    return dopplerListConfigLogs(input, context.accessToken, context.fetcher);
  },
  get_config_log(input, context) {
    return dopplerGetConfigLog(input, context.accessToken, context.fetcher);
  },
};

async function dopplerListConfigLogs(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await dopplerRequest(
    accessToken,
    {
      path: "/v3/configs/config/logs",
      query: {
        project: asRequiredString(input.project, "project"),
        config: asRequiredString(input.config, "config"),
        page: asOptionalNumber(input.page),
        per_page: asOptionalNumber(input.perPage),
      },
    },
    fetcher,
    "execute",
  );
  const record = readObject(payload, "config logs");

  return compactObject({
    page: asOptionalNumber(record.page),
    logs: readLogArray(record.logs),
  });
}

async function dopplerGetConfigLog(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await dopplerRequest(
    accessToken,
    {
      path: "/v3/configs/config/log",
      query: {
        project: asRequiredString(input.project, "project"),
        config: asRequiredString(input.config, "config"),
        log: asRequiredString(input.log, "log"),
      },
    },
    fetcher,
    "execute",
  );
  const record = readObject(payload, "config log");

  return {
    log: normalizeLog(record.log),
  };
}

function readLogArray(payload: unknown) {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "malformed Doppler response: config logs");
  }

  return payload.map((log) => normalizeLog(log));
}

function normalizeLog(payload: unknown) {
  const record = readObject(payload, "config log");

  return compactObject({
    id: optionalString(record.id),
    text: optionalString(record.text),
    html: optionalString(record.html),
    config: optionalString(record.config),
    project: optionalString(record.project),
    environment: optionalString(record.environment),
    rollback: optionalBoolean(record.rollback),
    createdAt: optionalString(record.created_at),
    user: optionalRecord(record.user),
    diff: Array.isArray(record.diff) ? record.diff : undefined,
  });
}

function asRequiredString(value: unknown, fieldName: string) {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}

function asOptionalNumber(value: unknown) {
  return typeof value === "number" ? value : undefined;
}
