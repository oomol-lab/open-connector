import type { ProviderActionHandlerSubset } from "../provider-runtime.ts";

import { nullableString, optionalBoolean, optionalRecord, optionalString, compactObject } from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import { dopplerRequest, dopplerRequestWithResponse, readObject } from "./runtime.shared.ts";

interface DopplerSecretActionContext {
  accessToken: string;
  fetcher: typeof fetch;
}

type DopplerSecretActionHandler = (
  input: Record<string, unknown>,
  context: DopplerSecretActionContext,
) => Promise<unknown>;

export const dopplerSecretActionHandlers: ProviderActionHandlerSubset<"doppler", DopplerSecretActionHandler> = {
  list_secrets(input, context) {
    return dopplerListSecrets(input, context.accessToken, context.fetcher);
  },
  list_secret_names(input, context) {
    return dopplerListSecretNames(input, context.accessToken, context.fetcher);
  },
  get_secret(input, context) {
    return dopplerGetSecret(input, context.accessToken, context.fetcher);
  },
  download_secrets(input, context) {
    return dopplerDownloadSecrets(input, context.accessToken, context.fetcher);
  },
  update_secrets(input, context) {
    return dopplerUpdateSecrets(input, context.accessToken, context.fetcher);
  },
  delete_secret(input, context) {
    return dopplerDeleteSecret(input, context.accessToken, context.fetcher);
  },
  update_secret_note(input, context) {
    return dopplerUpdateSecretNote(input, context.accessToken, context.fetcher);
  },
  issue_dynamic_secret_lease(input, context) {
    return dopplerIssueDynamicSecretLease(input, context.accessToken, context.fetcher);
  },
  revoke_dynamic_secret_lease(input, context) {
    return dopplerRevokeDynamicSecretLease(input, context.accessToken, context.fetcher);
  },
};

async function dopplerListSecrets(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await dopplerRequest(
    accessToken,
    {
      path: "/v3/configs/config/secrets",
      query: {
        project: asRequiredString(input.project, "project"),
        config: asRequiredString(input.config, "config"),
        include_managed_secrets: optionalBoolean(input.includeManagedSecrets),
        include_dynamic_secrets: optionalBoolean(input.includeDynamicSecrets),
        dynamic_secrets_ttl_sec: asOptionalNumber(input.dynamicSecretsTtlSec),
      },
    },
    fetcher,
    "execute",
  );
  const record = readObject(payload, "secrets list");

  return {
    secrets: normalizeSecretsMap(record.secrets),
  };
}

async function dopplerGetSecret(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await dopplerRequest(
    accessToken,
    {
      path: "/v3/configs/config/secret",
      query: {
        project: asRequiredString(input.project, "project"),
        config: asRequiredString(input.config, "config"),
        name: asRequiredString(input.name, "name"),
      },
    },
    fetcher,
    "execute",
  );
  const record = readObject(payload, "secret");

  return {
    name: asRequiredString(record.name, "name"),
    value: normalizeSecretValue(record.value),
  };
}

async function dopplerListSecretNames(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await dopplerRequest(
    accessToken,
    {
      path: "/v3/configs/config/secrets/names",
      query: {
        project: asRequiredString(input.project, "project"),
        config: asRequiredString(input.config, "config"),
        include_managed_secrets: optionalBoolean(input.includeManagedSecrets),
        include_dynamic_secrets: optionalBoolean(input.includeDynamicSecrets),
      },
    },
    fetcher,
    "execute",
  );
  const record = readObject(payload, "secret names");

  return {
    names: readStringArray(record.names, "names"),
  };
}

async function dopplerDownloadSecrets(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const format = optionalString(input.format) ?? "json";
  const { payload } = await dopplerRequestWithResponse(
    accessToken,
    {
      path: "/v3/configs/config/secrets/download",
      query: {
        project: optionalString(input.project),
        config: optionalString(input.config),
        format,
        secrets: optionalString(input.secrets),
        name_transformer: optionalString(input.nameTransformer),
        include_dynamic_secrets: optionalBoolean(input.includeDynamicSecrets),
        dynamic_secrets_ttl_sec: asOptionalNumber(input.dynamicSecretsTtlSec),
      },
      headers: {
        accept: format === "json" || format === "dotnet-json" ? "application/json" : "text/plain",
      },
    },
    fetcher,
    "execute",
  );

  if (typeof payload === "string") {
    return {
      format,
      content: payload,
    };
  }

  return {
    format,
    secrets: normalizeDownloadedSecrets(payload),
  };
}

