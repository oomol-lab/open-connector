import type { CredentialValidationResult, TransitFileStore } from "../../core/types.ts";
import type { ProviderActionHandlerSubset, ProviderFetch } from "../provider-runtime.ts";

import {
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalObjectArray,
  optionalRecord,
  optionalString,
  optionalStringArray,
  recordOrEmpty,
  requiredBoolean,
  stringArray,
} from "../../core/cast.ts";
import { assertPublicHttpUrl, isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import {
  createProviderTimeout,
  isAbortSignalError,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
  readProviderJsonBody,
  readTransitFileInput,
  requiredInputString,
} from "../provider-runtime.ts";

const homeBoxCredentialHelpUrl = "https://homebox.software/en/api/";
export const homeBoxApiPrefix = "api/v1";

export interface HomeBoxActionContext {
  apiKey: string;
  baseUrl: string;
  transitFiles?: TransitFileStore;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export type HomeBoxActionHandler = (input: Record<string, unknown>, context: HomeBoxActionContext) => Promise<unknown>;

type HomeBoxQueryValue = string | number | boolean | readonly string[] | undefined;

interface HomeBoxRequestOptions {
  context: HomeBoxActionContext;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, HomeBoxQueryValue>;
  body?: Record<string, unknown> | FormData;
}

export function resolveHomeBoxBaseUrl(input: {
  values?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}): string {
  const value = optionalString(input.metadata?.baseUrl) ?? optionalString(input.values?.baseUrl);
  return normalizeHomeBoxBaseUrl(value);
}

function normalizeHomeBoxBaseUrl(
  value: unknown,
  allowPrivateNetwork: boolean = isPrivateNetworkAccessAllowed(),
): string {
  const raw = optionalString(value)?.trim();
  if (!raw) {
    throw new ProviderRequestError(400, "baseUrl is required");
  }

  const url = assertPublicHttpUrl(raw, {
    fieldName: "baseUrl",
    createError: (message) => new ProviderRequestError(400, message),
    allowPrivateNetwork,
  });
  if (url.username || url.password || url.search || url.hash) {
    throw new ProviderRequestError(400, "baseUrl must be a clean instance root URL");
  }

  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  // Users often paste the API root; strip a trailing /api so it is not double-prefixed.
  url.pathname = url.pathname.replace(/\/+(api\/v1|api)$/i, "") || "/";
  return url.pathname === "/" ? url.origin : `${url.origin}${url.pathname}`;
}

function buildHomeBoxUrl(
  context: HomeBoxActionContext,
  path: string,
  query?: Record<string, HomeBoxQueryValue>,
): string {
  const base = `${context.baseUrl.replace(/\/+$/, "")}/${homeBoxApiPrefix}/`;
  const url = new URL(`./${path.replace(/^\/+/, "")}`, base);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, String(item));
      }
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function performHomeBoxRequest(options: HomeBoxRequestOptions, signal: AbortSignal): Promise<Response> {
  const { context } = options;
  const url = buildHomeBoxUrl(context, options.path, options.query);
  const headers = new Headers({ accept: "application/json", "user-agent": providerUserAgent });
  headers.set("authorization", `Bearer ${context.apiKey}`);

  let body: BodyInit | undefined;
  if (options.body instanceof FormData) {
    body = options.body;
  } else if (options.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(options.body);
  }

  return context.fetcher(url, {
    method: options.method,
    headers,
    body,
    signal,
  });
}

function mapHomeBoxHttpError(status: number, payload: unknown): ProviderRequestError {
  let message: string | undefined;
  if (typeof payload === "string") {
    message = payload;
  } else {
    const error = optionalRecord(payload);
    message = optionalString(error?.error) ?? optionalString(error?.message);
  }
  return new ProviderRequestError(status, message ?? `HomeBox request failed with HTTP ${status}`, payload);
}

async function requestHomeBoxJson(options: HomeBoxRequestOptions): Promise<unknown> {
  // The timeout must cover the body read too: a response can hand back headers
  // and then stall mid-body, and without a live signal that hang is unbounded.
  const timeout = createProviderTimeout(options.context.signal);
  try {
    const response = await performHomeBoxRequest(options, timeout.signal);
    const payload = await readProviderJsonBody(response, {
      emptyBody: null,
      invalidJsonMessage: "HomeBox returned an invalid JSON response",
    });
    if (response.ok) {
      return payload;
    }
    throw mapHomeBoxHttpError(response.status, payload);
  } catch (error) {
    if (timeout.didTimeout() || isAbortSignalError(timeout.signal, error)) {
      throw new ProviderRequestError(504, "HomeBox request timed out");
    }
    throw error;
  } finally {
    timeout.cleanup();
  }
}

function readPagination(payload: Record<string, unknown>): Record<string, unknown> {
  const page = optionalInteger(payload.page) ?? 1;
  return {
    items: optionalObjectArray(payload.items, "HomeBox entities response") ?? [],
    // The instance echoes -1 when no page was requested; normalize to 1.
    page: page > 0 ? page : 1,
    pageSize: optionalInteger(payload.pageSize) ?? 0,
    total: optionalInteger(payload.total) ?? 0,
  };
}

export const homeBoxActionHandlers: ProviderActionHandlerSubset<"homebox", HomeBoxActionHandler> = {
  async get_status(_input, context) {
    const payload = recordOrEmpty(await requestHomeBoxJson({ context, method: "GET", path: "status" }));
    return { summary: payload };
  },

  async list_entities(input, context) {
    const payload = recordOrEmpty(
      await requestHomeBoxJson({
        context,
        method: "GET",
        path: "entities",
        query: {
          q: optionalString(input.q),
          page: optionalInteger(input.page),
          pageSize: optionalInteger(input.pageSize),
          tags: optionalStringArray(input.tagIds),
          parentIds: optionalStringArray(input.parentIds),
        },
      }),
    );
    return readPagination(payload);
  },

  async get_entity(input, context) {
    const id = requiredInputString(input.entityId, "entityId");
    const payload = recordOrEmpty(
      await requestHomeBoxJson({ context, method: "GET", path: `entities/${encodeURIComponent(id)}` }),
    );
    return { entity: payload };
  },

  async create_entity(input, context) {
    const name = requiredInputString(input.name, "name");
    const body: Record<string, unknown> = { name };
    const entityTypeId = optionalString(input.entityTypeId);
    if (entityTypeId) body.entityTypeId = entityTypeId;
    const parentId = optionalString(input.parentId);
    if (parentId) body.parentId = parentId;
    const description = optionalString(input.description);
    if (description !== undefined) body.description = description;
    const quantity = optionalInteger(input.quantity);
    if (quantity !== undefined) body.quantity = quantity;
    const tagIds = optionalStringArray(input.tagIds);
    if (tagIds !== undefined) body.tagIds = tagIds;
    const payload = recordOrEmpty(await requestHomeBoxJson({ context, method: "POST", path: "entities", body }));
    return { entity: payload };
  },

  async update_entity(input, context) {
    const id = requiredInputString(input.entityId, "entityId");
    // EntityPatch covers only quantity, parentId, tagIds, and entityTypeId.
    // When the caller limits itself to those fields, PATCH is safer than the
    // get-merge-PUT below because it never reads a stale snapshot.
    const patchableFields = ["quantity", "parentId", "tagIds", "entityTypeId"];
    const requestedFields = Object.keys(input).filter((key) => key !== "entityId");
    if (requestedFields.length > 0 && requestedFields.every((key) => patchableFields.includes(key))) {
      const body: Record<string, unknown> = {};
      const quantity = optionalInteger(input.quantity);
      if (quantity !== undefined) body.quantity = quantity;
      const parentId = optionalString(input.parentId);
      if (parentId !== undefined) body.parentId = parentId;
      const tagIds = optionalStringArray(input.tagIds);
      if (tagIds !== undefined) body.tagIds = tagIds;
      const entityTypeId = optionalString(input.entityTypeId);
      if (entityTypeId) body.entityTypeId = entityTypeId;
      const payload = recordOrEmpty(
        await requestHomeBoxJson({ context, method: "PATCH", path: `entities/${encodeURIComponent(id)}`, body }),
      );
      return { entity: payload };
    }
    // EntityUpdate is a full replacement, so merge the requested changes on top
    // of the current entity instead of wiping untouched fields (serial number,
    // warranty, custom fields, ...).
    const current = recordOrEmpty(
      await requestHomeBoxJson({ context, method: "GET", path: `entities/${encodeURIComponent(id)}` }),
    );
    const entityType = optionalRecord(current.entityType) ?? {};
    const tags = optionalObjectArray(current.tags, "HomeBox entity tags response") ?? [];
    const parent = optionalRecord(current.parent) ?? {};

    const body: Record<string, unknown> = {
      name: optionalString(input.name) ?? optionalString(current.name) ?? "",
      // EntityUpdate always sets assetId; omitting it resets the entity's asset
      // id to zero, so echo the current one back.
      assetId: optionalString(current.assetId) ?? "",
      description:
        input.description === null
          ? ""
          : (optionalString(input.description) ?? optionalString(current.description) ?? ""),
      quantity: optionalInteger(input.quantity) ?? optionalInteger(current.quantity) ?? 0,
      insured:
        input.insured === undefined
          ? (optionalBoolean(current.insured) ?? false)
          : requiredBoolean(input.insured, "insured", providerInputError),
      archived:
        input.archived === undefined
          ? (optionalBoolean(current.archived) ?? false)
          : requiredBoolean(input.archived, "archived", providerInputError),
      tagIds:
        optionalStringArray(input.tagIds) ??
        tags.map((tag) => optionalString(tag.id)).filter((tagId): tagId is string => tagId !== undefined),
      serialNumber: optionalString(input.serialNumber) ?? optionalString(current.serialNumber) ?? "",
      modelNumber: optionalString(input.modelNumber) ?? optionalString(current.modelNumber) ?? "",
      manufacturer: optionalString(input.manufacturer) ?? optionalString(current.manufacturer) ?? "",
      lifetimeWarranty:
        input.lifetimeWarranty === undefined
          ? (optionalBoolean(current.lifetimeWarranty) ?? false)
          : requiredBoolean(input.lifetimeWarranty, "lifetimeWarranty", providerInputError),
      warrantyExpires: optionalString(input.warrantyExpires) ?? optionalString(current.warrantyExpires) ?? "",
      warrantyDetails: optionalString(input.warrantyDetails) ?? optionalString(current.warrantyDetails) ?? "",
      purchaseDate: optionalString(input.purchaseDate) ?? optionalString(current.purchaseDate) ?? "",
      purchaseFrom: optionalString(input.purchaseFrom) ?? optionalString(current.purchaseFrom) ?? "",
      purchasePrice: optionalNumber(input.purchasePrice) ?? optionalNumber(current.purchasePrice) ?? 0,
      soldDate: optionalString(input.soldDate) ?? optionalString(current.soldDate) ?? "",
      soldTo: optionalString(input.soldTo) ?? optionalString(current.soldTo) ?? "",
      soldPrice: optionalNumber(input.soldPrice) ?? optionalNumber(current.soldPrice) ?? 0,
      soldNotes: optionalString(input.soldNotes) ?? optionalString(current.soldNotes) ?? "",
      notes: optionalString(input.notes) ?? optionalString(current.notes) ?? "",
      syncChildEntityLocations:
        input.syncChildEntityLocations === undefined
          ? (optionalBoolean(current.syncChildEntityLocations) ?? false)
          : requiredBoolean(input.syncChildEntityLocations, "syncChildEntityLocations", providerInputError),
      fields:
        input.fields === undefined
          ? optionalObjectArray(current.fields, "HomeBox custom fields response")
          : optionalObjectArray(input.fields, "HomeBox custom fields input"),
    };
    // Empty UUID strings would fail decoding, so only send ids we have.
    const entityTypeId = optionalString(input.entityTypeId) ?? optionalString(entityType.id);
    if (entityTypeId) {
      body.entityTypeId = entityTypeId;
    }
    const parentId =
      input.parentId === null ? undefined : (optionalString(input.parentId) ?? optionalString(parent.id));
    if (parentId) {
      body.parentId = parentId;
    }
    const payload = recordOrEmpty(
      await requestHomeBoxJson({ context, method: "PUT", path: `entities/${encodeURIComponent(id)}`, body }),
    );
    return { entity: payload };
  },

  async delete_entity(input, context) {
    const id = requiredInputString(input.entityId, "entityId");
    await requestHomeBoxJson({ context, method: "DELETE", path: `entities/${encodeURIComponent(id)}` });
    return { deleted: true };
  },

  async list_entity_types(_input, context) {
    const payload = await requestHomeBoxJson({ context, method: "GET", path: "entity-types" });
    return { entityTypes: optionalObjectArray(payload, "HomeBox entity types response") };
  },

  async create_entity_type(input, context) {
    const name = requiredInputString(input.name, "name");
    const body: Record<string, unknown> = { name };
    const description = optionalString(input.description);
    if (description !== undefined) body.description = description;
    const icon = optionalString(input.icon);
    if (icon !== undefined) body.icon = icon;
    const isLocation = optionalBoolean(input.isLocation);
    if (isLocation !== undefined) body.isLocation = isLocation;
    const payload = recordOrEmpty(await requestHomeBoxJson({ context, method: "POST", path: "entity-types", body }));
    return { entityType: payload };
  },

  async delete_entity_type(input, context) {
    const id = requiredInputString(input.entityTypeId, "entityTypeId");
    await requestHomeBoxJson({ context, method: "DELETE", path: `entity-types/${encodeURIComponent(id)}` });
    return { deleted: true };
  },

  async list_tags(_input, context) {
    const payload = await requestHomeBoxJson({ context, method: "GET", path: "tags" });
    return { tags: optionalObjectArray(payload, "HomeBox tags response") };
  },

  async create_tag(input, context) {
    const name = requiredInputString(input.name, "name");
    const body: Record<string, unknown> = { name };
    const description = optionalString(input.description);
    if (description !== undefined) body.description = description;
    const color = optionalString(input.color);
    if (color !== undefined) body.color = color;
    const icon = optionalString(input.icon);
    if (icon !== undefined) body.icon = icon;
    const parentId = optionalString(input.parentId);
    if (parentId) body.parentId = parentId;
    const payload = recordOrEmpty(await requestHomeBoxJson({ context, method: "POST", path: "tags", body }));
    return { tag: payload };
  },

  async delete_tag(input, context) {
    const id = requiredInputString(input.tagId, "tagId");
    await requestHomeBoxJson({ context, method: "DELETE", path: `tags/${encodeURIComponent(id)}` });
    return { deleted: true };
  },

  async get_group_statistics(_input, context) {
    const payload = recordOrEmpty(await requestHomeBoxJson({ context, method: "GET", path: "groups/statistics" }));
    return { statistics: payload };
  },

  async add_entity_attachment(input, context) {
    const id = requiredInputString(input.entityId, "entityId");
    const file = await readTransitFileInput(input.file, context);
    const form = new FormData();
    form.append("file", new File([file.file], file.name, { type: file.mimeType ?? "application/octet-stream" }));
    form.append("name", optionalString(input.name) ?? file.name);
    const type = optionalString(input.type);
    if (type !== undefined) {
      form.append("type", type);
    }
    const primary = optionalBoolean(input.primary);
    if (primary !== undefined) {
      form.append("primary", String(primary));
    }
    const payload = recordOrEmpty(
      await requestHomeBoxJson({
        context,
        method: "POST",
        path: `entities/${encodeURIComponent(id)}/attachments`,
        body: form,
      }),
    );
    return { entity: payload };
  },

  async get_maintenance_log(input, context) {
    const id = requiredInputString(input.entityId, "entityId");
    const payload = await requestHomeBoxJson({
      context,
      method: "GET",
      path: `entities/${encodeURIComponent(id)}/maintenance`,
      query: { status: optionalString(input.status) },
    });
    return { entries: optionalObjectArray(payload, "HomeBox maintenance log response") };
  },

  async add_maintenance_entry(input, context) {
    const id = requiredInputString(input.entityId, "entityId");
    const name = requiredInputString(input.name, "name");
    const completedDate = optionalString(input.completedDate);
    const scheduledDate = optionalString(input.scheduledDate);
    const body: Record<string, unknown> = { name };
    if (completedDate !== undefined) body.completedDate = completedDate;
    if (scheduledDate !== undefined) body.scheduledDate = scheduledDate;
    const description = optionalString(input.description);
    if (description !== undefined) body.description = description;
    const cost = optionalString(input.cost);
    if (cost !== undefined) body.cost = cost;
    const payload = recordOrEmpty(
      await requestHomeBoxJson({
        context,
        method: "POST",
        path: `entities/${encodeURIComponent(id)}/maintenance`,
        body,
      }),
    );
    return { entry: payload };
  },

  async list_custom_field_names(_input, context) {
    const payload = await requestHomeBoxJson({ context, method: "GET", path: "entities/fields" });
    return { names: stringArray(payload, "HomeBox custom field names response") };
  },

  async list_custom_field_values(input, context) {
    const field = requiredInputString(input.field, "field");
    const payload = await requestHomeBoxJson({
      context,
      method: "GET",
      path: "entities/fields/values",
      query: { field },
    });
    return { values: stringArray(payload, "HomeBox custom field values response") };
  },
};

/**
 * The validator fetcher must already be re-guarded with the same
 * private-network opt-in as the provider executors.
 */
export async function validateHomeBoxCredential(
  input: { apiKey: string; values: Record<string, string> },
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiKey = requiredInputString(input.apiKey, "apiKey");
  const baseUrl = normalizeHomeBoxBaseUrl(input.values.baseUrl);

  // The cheapest authenticated call that proves the key works and reveals the
  // acting account, so the connection profile names the group it writes to.
  const payload = recordOrEmpty(
    await requestHomeBoxJson({
      context: { apiKey, baseUrl, fetcher, signal },
      method: "GET",
      path: "users/self",
    }),
  );
  const displayName = optionalString(payload.name) ?? "HomeBox";

  return {
    profile: {
      accountId: `homebox:${baseUrl}`,
      displayName: `HomeBox (${displayName})`,
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: {
      baseUrl,
      credentialHelpUrl: homeBoxCredentialHelpUrl,
    },
  };
}
