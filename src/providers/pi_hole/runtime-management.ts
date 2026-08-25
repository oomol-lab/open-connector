import type { ProviderActionHandlerSubset } from "../provider-runtime.ts";
import type { PiHoleActionContext, PiHoleActionHandler, PiHoleRequestOptions } from "./runtime.ts";

import {
  optionalBoolean,
  optionalIntegerLike,
  optionalObjectArray,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import { requestPiHoleJson } from "./runtime.ts";

function piHoleInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function readRequiredString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, piHoleInputError);
}

function readRecordPayload(payload: unknown): Record<string, unknown> {
  return optionalRecord(payload) ?? {};
}

function readStringArrayPayload(value: unknown, fieldName: string): unknown {
  if (typeof value === "string" || Array.isArray(value)) {
    return value;
  }
  throw new ProviderRequestError(400, `${fieldName} must be a string or an array of strings`);
}

function readGroupsPayload(input: Record<string, unknown>): number[] | undefined {
  const groups = Array.isArray(input.groups) ? input.groups : undefined;
  if (groups === undefined) {
    return undefined;
  }
  // Coerce numeric strings so an ID like "1" never silently becomes the
  // default group 0; anything else is a clear input error.
  return groups.map((value) => {
    const parsed = optionalIntegerLike(value, "groups", piHoleInputError);
    if (parsed === undefined) {
      throw piHoleInputError("groups must be an array of group IDs");
    }
    return parsed;
  });
}

/**
 * Normalize the `{ processed: { success, errors } }` response returned by the
 * write endpoints of the list management API.
 */
function readProcessedPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const processed = optionalRecord(payload.processed);
  if (!processed) {
    return { processed: null };
  }
  return {
    processed: {
      success: optionalObjectArray(processed.success, "Pi-hole processed success response").map((entry) =>
        optionalString(entry.item),
      ),
      errors: optionalObjectArray(processed.errors, "Pi-hole processed errors response").map((entry) => ({
        item: optionalString(entry.item),
        error: optionalString(entry.error),
      })),
    },
  };
}

async function deleteListedItem(options: Omit<PiHoleRequestOptions, "method">): Promise<{ deleted: boolean }> {
  await requestPiHoleJson({ ...options, method: "DELETE" });
  return { deleted: true };
}

/**
 * The FTL write endpoints replace the whole record: any field omitted from a
 * PUT payload is reset to its server default (comment cleared, enabled forced
 * to true). Read-modify-write keeps the action contract safe: unspecified
 * fields are carried over from the current record instead of being wiped.
 */
async function readResourceItems(
  context: PiHoleActionContext,
  path: string,
  key: string,
): Promise<Array<Record<string, unknown>>> {
  const payload = readRecordPayload(await requestPiHoleJson({ context, method: "GET", path }));
  return optionalObjectArray(payload[key], `Pi-hole ${key} response`);
}

function requireExistingItem(
  items: Array<Record<string, unknown>>,
  match: (entry: Record<string, unknown>) => boolean,
  description: string,
): Record<string, unknown> {
  const current = items.find(match);
  if (!current) {
    throw new ProviderRequestError(404, `Pi-hole item not found: ${description}`);
  }
  return current;
}

function normalizeListType(value: string): string {
  return value.toLowerCase();
}

function readBatchStringItems(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an array of item identifiers`);
  }
  return value.map((entry) => {
    if (typeof entry !== "string" || entry.trim() === "") {
      throw new ProviderRequestError(400, `${fieldName} items must be non-empty strings`);
    }
    return entry;
  });
}

function readBatchEntries(
  value: unknown,
  fieldName: string,
  readEntry: (entry: Record<string, unknown>) => { item: string; [key: string]: unknown },
): Array<{ item: string; [key: string]: unknown }> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an array of objects`);
  }
  return value.map((entry) => {
    const record = optionalRecord(entry);
    if (!record) {
      throw new ProviderRequestError(400, `${fieldName} entries must be objects`);
    }
    return readEntry(record);
  });
}

