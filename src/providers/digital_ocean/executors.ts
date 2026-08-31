import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import {
  optionalIntegerLike,
  optionalRecord,
  optionalString,
  positiveInteger,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import { compactJson, encodePathSegment, jsonObject } from "../../core/request.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  providerInputError,
  providerResponseError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "digital_ocean";
const digitalOceanApiBaseUrl = "https://api.digitalocean.com/v2";

interface DigitalOceanContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type DigitalOceanActionHandler = (input: Record<string, unknown>, context: DigitalOceanContext) => Promise<unknown>;

export const digitalOceanActionHandlers: ProviderActionHandlers<"digital_ocean", DigitalOceanActionHandler> = {
  get_account(_input, context) {
    return getAccount(context);
  },
  list_droplets(input, context) {
    return listDroplets(input, context);
  },
  get_droplet(input, context) {
    return getDroplet(input, context);
  },
  manage_droplet_lifecycle(input, context) {
    return manageDropletLifecycle(input, context);
  },
  list_apps(input, context) {
    return listDigitalOceanCollection(input, context, "/apps", "apps", "apps", {
      with_projects: input.withProjects,
    });
  },
  list_databases(input, context) {
    return listDigitalOceanCollection(input, context, "/databases", "databases", "databases", {
      tag_name: optionalString(input.tagName),
    });
  },
  list_firewalls(input, context) {
    return listDigitalOceanCollection(input, context, "/firewalls", "firewalls", "firewalls");
  },
  list_load_balancers(input, context) {
    return listDigitalOceanCollection(input, context, "/load_balancers", "load_balancers", "loadBalancers");
  },
  list_domains(input, context) {
    return listDigitalOceanCollection(input, context, "/domains", "domains", "domains");
  },
  list_domain_records(input, context) {
    const domainName = requiredString(input.domainName, "domainName", providerInputError);
    return listDigitalOceanCollection(
      input,
      context,
      `/domains/${encodePathSegment(domainName)}/records`,
      "domain_records",
      "domainRecords",
      {
        name: optionalString(input.name),
        type: optionalString(input.type),
      },
      true,
    );
  },
  list_vpcs(input, context) {
    return listDigitalOceanCollection(input, context, "/vpcs", "vpcs", "vpcs");
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, digitalOceanActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestDigitalOceanJson({
      apiKey: input.apiKey,
      path: "/account",
      fetcher,
      signal,
      phase: "validate",
    });
    const account = requireWrappedObject(payload, "account");
    const email = requiredString(account.email, "email", providerResponseError);
    const uuid = requiredString(account.uuid, "uuid", providerResponseError);
    const name = optionalString(account.name);
    const team = optionalRecord(account.team);
    const teamName = optionalString(team?.name);

    return {
      profile: {
        accountId: email,
        displayName: teamName ?? name ?? email,
      },
      grantedScopes: [],
      metadata: jsonObject({
        validationEndpoint: "/account",
        account_uuid: uuid,
        email,
        name,
        team_uuid: optionalString(team?.uuid),
        team_name: teamName,
        status: optionalString(account.status),
      }),
    };
  },
};

async function getAccount(context: DigitalOceanContext): Promise<unknown> {
  const payload = await requestDigitalOceanJson({
    apiKey: context.apiKey,
    path: "/account",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return { account: requireWrappedObject(payload, "account") };
}

async function listDroplets(input: Record<string, unknown>, context: DigitalOceanContext): Promise<unknown> {
  const payload = await requestDigitalOceanJson({
    apiKey: context.apiKey,
    path: "/droplets",
    query: jsonObject({
      page: readOptionalPositiveInteger(input.page, "page"),
      per_page: readOptionalPerPage(input.perPage),
      tag_name: optionalString(input.tagName),
      name: optionalString(input.name),
      type: optionalString(input.type),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return normalizeCollection(payload, "droplets", "droplets");
}

async function getDroplet(input: Record<string, unknown>, context: DigitalOceanContext): Promise<unknown> {
  const dropletId = positiveInteger(input.dropletId, "dropletId", providerInputError);
  const payload = await requestDigitalOceanJson({
    apiKey: context.apiKey,
    path: `/droplets/${dropletId}`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return { droplet: requireWrappedObject(payload, "droplet") };
}

async function manageDropletLifecycle(input: Record<string, unknown>, context: DigitalOceanContext): Promise<unknown> {
  const dropletId = positiveInteger(input.dropletId, "dropletId", providerInputError);
  const type = requiredString(input.type, "type", providerInputError);
  const payload = await requestDigitalOceanJson({
    apiKey: context.apiKey,
    path: `/droplets/${dropletId}/actions`,
    method: "POST",
    body: { type },
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return { action: requireWrappedObject(payload, "action") };
}

async function listDigitalOceanCollection(
  input: Record<string, unknown>,
  context: DigitalOceanContext,
  path: string,
  upstreamKey: string,
  outputKey: string,
  extraQuery: Record<string, unknown> = {},
  notFoundAsInvalidInput = false,
): Promise<unknown> {
  const payload = await requestDigitalOceanJson({
    apiKey: context.apiKey,
    path,
    query: jsonObject({
      page: readOptionalPositiveInteger(input.page, "page"),
      per_page: readOptionalPerPage(input.perPage),
      ...extraQuery,
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput,
  });
  return normalizeCollection(payload, upstreamKey, outputKey);
}

function normalizeCollection(payload: unknown, upstreamKey: string, outputKey: string): Record<string, unknown> {
  const record = requiredRecord(payload, "DigitalOcean response", providerResponseError);
  const items = requireResponseArray(record[upstreamKey], upstreamKey);
  return jsonObject({
    [outputKey]: items,
    links: optionalRecord(record.links),
    meta: optionalRecord(record.meta),
  });
}

async function requestDigitalOceanJson(input: {
  apiKey: string;
  path: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: "validate" | "execute";
  query?: Record<string, unknown>;
  method?: string;
  body?: Record<string, unknown>;
  notFoundAsInvalidInput?: boolean;
}): Promise<unknown> {
  const response = await digitalOceanFetch(input);
  if (!response.ok) {
    throw await toDigitalOceanError(response, input.phase, input.notFoundAsInvalidInput);
  }
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new ProviderRequestError(502, "DigitalOcean returned invalid JSON");
  }
}

async function digitalOceanFetch(input: {
  apiKey: string;
  path: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  query?: Record<string, unknown>;
  method?: string;
  body?: Record<string, unknown>;
}): Promise<Response> {
  const url = new URL(`${digitalOceanApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  const timeout = createProviderTimeout(input.signal);
  try {
    const headers = jsonObject({
      accept: "application/json",
      "content-type": input.body === undefined ? undefined : "application/json",
      authorization: `Bearer ${input.apiKey}`,
      "user-agent": providerUserAgent,
    }) as Record<string, string>;
    return await input.fetcher(url, {
      method: input.method ?? (input.body === undefined ? "GET" : "POST"),
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(compactJson(input.body)),
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(502, "DigitalOcean request timed out");
    }
    throw new ProviderRequestError(502, error instanceof Error ? error.message : "DigitalOcean request failed");
  } finally {
    timeout.cleanup();
  }
}

async function toDigitalOceanError(
  response: Response,
  phase: "validate" | "execute",
  notFoundAsInvalidInput = false,
): Promise<ProviderRequestError> {
  const message = await readDigitalOceanErrorMessage(response);
  if (response.status === 401) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message);
  }
  if (response.status === 404 && notFoundAsInvalidInput) {
    return new ProviderRequestError(404, message);
  }
  if (response.status === 400 || response.status === 422) {
    return new ProviderRequestError(response.status, message);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  return new ProviderRequestError(response.status || 500, message);
}

async function readDigitalOceanErrorMessage(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  if (text) {
    try {
      const payload = JSON.parse(text) as Record<string, unknown>;
      return optionalString(payload.message) ?? text;
    } catch {
      return text;
    }
  }
  return `DigitalOcean request failed with status ${response.status}`;
}

function readOptionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
  if (value == null) {
    return undefined;
  }
  return positiveInteger(value, fieldName, providerInputError);
}

function readOptionalPerPage(value: unknown): number | undefined {
  const parsed = optionalIntegerLike(value, "perPage", providerInputError);
  if (parsed === undefined) {
    return undefined;
  }
  if (parsed < 1 || parsed > 200) {
    throw new ProviderRequestError(400, "perPage must be between 1 and 200");
  }
  return parsed;
}

function requireWrappedObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = requiredRecord(value, fieldName, providerResponseError);
  return requiredRecord(record[fieldName], fieldName, providerResponseError);
}

function requireResponseArray(value: unknown, fieldName: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `DigitalOcean response missing ${fieldName}`);
  }
  return value.map((item) => requiredRecord(item, fieldName, providerResponseError));
}