async function dopplerUpdateSecrets(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await dopplerRequest(
    accessToken,
    {
      method: "POST",
      path: "/v3/configs/config/secrets",
      body: {
        project: asRequiredString(input.project, "project"),
        config: asRequiredString(input.config, "config"),
        secrets: readStringRecord(input.secrets, "secrets"),
      },
    },
    fetcher,
    "execute",
  );
  const record = readObject(payload, "updated secrets");

  return {
    secrets: normalizeSecretsMap(record.secrets),
  };
}

async function dopplerDeleteSecret(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  await dopplerRequest(
    accessToken,
    {
      method: "DELETE",
      path: "/v3/configs/config/secret",
      query: {
        project: asRequiredString(input.project, "project"),
        config: asRequiredString(input.config, "config"),
        name: asRequiredString(input.name, "name"),
      },
    },
    fetcher,
    "execute",
  );

  return {
    success: true,
  };
}

async function dopplerUpdateSecretNote(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await dopplerRequest(
    accessToken,
    {
      method: "POST",
      path: "/v3/projects/project/note",
      query: {
        project: asRequiredString(input.project, "project"),
      },
      body: {
        secret: asRequiredString(input.secret, "secret"),
        note: asRequiredString(input.note, "note"),
      },
    },
    fetcher,
    "execute",
  );
  const record = readObject(payload, "secret note");

  return {
    secret: asRequiredString(record.secret, "secret"),
    note: asRequiredString(record.note, "note"),
  };
}

async function dopplerIssueDynamicSecretLease(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const payload = await dopplerRequest(
    accessToken,
    {
      method: "POST",
      path: "/v3/configs/config/dynamic_secrets/dynamic_secret/leases",
      body: {
        project: asRequiredString(input.project, "project"),
        config: asRequiredString(input.config, "config"),
        dynamic_secret: asRequiredString(input.dynamicSecret, "dynamicSecret"),
        ttl_sec: asRequiredNumber(input.ttlSec, "ttlSec"),
      },
    },
    fetcher,
    "execute",
  );
  const record = readObject(payload, "dynamic secret lease");

  return compactObject({
    success: optionalBoolean(record.success),
    id: optionalString(record.id),
    expiresAt: optionalString(record.expires_at),
    value: optionalRecord(record.value),
  });
}

async function dopplerRevokeDynamicSecretLease(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const payload = await dopplerRequest(
    accessToken,
    {
      method: "DELETE",
      path: "/v3/configs/config/dynamic_secrets/dynamic_secret/leases/lease",
      body: {
        project: asRequiredString(input.project, "project"),
        config: asRequiredString(input.config, "config"),
        dynamic_secret: asRequiredString(input.dynamicSecret, "dynamicSecret"),
        slug: asRequiredString(input.slug, "slug"),
      },
    },
    fetcher,
    "execute",
  );
  const record = optionalRecord(payload);

  return {
    success: record ? (optionalBoolean(record.success) ?? true) : true,
  };
}

function normalizeSecretsMap(payload: unknown) {
  const record = readObject(payload, "secrets map");
  return Object.fromEntries(Object.entries(record).map(([name, value]) => [name, normalizeSecretValue(value)]));
}

function normalizeSecretValue(payload: unknown) {
  const record = readObject(payload, "secret value");

  return compactObject({
    raw: optionalString(record.raw),
    computed: optionalString(record.computed),
    note: nullableString(record.note),
    rawVisibility: nullableString(record.raw_visibility),
    computedVisibility: nullableString(record.computed_visibility),
    rawValueType: asNullableObject(record.raw_value_type),
    computedValueType: asNullableObject(record.computed_value_type),
  });
}

function normalizeDownloadedSecrets(payload: unknown) {
  const record = readObject(payload, "downloaded secrets");
  const entries = Object.entries(record).map(([name, value]) => {
    if (typeof value !== "string") {
      throw new ProviderRequestError(502, "malformed Doppler response: downloaded secret");
    }
    return [name, value] as const;
  });

  return Object.fromEntries(entries);
}

function readStringRecord(payload: unknown, label: string) {
  const record = readObject(payload, label);
  const entries = Object.entries(record).map(([key, value]) => {
    if (typeof value !== "string") {
      throw new ProviderRequestError(400, `${label} values must be strings`);
    }
    return [key, value] as const;
  });

  return Object.fromEntries(entries);
}

function readStringArray(payload: unknown, label: string) {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, `malformed Doppler response: ${label}`);
  }

  return payload.map((value) => asRequiredString(value, label));
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

function asRequiredNumber(value: unknown, fieldName: string) {
  if (typeof value !== "number") {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value;
}

function asNullableObject(value: unknown) {
  if (value === null) {
    return null;
  }
  return optionalRecord(value);
}