/**
 * The batch-delete endpoints report 404 when none of the requested items
 * matched. Report that case as a non-deleting outcome instead of an error.
 */
async function batchDeletePiHoleItems(
  context: PiHoleActionContext,
  path: string,
  body: unknown[],
): Promise<{ deleted: boolean }> {
  try {
    await requestPiHoleJson({ context, method: "POST", path, body });
    return { deleted: true };
  } catch (error) {
    if (error instanceof ProviderRequestError && error.status === 404) {
      return { deleted: false };
    }
    throw error;
  }
}

function effectiveOptionalString(provided: unknown, current: unknown): string | null | undefined {
  if (provided !== undefined) {
    return optionalString(provided) ?? null;
  }
  return optionalString(current) ?? null;
}

function effectiveOptionalBoolean(provided: unknown, current: unknown): boolean | undefined {
  if (provided !== undefined) {
    return optionalBoolean(provided);
  }
  return optionalBoolean(current) ?? true;
}

export const piHoleManagementActionHandlers: ProviderActionHandlerSubset<"pi_hole", PiHoleActionHandler> = {
  async list_groups(_input, context) {
    const payload = readRecordPayload(await requestPiHoleJson({ context, method: "GET", path: "groups" }));
    return { groups: optionalObjectArray(payload.groups, "Pi-hole groups response") };
  },
  async create_group(input, context) {
    const payload = readRecordPayload(
      await requestPiHoleJson({
        context,
        method: "POST",
        path: "groups",
        body: {
          name: readStringArrayPayload(input.name, "name"),
          ...(input.comment !== undefined ? { comment: optionalString(input.comment) ?? null } : {}),
          ...(input.enabled !== undefined ? { enabled: optionalBoolean(input.enabled) } : {}),
        },
      }),
    );
    return readProcessedPayload(payload);
  },
  async update_group(input, context) {
    const name = readRequiredString(input.name, "name");
    const items = await readResourceItems(context, "groups", "groups");
    const current = requireExistingItem(items, (entry) => optionalString(entry.name) === name, `group ${name}`);
    const payload = readRecordPayload(
      await requestPiHoleJson({
        context,
        method: "PUT",
        path: `groups/${encodeURIComponent(name)}`,
        body: {
          name:
            input.newName !== undefined
              ? readRequiredString(input.newName, "newName")
              : (optionalString(current.name) ?? name),
          comment: effectiveOptionalString(input.comment, current.comment),
          enabled: effectiveOptionalBoolean(input.enabled, current.enabled),
        },
      }),
    );
    return readProcessedPayload(payload);
  },
  async delete_group(input, context) {
    const name = readRequiredString(input.name, "name");
    return deleteListedItem({ context, path: `groups/${encodeURIComponent(name)}` });
  },

  async list_lists(input, context) {
    const type = optionalString(input.type);
    const payload = readRecordPayload(
      await requestPiHoleJson({
        context,
        method: "GET",
        path: "lists",
        query: type === undefined ? undefined : { type: normalizeListType(type) },
      }),
    );
    return { lists: optionalObjectArray(payload.lists, "Pi-hole lists response") };
  },
  async add_list(input, context) {
    const type = normalizeListType(readRequiredString(input.type, "type"));
    const payload = readRecordPayload(
      await requestPiHoleJson({
        context,
        method: "POST",
        path: "lists",
        query: { type },
        body: {
          address: readStringArrayPayload(input.address, "address"),
          ...(input.comment !== undefined ? { comment: optionalString(input.comment) ?? null } : {}),
          ...(input.groups !== undefined ? { groups: readGroupsPayload(input) } : {}),
          ...(input.enabled !== undefined ? { enabled: optionalBoolean(input.enabled) } : {}),
        },
      }),
    );
    return readProcessedPayload(payload);
  },
  async update_list(input, context) {
    const type = normalizeListType(readRequiredString(input.type, "type"));
    const address = readRequiredString(input.address, "address");
    const items = await readResourceItems(context, "lists", "lists");
    const current = requireExistingItem(
      items,
      (entry) => optionalString(entry.address) === address && optionalString(entry.type) === type,
      `list ${address}`,
    );
    const payload = readRecordPayload(
      await requestPiHoleJson({
        context,
        method: "PUT",
        path: `lists/${encodeURIComponent(address)}`,
        query: { type },
        body: {
          comment: effectiveOptionalString(input.comment, current.comment),
          ...(input.groups !== undefined ? { groups: readGroupsPayload(input) } : { groups: current.groups }),
          enabled: effectiveOptionalBoolean(input.enabled, current.enabled),
        },
      }),
    );
    return readProcessedPayload(payload);
  },
  async delete_list(input, context) {
    const type = normalizeListType(readRequiredString(input.type, "type"));
    const address = readRequiredString(input.address, "address");
    return deleteListedItem({ context, path: `lists/${encodeURIComponent(address)}`, query: { type } });
  },

  async list_domains(input, context) {
    const type = optionalString(input.type);
    const kind = optionalString(input.kind);
    const normalizedType = type !== undefined ? normalizeListType(type) : undefined;
    const normalizedKind = kind !== undefined ? normalizeListType(kind) : undefined;
    const path =
      normalizedType !== undefined && normalizedKind !== undefined
        ? `domains/${normalizedType}/${normalizedKind}`
        : normalizedType !== undefined
          ? `domains/${normalizedType}`
          : "domains";
    const payload = readRecordPayload(await requestPiHoleJson({ context, method: "GET", path }));
    return { domains: optionalObjectArray(payload.domains, "Pi-hole domains response") };
  },
  async add_domain(input, context) {
    const type = normalizeListType(readRequiredString(input.type, "type"));
    const kind = normalizeListType(readRequiredString(input.kind, "kind"));
    const payload = readRecordPayload(
      await requestPiHoleJson({
        context,
        method: "POST",
        path: `domains/${type}/${kind}`,
        body: {
          domain: readStringArrayPayload(input.domain, "domain"),
          ...(input.comment !== undefined ? { comment: optionalString(input.comment) ?? null } : {}),
          ...(input.groups !== undefined ? { groups: readGroupsPayload(input) } : {}),
          ...(input.enabled !== undefined ? { enabled: optionalBoolean(input.enabled) } : {}),
        },
      }),
    );
    return readProcessedPayload(payload);
  },
  async update_domain(input, context) {
    const type = normalizeListType(readRequiredString(input.type, "type"));
    const kind = normalizeListType(readRequiredString(input.kind, "kind"));
    const domain = readRequiredString(input.domain, "domain");
    const items = await readResourceItems(context, `domains/${type}/${kind}`, "domains");
    const current = requireExistingItem(
      items,
      (entry) => (optionalString(entry.domain) ?? "").toLowerCase() === domain.toLowerCase(),
      `domain ${domain}`,
    );
    const payload = readRecordPayload(
      await requestPiHoleJson({
        context,
        method: "PUT",
        path: `domains/${type}/${kind}/${encodeURIComponent(domain)}`,
        body: {
          comment: effectiveOptionalString(input.comment, current.comment),
          ...(input.groups !== undefined ? { groups: readGroupsPayload(input) } : { groups: current.groups }),
          enabled: effectiveOptionalBoolean(input.enabled, current.enabled),
        },
      }),
    );
    return readProcessedPayload(payload);
  },
  async delete_domain(input, context) {
    const type = normalizeListType(readRequiredString(input.type, "type"));
    const kind = normalizeListType(readRequiredString(input.kind, "kind"));
    const domain = readRequiredString(input.domain, "domain");
    return deleteListedItem({ context, path: `domains/${type}/${kind}/${encodeURIComponent(domain)}` });
  },

  async list_clients(_input, context) {
    const payload = readRecordPayload(await requestPiHoleJson({ context, method: "GET", path: "clients" }));
    return { clients: optionalObjectArray(payload.clients, "Pi-hole clients response") };
  },
  async create_client(input, context) {
    const payload = readRecordPayload(
      await requestPiHoleJson({
        context,
        method: "POST",
        path: "clients",
        body: {
          client: readStringArrayPayload(input.client, "client"),
          ...(input.comment !== undefined ? { comment: optionalString(input.comment) ?? null } : {}),
          ...(input.groups !== undefined ? { groups: readGroupsPayload(input) } : {}),
        },
      }),
    );
    return readProcessedPayload(payload);
  },
  async update_client(input, context) {
    const client = readRequiredString(input.client, "client");
    const items = await readResourceItems(context, "clients", "clients");
    const current = requireExistingItem(
      items,
      (entry) => {
        const identifier = optionalString(entry.client);
        return identifier === client || optionalString(entry.name) === client;
      },
      `client ${client}`,
    );
    // The write endpoint matches against the canonical stored identifier, so
    // when the caller used a hostname alias the PUT must target the stored
    // identifier, not the alias.
    const targetIdentifier = optionalString(current.client) ?? client;
    const payload = readRecordPayload(
      await requestPiHoleJson({
        context,
        method: "PUT",
        path: `clients/${encodeURIComponent(targetIdentifier)}`,
        body: {
          comment: effectiveOptionalString(input.comment, current.comment),
          ...(input.groups !== undefined ? { groups: readGroupsPayload(input) } : { groups: current.groups }),
        },
      }),
    );
    return readProcessedPayload(payload);
  },
  async delete_client(input, context) {
    const client = readRequiredString(input.client, "client");
    return deleteListedItem({ context, path: `clients/${encodeURIComponent(client)}` });
  },
  async batch_delete_groups(input, context) {
    const items = readBatchStringItems(input.items, "items");
    return batchDeletePiHoleItems(
      context,
      "groups:batchDelete",
      items.map((item) => ({ item })),
    );
  },
  async batch_delete_lists(input, context) {
    return batchDeletePiHoleItems(
      context,
      "lists:batchDelete",
      readBatchEntries(input.items, "items", (entry) => {
        const address = requiredString(entry.address, "address", piHoleInputError);
        const type = normalizeListType(requiredString(entry.type, "type", piHoleInputError));
        if (type !== "allow" && type !== "block") {
          throw new ProviderRequestError(400, "type must be either allow or block");
        }
        return { item: address, type };
      }),
    );
  },
  async batch_delete_domains(input, context) {
    return batchDeletePiHoleItems(
      context,
      "domains:batchDelete",
      readBatchEntries(input.items, "items", (entry) => {
        const domain = requiredString(entry.domain, "domain", piHoleInputError);
        const type = normalizeListType(requiredString(entry.type, "type", piHoleInputError));
        if (type !== "allow" && type !== "deny") {
          throw new ProviderRequestError(400, "type must be either allow or deny");
        }
        const kind = normalizeListType(requiredString(entry.kind, "kind", piHoleInputError));
        if (kind !== "exact" && kind !== "regex") {
          throw new ProviderRequestError(400, "kind must be either exact or regex");
        }
        return { item: domain, type, kind };
      }),
    );
  },
  async batch_delete_clients(input, context) {
    const items = readBatchStringItems(input.items, "items");
    return batchDeletePiHoleItems(
      context,
      "clients:batchDelete",
      items.map((item) => ({ item })),
    );
  },

  async get_dhcp_leases(_input, context) {
    const payload = readRecordPayload(await requestPiHoleJson({ context, method: "GET", path: "dhcp/leases" }));
    return { leases: optionalObjectArray(payload.leases, "Pi-hole DHCP leases response") };
  },
  async get_network_devices(_input, context) {
    const payload = readRecordPayload(await requestPiHoleJson({ context, method: "GET", path: "network/devices" }));
    return { devices: optionalObjectArray(payload.devices, "Pi-hole network devices response") };
  },
};
