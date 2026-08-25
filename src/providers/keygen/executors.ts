import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const keygenApiBaseUrl = "https://api.keygen.sh/v1/accounts";
const keygenValidationPath = "/me";

type KeygenRequestPhase = "validate" | "execute";
type KeygenResourceKey =
  | "products"
  | "entitlements"
  | "groups"
  | "policies"
  | "users"
  | "licenses"
  | "machines"
  | "components"
  | "processes";
type KeygenActionHandler = (input: Record<string, unknown>, context: KeygenRequestContext) => Promise<unknown>;

interface KeygenRequestContext {
  apiKey: string;
  account: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface KeygenResourceConfig {
  path: KeygenResourceKey;
  type: string;
}

interface KeygenRelationshipUpdateInput {
  method: "POST" | "DELETE";
  parentPath: string;
  relationshipPath: string;
  inputFieldName: string;
  resourceType: string;
}

interface KeygenRelationshipChangeInput {
  parentPath: string;
  relationshipPath: string;
  inputFieldName: string;
  resourceType: string;
}

const keygenResources = {
  products: { path: "products", type: "products" },
  entitlements: { path: "entitlements", type: "entitlements" },
  groups: { path: "groups", type: "groups" },
  policies: { path: "policies", type: "policies" },
  users: { path: "users", type: "users" },
  licenses: { path: "licenses", type: "licenses" },
  machines: { path: "machines", type: "machines" },
  components: { path: "components", type: "components" },
  processes: { path: "processes", type: "processes" },
} satisfies Record<KeygenResourceKey, KeygenResourceConfig>;

export const keygenActionHandlers: ProviderActionHandlers<"keygen", KeygenActionHandler> = {
  whoami(_input, context) {
    return keygenGetJson(["me"], {}, context, "execute");
  },
  list_products(input, context) {
    return listKeygenResources(input, context, keygenResources.products);
  },
  retrieve_product(input, context) {
    return retrieveKeygenResource(input, context, keygenResources.products);
  },
  create_product(input, context) {
    return createKeygenResource(input, context, keygenResources.products);
  },
  update_product(input, context) {
    return updateKeygenResource(input, context, keygenResources.products);
  },
  delete_product(input, context) {
    return deleteKeygenResource(input, context, keygenResources.products);
  },
  list_entitlements(input, context) {
    return listKeygenResources(input, context, keygenResources.entitlements);
  },
  retrieve_entitlement(input, context) {
    return retrieveKeygenResource(input, context, keygenResources.entitlements);
  },
  create_entitlement(input, context) {
    return createKeygenResource(input, context, keygenResources.entitlements);
  },
  update_entitlement(input, context) {
    return updateKeygenResource(input, context, keygenResources.entitlements);
  },
  delete_entitlement(input, context) {
    return deleteKeygenResource(input, context, keygenResources.entitlements);
  },
  list_groups(input, context) {
    return listKeygenResources(input, context, keygenResources.groups);
  },
  retrieve_group(input, context) {
    return retrieveKeygenResource(input, context, keygenResources.groups);
  },
  create_group(input, context) {
    return createKeygenResource(input, context, keygenResources.groups);
  },
  update_group(input, context) {
    return updateKeygenResource(input, context, keygenResources.groups);
  },
  delete_group(input, context) {
    return deleteKeygenResource(input, context, keygenResources.groups);
  },
  list_policies(input, context) {
    return listKeygenResources(input, context, keygenResources.policies);
  },
  retrieve_policy(input, context) {
    return retrieveKeygenResource(input, context, keygenResources.policies);
  },
  create_policy(input, context) {
    return createKeygenResource(input, context, keygenResources.policies);
  },
  update_policy(input, context) {
    return updateKeygenResource(input, context, keygenResources.policies);
  },
  delete_policy(input, context) {
    return deleteKeygenResource(input, context, keygenResources.policies);
  },
  list_policy_entitlements(input, context) {
    return listKeygenRelationship(input, context, "policies", "entitlements");
  },
  attach_policy_entitlements(input, context) {
    return updateKeygenRelationship(input, context, {
      method: "POST",
      parentPath: "policies",
      relationshipPath: "entitlements",
      inputFieldName: "entitlementIds",
      resourceType: "entitlements",
    });
  },
  detach_policy_entitlements(input, context) {
    return updateKeygenRelationship(input, context, {
      method: "DELETE",
      parentPath: "policies",
      relationshipPath: "entitlements",
      inputFieldName: "entitlementIds",
      resourceType: "entitlements",
    });
  },
  list_users(input, context) {
    return listKeygenResources(input, context, keygenResources.users);
  },
  retrieve_user(input, context) {
    return retrieveKeygenResource(input, context, keygenResources.users);
  },
  create_user(input, context) {
    return createKeygenResource(input, context, keygenResources.users);
  },
  update_user(input, context) {
    return updateKeygenResource(input, context, keygenResources.users);
  },
  delete_user(input, context) {
    return deleteKeygenResource(input, context, keygenResources.users);
  },
  ban_user(input, context) {
    return postKeygenAction(input, context, "users", "ban");
  },
  unban_user(input, context) {
    return postKeygenAction(input, context, "users", "unban");
  },
  change_user_group(input, context) {
    return changeKeygenRelationship(input, context, {
      parentPath: "users",
      relationshipPath: "group",
      inputFieldName: "groupId",
      resourceType: "groups",
    });
  },
  list_licenses(input, context) {
    return listKeygenResources(input, context, keygenResources.licenses);
  },
  retrieve_license(input, context) {
    return retrieveKeygenResource(input, context, keygenResources.licenses);
  },
  create_license(input, context) {
    return createKeygenResource(input, context, keygenResources.licenses);
  },
  update_license(input, context) {
    return updateKeygenResource(input, context, keygenResources.licenses);
  },
  delete_license(input, context) {
    return deleteKeygenResource(input, context, keygenResources.licenses);
  },
  suspend_license(input, context) {
    return postKeygenAction(input, context, "licenses", "suspend");
  },
  reinstate_license(input, context) {
    return postKeygenAction(input, context, "licenses", "reinstate");
  },
  renew_license(input, context) {
    return postKeygenAction(input, context, "licenses", "renew");
  },
  revoke_license(input, context) {
    return deleteKeygenAction(input, context, "licenses", "revoke");
  },
  check_in_license(input, context) {
    return postKeygenAction(input, context, "licenses", "check-in");
  },
  increment_license_usage(input, context) {
    return postKeygenAction(input, context, "licenses", "increment-usage", {
      meta: compactObject({
        increment: input.increment,
      }),
    });
  },
  decrement_license_usage(input, context) {
    return postKeygenAction(input, context, "licenses", "decrement-usage", {
      meta: compactObject({
        decrement: input.decrement,
      }),
    });
  },
  reset_license_usage(input, context) {
    return postKeygenAction(input, context, "licenses", "reset-usage");
  },
  validate_license_by_id(input, context) {
    const id = readRequiredString(input.id, "id");
    return keygenPostJson(["licenses", id, "actions", "validate"], buildValidationBody(input), context, { auth: true });
  },
  validate_license_key(input, context) {
    const key = readRequiredString(input.key, "key");
    return keygenPostJson(["licenses", "actions", "validate-key"], buildValidationBody({ ...input, key }), context, {
      auth: false,
    });
  },
  list_license_users(input, context) {
    return listKeygenRelationship(input, context, "licenses", "users");
  },
  attach_license_users(input, context) {
    return updateKeygenRelationship(input, context, {
      method: "POST",
      parentPath: "licenses",
      relationshipPath: "users",
      inputFieldName: "userIds",
      resourceType: "users",
    });
  },
  detach_license_users(input, context) {
    return updateKeygenRelationship(input, context, {
      method: "DELETE",
      parentPath: "licenses",
      relationshipPath: "users",
      inputFieldName: "userIds",
      resourceType: "users",
    });
  },
  list_license_entitlements(input, context) {
    return listKeygenRelationship(input, context, "licenses", "entitlements");
  },
  attach_license_entitlements(input, context) {
    return updateKeygenRelationship(input, context, {
      method: "POST",
      parentPath: "licenses",
      relationshipPath: "entitlements",
      inputFieldName: "entitlementIds",
      resourceType: "entitlements",
    });
  },
  detach_license_entitlements(input, context) {
    return updateKeygenRelationship(input, context, {
      method: "DELETE",
      parentPath: "licenses",
      relationshipPath: "entitlements",
      inputFieldName: "entitlementIds",
      resourceType: "entitlements",
    });
  },
  change_license_policy(input, context) {
    return changeKeygenRelationship(input, context, {
      parentPath: "licenses",
      relationshipPath: "policy",
      inputFieldName: "policyId",
      resourceType: "policies",
    });
  },
  change_license_owner(input, context) {
    return changeKeygenRelationship(input, context, {
      parentPath: "licenses",
      relationshipPath: "owner",
      inputFieldName: "userId",
      resourceType: "users",
    });
  },
  change_license_group(input, context) {
    return changeKeygenRelationship(input, context, {
      parentPath: "licenses",
      relationshipPath: "group",
      inputFieldName: "groupId",
      resourceType: "groups",
    });
  },
  list_machines(input, context) {
    return listKeygenResources(input, context, keygenResources.machines);
  },
  retrieve_machine(input, context) {
    return retrieveKeygenResource(input, context, keygenResources.machines);
  },
  activate_machine(input, context) {
    return createKeygenResource(input, context, keygenResources.machines);
  },
  update_machine(input, context) {
    return updateKeygenResource(input, context, keygenResources.machines);
  },
  deactivate_machine(input, context) {
    return deleteKeygenResource(input, context, keygenResources.machines);
  },
  ping_machine(input, context) {
    return postKeygenAction(input, context, "machines", "ping");
  },
  reset_machine_heartbeat(input, context) {
    return postKeygenAction(input, context, "machines", "reset");
  },
  change_machine_owner(input, context) {
    return changeKeygenRelationship(input, context, {
      parentPath: "machines",
      relationshipPath: "owner",
      inputFieldName: "userId",
      resourceType: "users",
    });
  },
  change_machine_group(input, context) {
    return changeKeygenRelationship(input, context, {
      parentPath: "machines",
      relationshipPath: "group",
      inputFieldName: "groupId",
      resourceType: "groups",
    });
  },
  list_components(input, context) {
    return listKeygenResources(input, context, keygenResources.components);
  },
  retrieve_component(input, context) {
    return retrieveKeygenResource(input, context, keygenResources.components);
  },
  create_component(input, context) {
    return createKeygenResource(input, context, keygenResources.components);
  },
  update_component(input, context) {
    return updateKeygenResource(input, context, keygenResources.components);
  },
  delete_component(input, context) {
    return deleteKeygenResource(input, context, keygenResources.components);
  },
  list_processes(input, context) {
    return listKeygenResources(input, context, keygenResources.processes);
  },
  retrieve_process(input, context) {
    return retrieveKeygenResource(input, context, keygenResources.processes);
  },
  create_process(input, context) {
    return createKeygenResource(input, context, keygenResources.processes);
  },
  update_process(input, context) {
    return updateKeygenResource(input, context, keygenResources.processes);
  },
  delete_process(input, context) {
    return deleteKeygenResource(input, context, keygenResources.processes);
  },
  ping_process(input, context) {
    return postKeygenAction(input, context, "processes", "ping");
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<KeygenRequestContext>({
  service: "keygen",
  handlers: keygenActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<KeygenRequestContext> {
    const credential = await requireApiKeyCredential(context, "keygen");
    return {
      apiKey: credential.apiKey,
      account: requireKeygenAccount(credential.metadata.account ?? credential.values.account),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const account = requireKeygenAccount(input.values.account);
    const payload = await keygenGetJson(
      ["me"],
      {},
      {
        apiKey: input.apiKey,
        account,
        fetcher,
        signal,
      },
      "validate",
    );
    const data = optionalRecord(optionalRecord(payload)?.data);
    const attributes = optionalRecord(data?.attributes);
    const profileId = optionalString(data?.id);
    const profileType = optionalString(data?.type);
    const email = optionalString(attributes?.email);
    const name = optionalString(attributes?.name);

    return {
      profile: {
        accountId: profileId ? `${account}:${profileId}` : account,
        displayName: name ?? email ?? account,
      },
      grantedScopes: [],
      metadata: compactObject({
        account,
        apiBaseUrl: `${keygenApiBaseUrl}/${encodeURIComponent(account)}`,
        validationEndpoint: keygenValidationPath,
        profileId,
        profileType,
        email,
        name,
      }),
    };
  },
};

function listKeygenResources(
  input: Record<string, unknown>,
  context: KeygenRequestContext,
  resource: KeygenResourceConfig,
) {
  return keygenGetJson([resource.path], buildListQuery(input), context, "execute");
}

function retrieveKeygenResource(
  input: Record<string, unknown>,
  context: KeygenRequestContext,
  resource: KeygenResourceConfig,
) {
  return keygenGetJson([resource.path, readRequiredString(input.id, "id")], {}, context, "execute");
}

function createKeygenResource(
  input: Record<string, unknown>,
  context: KeygenRequestContext,
  resource: KeygenResourceConfig,
) {
  return keygenPostJson([resource.path], buildResourceBody(input, resource), context, {
    auth: true,
  });
}

function updateKeygenResource(
  input: Record<string, unknown>,
  context: KeygenRequestContext,
  resource: KeygenResourceConfig,
) {
  const id = readRequiredString(input.id, "id");
  return keygenPatchJson([resource.path, id], buildResourceBody(input, resource, id), context);
}

async function deleteKeygenResource(
  input: Record<string, unknown>,
  context: KeygenRequestContext,
  resource: KeygenResourceConfig,
) {
  const data = await keygenDeleteJson([resource.path, readRequiredString(input.id, "id")], context);
  return compactObject({
    deleted: true,
    data,
  });
}

function postKeygenAction(
  input: Record<string, unknown>,
  context: KeygenRequestContext,
  parentPath: string,
  action: string,
  body?: Record<string, unknown>,
) {
  const normalizedBody = body && Object.keys(body).length > 0 ? body : undefined;
  return keygenPostJson([parentPath, readRequiredString(input.id, "id"), "actions", action], normalizedBody, context, {
    auth: true,
  });
}

async function deleteKeygenAction(
  input: Record<string, unknown>,
  context: KeygenRequestContext,
  parentPath: string,
  action: string,
) {
  const data = await keygenDeleteJson([parentPath, readRequiredString(input.id, "id"), "actions", action], context);
  return compactObject({
    deleted: true,
    data,
  });
}

function listKeygenRelationship(
  input: Record<string, unknown>,
  context: KeygenRequestContext,
  parentPath: string,
  relationshipPath: string,
) {
  return keygenGetJson(
    [parentPath, readRequiredString(input.id, "id"), relationshipPath],
    buildRelationshipListQuery(input),
    context,
    "execute",
  );
}

function updateKeygenRelationship(
  input: Record<string, unknown>,
  context: KeygenRequestContext,
  relationship: KeygenRelationshipUpdateInput,
) {
  return keygenRequestJson(
    relationship.method,
    [relationship.parentPath, readRequiredString(input.id, "id"), relationship.relationshipPath],
    {},
    {
      data: buildResourceLinkageArray(input, relationship.inputFieldName, relationship.resourceType),
    },
    context,
    "execute",
    { auth: true },
  );
}

function changeKeygenRelationship(
  input: Record<string, unknown>,
  context: KeygenRequestContext,
  relationship: KeygenRelationshipChangeInput,
) {
  return keygenPutJson(
    [relationship.parentPath, readRequiredString(input.id, "id"), relationship.relationshipPath],
    {
      data: {
        type: relationship.resourceType,
        id: readRequiredString(input[relationship.inputFieldName], relationship.inputFieldName),
      },
    },
    context,
  );
}

async function keygenGetJson(
  pathParts: string[],
  query: Record<string, unknown>,
  context: KeygenRequestContext,
  phase: KeygenRequestPhase,
) {
  return keygenRequestJson("GET", pathParts, query, undefined, context, phase, { auth: true });
}

async function keygenPostJson(
  pathParts: string[],
  body: Record<string, unknown> | undefined,
  context: KeygenRequestContext,
  options: { auth: boolean },
) {
  return keygenRequestJson("POST", pathParts, {}, body, context, "execute", options);
}

async function keygenPutJson(pathParts: string[], body: Record<string, unknown>, context: KeygenRequestContext) {
  return keygenRequestJson("PUT", pathParts, {}, body, context, "execute", { auth: true });
}

async function keygenPatchJson(pathParts: string[], body: Record<string, unknown>, context: KeygenRequestContext) {
  return keygenRequestJson("PATCH", pathParts, {}, body, context, "execute", { auth: true });
}

async function keygenDeleteJson(pathParts: string[], context: KeygenRequestContext) {
  return keygenRequestJson("DELETE", pathParts, {}, undefined, context, "execute", {
    auth: true,
  });
}

async function keygenRequestJson(
  method: string,
  pathParts: string[],
  query: Record<string, unknown>,
  body: Record<string, unknown> | undefined,
  context: KeygenRequestContext,
  phase: KeygenRequestPhase,
  options: { auth: boolean },
) {
  const url = buildKeygenUrl(context.account, pathParts, query);

  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method,
      headers: keygenHeaders(context.apiKey, {
        auth: options.auth,
        hasBody: body !== undefined,
      }),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: context.signal,
    });
    payload = await readKeygenPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Keygen request failed: ${error.message}` : "Keygen request failed",
    );
  }

  if (!response.ok) {
    throw createKeygenError(response, payload, phase, options.auth);
  }

  return payload;
}

function buildKeygenUrl(account: string, pathParts: string[], query: Record<string, unknown>) {
  const encodedPath = [account, ...pathParts].map((part) => encodeURIComponent(part)).join("/");
  const url = new URL(`${keygenApiBaseUrl}/${encodedPath}`);
  appendListQuery(url.searchParams, query);
  return url;
}

function appendListQuery(searchParams: URLSearchParams, query: Record<string, unknown>) {
  for (const [key, value] of Object.entries(query)) {
    if (value == null) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        appendQueryValue(searchParams, key, item);
      }
      continue;
    }
    appendQueryValue(searchParams, key, value);
  }
}

function appendQueryValue(searchParams: URLSearchParams, key: string, value: unknown) {
  if (value == null) {
    return;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    searchParams.append(key, String(value));
    return;
  }
  searchParams.append(key, JSON.stringify(value));
}

function keygenHeaders(apiKey: string, options: { auth: boolean; hasBody: boolean }) {
  return {
    accept: "application/vnd.api+json",
    "user-agent": providerUserAgent,
    ...(options.hasBody ? { "content-type": "application/vnd.api+json" } : {}),
    ...(options.auth ? { authorization: `Bearer ${apiKey}` } : {}),
  };
}

async function readKeygenPayload(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createKeygenError(response: Response, payload: unknown, phase: KeygenRequestPhase, usedAuth: boolean) {
  const message = extractKeygenErrorMessage(payload) ?? response.statusText ?? "keygen request failed";

  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }

  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message);
  }

  if (phase === "execute" && usedAuth && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(401, message);
  }

  if (phase === "execute" && !usedAuth && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message);
  }

  if ([400, 404, 422].includes(response.status)) {
    return new ProviderRequestError(400, message);
  }

  return new ProviderRequestError(response.status || 500, message);
}

function extractKeygenErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const firstError = Array.isArray(record.errors) ? optionalRecord(record.errors[0]) : undefined;
  return (
    optionalString(firstError?.detail) ??
    optionalString(firstError?.title) ??
    optionalString(firstError?.code) ??
    optionalString(record.detail) ??
    optionalString(record.title) ??
    optionalString(record.error)
  );
}

function buildListQuery(input: Record<string, unknown>) {
  const filter = optionalRecord(input.filter);
  const query: Record<string, unknown> = compactObject({
    "page[number]": input.pageNumber,
    "page[size]": input.pageSize,
    include: input.include,
  });

  for (const [key, value] of Object.entries(filter ?? {})) {
    query[`filter[${key}]`] = value;
  }

  return query;
}

function buildRelationshipListQuery(input: Record<string, unknown>) {
  return compactObject({
    limit: input.limit,
    "page[size]": input.pageSize,
    "page[cursor]": input.pageCursor,
  });
}

function buildResourceBody(input: Record<string, unknown>, resource: KeygenResourceConfig, id?: string) {
  const data = compactObject({
    type: resource.type,
    id,
    attributes: optionalRecord(input.attributes),
    relationships: optionalRecord(input.relationships),
    meta: optionalRecord(input.meta),
  });

  return { data };
}

function buildResourceLinkageArray(input: Record<string, unknown>, fieldName: string, resourceType: string) {
  const ids = input[fieldName];
  if (!Array.isArray(ids)) {
    throw new ProviderRequestError(400, `${fieldName} must be an array`);
  }

  return ids.map((id) => ({
    type: resourceType,
    id: readRequiredString(id, fieldName),
  }));
}

function buildValidationBody(input: Record<string, unknown>) {
  return {
    meta: compactObject({
      key: optionalString(input.key),
      nonce: input.nonce,
      scope: optionalRecord(input.scope),
    }),
  };
}

function requireKeygenAccount(input: unknown) {
  const record = optionalRecord(input);
  const account = optionalString(record?.account)?.trim();
  if (!account) {
    throw new ProviderRequestError(400, "Keygen account ID or slug is required");
  }
  return account;
}

function readRequiredString(value: unknown, fieldName: string) {
  const stringValue = optionalString(value)?.trim();
  if (!stringValue) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return stringValue;
}
