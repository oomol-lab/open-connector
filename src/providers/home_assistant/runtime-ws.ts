import type { GuardedWebSocketFailure, WebSocketLike } from "../../core/guarded-websocket.ts";
import type { ProviderActionHandlerSubset } from "../provider-runtime.ts";
import type { HomeAssistantRegistryName } from "./actions.ts";
import type { HomeAssistantActionContext, HomeAssistantActionHandler } from "./runtime.ts";

import { compactObject, objectArray, optionalRecord, optionalString } from "../../core/cast.ts";
import { openGuardedWebSocket } from "../../core/guarded-websocket.ts";
import { isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import { homeAssistantRegistryNames } from "./actions.ts";
import { readInputString } from "./runtime.ts";

/**
 * Deadline covering the whole session: handshake, authentication, and every
 * command in the batch. Matches the REST action timeout.
 */
const homeAssistantWebSocketTimeoutMs = 30_000;

const registryCommandTypes: Record<HomeAssistantRegistryName, string> = {
  entities: "config/entity_registry/list",
  devices: "config/device_registry/list",
  areas: "config/area_registry/list",
  floors: "config/floor_registry/list",
  labels: "config/label_registry/list",
};

/** One Home Assistant WebSocket command, without the connection-assigned `id`. */
interface HomeAssistantCommand {
  type: string;
  [key: string]: unknown;
}

export const homeAssistantWebSocketActionHandlers: ProviderActionHandlerSubset<
  "home_assistant",
  HomeAssistantActionHandler
> = {
  async get_registries(input, context) {
    const requested = readRegistryNames(input.include);
    const results = await runHomeAssistantCommands(
      context,
      requested.map((name) => ({ type: registryCommandTypes[name] })),
    );

    // Registries the caller did not ask for stay null so an omitted registry is
    // distinguishable from one the instance genuinely has no entries for.
    const output: Record<HomeAssistantRegistryName, unknown> = {
      entities: null,
      devices: null,
      areas: null,
      floors: null,
      labels: null,
    };
    requested.forEach((name, index) => {
      output[name] = results[index] ?? [];
    });
    return output;
  },
  async search_related(input, context) {
    const [related] = await runHomeAssistantCommands(context, [
      {
        type: "search/related",
        item_type: readInputString(input.itemType, "itemType"),
        item_id: readInputString(input.itemId, "itemId"),
      },
    ]);
    return { related: optionalRecord(related) ?? {} };
  },
  async list_device_automations(input, context) {
    const deviceId = readInputString(input.deviceId, "deviceId");
    const [triggers, conditions, actions] = await runHomeAssistantCommands(context, [
      { type: "device_automation/trigger/list", device_id: deviceId },
      { type: "device_automation/condition/list", device_id: deviceId },
      { type: "device_automation/action/list", device_id: deviceId },
    ]);
    return { triggers: triggers ?? [], conditions: conditions ?? [], actions: actions ?? [] };
  },
  async execute_script(input, context) {
    const [payload] = await runHomeAssistantCommands(context, [
      {
        type: "execute_script",
        sequence: objectArray(input.sequence, "sequence", (message) => new ProviderRequestError(400, message)),
        ...compactObject({ variables: optionalRecord(input.variables) }),
      },
    ]);
    const record = optionalRecord(payload) ?? {};
    return {
      context: optionalRecord(record.context) ?? null,
      response: optionalRecord(record.response) ?? null,
    };
  },
  async validate_config(input, context) {
    const triggers = readOptionalConfigList(input.triggers, "triggers");
    const conditions = readOptionalConfigList(input.conditions, "conditions");
    const actions = readOptionalConfigList(input.actions, "actions");
    if (!triggers && !conditions && !actions) {
      throw new ProviderRequestError(400, "At least one of triggers, conditions, or actions is required");
    }

    const [payload] = await runHomeAssistantCommands(context, [
      { type: "validate_config", ...compactObject({ triggers, conditions, actions }) },
    ]);
    return { validation: optionalRecord(payload) ?? {} };
  },
};

/**
 * Open one authenticated Home Assistant WebSocket session, run every command in
 * the batch concurrently over it, and return their results in input order.
 *
 * Commands share a connection because the handshake costs two round trips
 * before any command can be sent; batching keeps a multi-registry action at one
 * handshake instead of one per registry.
 */
async function runHomeAssistantCommands(
  context: HomeAssistantActionContext,
  commands: HomeAssistantCommand[],
): Promise<unknown[]> {
  // One deadline for the whole session. The handshake may use all of it, and the
  // command phase then gets whatever is left, so a slow instance cannot spend the
  // budget twice.
  const deadline = Date.now() + homeAssistantWebSocketTimeoutMs;
  const socket = await openGuardedWebSocket(buildWebSocketUrl(context.baseUrl), {
    allowPrivateNetwork: isPrivateNetworkAccessAllowed,
    createError: (message) => new ProviderRequestError(400, message),
    createFailure: createConnectionError,
    connectTimeoutMs: homeAssistantWebSocketTimeoutMs,
    signal: context.signal,
    fieldName: "Home Assistant base URL",
  });

  const inbox = createMessageInbox(socket);
  const timer = globalThis.setTimeout(
    () => {
      inbox.fail(new ProviderRequestError(504, "Home Assistant WebSocket request timed out"));
    },
    Math.max(0, deadline - Date.now()),
  );
  const onAbort = (): void => {
    inbox.fail(new ProviderRequestError(504, "Home Assistant WebSocket request was aborted"));
  };
  context.signal?.addEventListener("abort", onAbort, { once: true });
  // The signal can fire between the socket opening and this listener attaching;
  // recheck so that abort is not missed until the deadline, matching what
  // openGuardedWebSocket does after attaching its own handshake listeners.
  if (context.signal?.aborted) {
    onAbort();
  }

  try {
    await authenticate(socket, inbox, context.apiKey);
    return await sendCommands(socket, inbox, commands);
  } finally {
    globalThis.clearTimeout(timer);
    context.signal?.removeEventListener("abort", onAbort);
    closeQuietly(socket);
  }
}

/** Messages arrive unsolicited, so buffer them and hand them out in arrival order. */
interface MessageInbox {
  next(): Promise<Record<string, unknown>>;
  fail(error: Error): void;
}

/** A caller parked in {@link MessageInbox.next} until a message or failure arrives. */
interface PendingReader {
  resolve: (message: Record<string, unknown>) => void;
  reject: (error: Error) => void;
}

function createMessageInbox(socket: WebSocketLike): MessageInbox {
  const buffered: Array<Record<string, unknown>> = [];
  const waiting: PendingReader[] = [];
  let failure: Error | undefined;

  function fail(error: Error): void {
    if (failure) {
      return;
    }
    failure = error;
    while (waiting.length > 0) {
      waiting.shift()?.reject(error);
    }
  }

  function push(message: Record<string, unknown>): void {
    const waiter = waiting.shift();
    if (waiter) {
      waiter.resolve(message);
      return;
    }
    buffered.push(message);
  }

  socket.addEventListener("message", (event) => {
    const message = parseMessage(event.data);
    if (!message) {
      fail(new ProviderRequestError(502, "Home Assistant sent an unreadable WebSocket message"));
      return;
    }
    push(message);
  });
  socket.addEventListener("error", () => {
    fail(new ProviderRequestError(502, "Home Assistant WebSocket connection failed"));
  });
  socket.addEventListener("close", () => {
    fail(new ProviderRequestError(502, "Home Assistant closed the WebSocket connection"));
  });

  return {
    next(): Promise<Record<string, unknown>> {
      const buffer = buffered.shift();
      if (buffer) {
        return Promise.resolve(buffer);
      }
      if (failure) {
        return Promise.reject(failure);
      }
      return new Promise((resolve, reject) => {
        waiting.push({ resolve, reject });
      });
    },
    fail,
  };
}

/**
 * Home Assistant authenticates in-band: the server opens with `auth_required`
 * and the token travels as a message rather than a header, which is what lets
 * the same code path work on runtimes whose WebSocket constructor cannot set
 * request headers.
 */
async function authenticate(socket: WebSocketLike, inbox: MessageInbox, apiKey: string): Promise<void> {
  const greeting = await inbox.next();
  if (greeting.type === "auth_ok") {
    return;
  }
  if (greeting.type !== "auth_required") {
    throw new ProviderRequestError(502, "Home Assistant sent an unexpected WebSocket handshake message");
  }

  socket.send(JSON.stringify({ type: "auth", access_token: apiKey }));
  const result = await inbox.next();
  if (result.type === "auth_ok") {
    return;
  }
  if (result.type === "auth_invalid") {
    throw new ProviderRequestError(401, optionalString(result.message) ?? "Home Assistant rejected the access token");
  }
  throw new ProviderRequestError(502, "Home Assistant sent an unexpected WebSocket authentication response");
}

async function sendCommands(
  socket: WebSocketLike,
  inbox: MessageInbox,
  commands: HomeAssistantCommand[],
): Promise<unknown[]> {
  const results: unknown[] = new Array<unknown>(commands.length);
  // Home Assistant requires ids that are positive and increasing per connection.
  const pending = new Map<number, number>();
  commands.forEach((command, index) => {
    const id = index + 1;
    pending.set(id, index);
    socket.send(JSON.stringify({ ...command, id }));
  });

  while (pending.size > 0) {
    const message = await inbox.next();
    if (message.type !== "result") {
      continue;
    }
    const id = typeof message.id === "number" ? message.id : undefined;
    const index = id === undefined ? undefined : pending.get(id);
    if (id === undefined || index === undefined) {
      continue;
    }
    pending.delete(id);
    if (message.success !== true) {
      throw createCommandError(message.error, commands[index].type);
    }
    results[index] = message.result;
  }

  return results;
}

function buildWebSocketUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/api/websocket`;
  return url.toString();
}

function parseMessage(data: unknown): Record<string, unknown> | undefined {
  const text = typeof data === "string" ? data : decodeBinaryMessage(data);
  if (text === undefined) {
    return undefined;
  }
  try {
    return optionalRecord(JSON.parse(text));
  } catch {
    return undefined;
  }
}

function decodeBinaryMessage(data: unknown): string | undefined {
  if (data instanceof Uint8Array) {
    return new TextDecoder().decode(data);
  }
  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(new Uint8Array(data));
  }
  return undefined;
}

function createConnectionError(kind: GuardedWebSocketFailure, message: string): ProviderRequestError {
  if (kind === "unsupported") {
    return new ProviderRequestError(501, "Home Assistant WebSocket actions require a runtime with a WebSocket client");
  }
  if (kind === "timeout") {
    return new ProviderRequestError(504, "Home Assistant WebSocket connection timed out");
  }
  return new ProviderRequestError(502, message);
}

/**
 * Map a Home Assistant command error onto the runtime status codes callers
 * already see from the REST actions.
 */
function createCommandError(error: unknown, commandType: string): ProviderRequestError {
  const record = optionalRecord(error);
  const code = optionalString(record?.code);
  const message = optionalString(record?.message) ?? `Home Assistant rejected the ${commandType} command`;
  if (code === "unauthorized") {
    return new ProviderRequestError(403, message);
  }
  if (code === "not_found" || code === "unknown_command") {
    return new ProviderRequestError(404, message);
  }
  if (code === "invalid_format" || code === "id_reuse") {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(502, message);
}

function readRegistryNames(value: unknown): HomeAssistantRegistryName[] {
  if (value === undefined || value === null) {
    return homeAssistantRegistryNames;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, "include must be an array of registry names");
  }
  if (value.length === 0) {
    return homeAssistantRegistryNames;
  }

  const selected: HomeAssistantRegistryName[] = [];
  for (const entry of value) {
    const name = homeAssistantRegistryNames.find((candidate) => candidate === entry);
    if (!name) {
      throw new ProviderRequestError(400, `include must only contain ${homeAssistantRegistryNames.join(", ")}`);
    }
    if (!selected.includes(name)) {
      selected.push(name);
    }
  }
  return selected;
}

function readOptionalConfigList(value: unknown, fieldName: string): Array<Record<string, unknown>> | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return objectArray(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function closeQuietly(socket: WebSocketLike): void {
  try {
    socket.close();
  } catch {
    // The socket may already be closed; the action result is unaffected.
  }
}
