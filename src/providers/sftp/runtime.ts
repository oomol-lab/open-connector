import type { GuardedFetchDnsLookup } from "../../core/guarded-fetch.ts";
import type { CredentialValidationResult, TransitFileWriter } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-executors.ts";
import type { ProviderTransitFile } from "../provider-files.ts";
import type { Socket, TcpNetConnectOpts } from "node:net";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

import { createHash } from "node:crypto";
import { connect as connectSocket } from "node:net";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import SftpClient from "ssh2-sftp-client";
import { optionalInteger, optionalString, requiredRawString } from "../../core/cast.ts";
import { resolveGuardedEgressTarget } from "../../core/guarded-fetch.ts";
import { createPinnedLookup } from "../../core/guarded-socket.ts";
import { isPrivateNetworkAccessAllowed, storeResponseInTransit } from "../../core/request.ts";
import { readTransitFileInput } from "../provider-files.ts";
import {
  createProviderTimeout,
  providerInputError,
  ProviderRequestError,
  requiredInputString,
} from "../provider-runtime.ts";

const defaultSftpPort = 22;
const handshakeTimeoutMs = 20_000;
const fileTransferTimeoutMs = 300_000;
const closeGraceMs = 2_000;
const defaultMaxEntries = 1_000;
const fingerprintPrefix = "SHA256:";
// SFTP status codes (draft-ietf-secsh-filexfer); servers before protocol v6
// report an exclusive-create conflict as the generic FAILURE.
const sftpStatusFailure = 4;
const sftpStatusFileAlreadyExists = 11;

interface SftpCredential {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
  /** SHA256 host key fingerprint the user pinned, without the `SHA256:` prefix. */
  hostKeyFingerprint?: string;
}

/** Test seams for the raw TCP egress; production uses `node:dns` and `node:net`. */
export interface SftpDependencies {
  lookup?: GuardedFetchDnsLookup;
  connectSocket?: (options: TcpNetConnectOpts) => Socket;
}

export interface SftpActionContext {
  credential: SftpCredential;
  /** Host key fingerprint every execution must see, without the `SHA256:` prefix. */
  expectedHostKey: string;
  transitFiles?: TransitFileWriter;
  signal?: AbortSignal;
  dependencies: SftpDependencies;
}

type SftpActionHandler = (input: Record<string, unknown>, context: SftpActionContext) => Promise<unknown>;

type SftpPhase = "validate" | "execute";

interface SftpSessionRequest {
  credential: SftpCredential;
  /** Fingerprint to enforce; `undefined` accepts and records the presented key (validation only). */
  expectedHostKey: string | undefined;
  phase: SftpPhase;
  signal?: AbortSignal;
  timeoutMs?: number;
  dependencies: SftpDependencies;
}

interface SftpSession {
  /** Fingerprint of the host key the server presented, without the `SHA256:` prefix. */
  hostKeyFingerprint: string;
}

interface SshConnectionState {
  firstError?: Error & { level?: string; code?: unknown };
  presentedHostKey?: string;
  hostKeyRejected: boolean;
  connected: boolean;
}

/**
 * Build the execution context from stored credential values and the host key
 * fingerprint recorded when the connection was validated.
 */
export function createSftpContext(
  values: Record<string, string>,
  metadata: Record<string, unknown>,
  transitFiles: TransitFileWriter | undefined,
  signal: AbortSignal | undefined,
  dependencies: SftpDependencies = {},
): SftpActionContext {
  const credential = parseSftpCredential(values);
  const expectedHostKey = credential.hostKeyFingerprint ?? optionalString(metadata.hostKeyFingerprint);
  if (!expectedHostKey) {
    throw new ProviderRequestError(401, "Reconnect the SFTP connection so the server host key can be recorded.");
  }
  return { credential, expectedHostKey, transitFiles, signal, dependencies };
}

/**
 * Prove the credential can open an SFTP session and record the host key the
 * server presented, so later executions refuse a different key.
 */
export async function validateSftpCredential(
  values: Record<string, string>,
  signal: AbortSignal | undefined,
  dependencies: SftpDependencies = {},
): Promise<CredentialValidationResult> {
  const credential = parseSftpCredential(values);
  return withSftpSession(
    {
      credential,
      expectedHostKey: credential.hostKeyFingerprint,
      phase: "validate",
      signal,
      dependencies,
    },
    async (client, session) => {
      await client.cwd();
      const account = `${credential.username}@${credential.host}${credential.port === defaultSftpPort ? "" : `:${credential.port}`}`;
      return {
        profile: { accountId: account, displayName: account },
        metadata: { hostKeyFingerprint: session.hostKeyFingerprint },
      };
    },
  );
}

export const sftpActionHandlers: ProviderActionHandlers<"sftp", SftpActionHandler> = {
  async list_directory(input, context) {
    const path = readRemotePath(input.path, "path");
    const maxEntries = optionalInteger(input.maxEntries) ?? defaultMaxEntries;
    return withActionSession(context, async (client) => {
      const listing = (await client.list(path))
        .filter((entry) => entry.name !== "." && entry.name !== "..")
        .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
      return {
        path,
        entries: listing.slice(0, maxEntries).map((entry) => ({
          name: entry.name,
          path: joinRemotePath(path, entry.name),
          type: listingEntryType(entry.type),
          sizeBytes: entry.size,
          modifiedAt: epochMillisToIso(entry.modifyTime),
          permissions: listingPermissions(entry.rights),
        })),
        truncated: listing.length > maxEntries,
      };
    });
  },

  async stat(input, context) {
    const path = readRemotePath(input.path, "path");
    return withActionSession(context, async (client) => {
      const stats = await client.stat(path);
      return {
        path,
        type: stats.isDirectory ? "directory" : stats.isFile ? "file" : stats.isSymbolicLink ? "symlink" : "other",
        sizeBytes: stats.size,
        modifiedAt: epochMillisToIso(stats.modifyTime),
        accessedAt: epochMillisToIso(stats.accessTime),
        mode: (stats.mode & 0o7777).toString(8).padStart(4, "0"),
        uid: stats.uid,
        gid: stats.gid,
      };
    });
  },

  async download_file(input, context) {
    const path = readRemotePath(input.path, "path");
    const mimeType = optionalString(input.mimeType) ?? "application/octet-stream";
    const transitFiles = context.transitFiles;
    if (!transitFiles) {
      throw providerInputError("SFTP downloads require local transit file storage.");
    }
    return withActionSession(
      context,
      async (client, _session, signal) => {
        const stats = await client.stat(path);
        if (!stats.isFile) {
          throw providerInputError(`${path} is not a regular file.`);
        }
        if (stats.size > transitFiles.maxBytes) {
          throw new ProviderRequestError(413, `${path} exceeds ${transitFiles.maxBytes} bytes.`);
        }
        const body = Readable.toWeb(client.createReadStream(path)) as ReadableStream<Uint8Array>;
        const stored = await storeResponseInTransit(new Response(body), transitFiles, {
          name: remoteBaseName(path),
          mimeType,
          fieldName: path,
          createError: (message) => new ProviderRequestError(413, message),
          signal,
        });
        const file: ProviderTransitFile = {
          fileId: stored.fileId,
          downloadUrl: stored.downloadUrl,
          sizeBytes: stored.sizeBytes,
          name: stored.name,
          mimeType: stored.mimeType,
        };
        return { path, file };
      },
      fileTransferTimeoutMs,
    );
  },

  async upload_file(input, context) {
    const path = readRemotePath(input.path, "path");
    const overwrite = input.overwrite === true;
    const source = await readTransitFileInput(input.file, context);
    return withActionSession(
      context,
      async (client) => {
        const existing = await client.exists(path);
        if (existing === "d") {
          throw providerInputError(`${path} is a directory; include the file name in path.`);
        }
        if (existing && !overwrite) {
          throw providerInputError(`${path} already exists; set overwrite to true to replace it.`);
        }
        const body = Readable.fromWeb(source.file.stream() as NodeReadableStream<Uint8Array>);
        try {
          // The existence check above only produces a clear message; the exclusive
          // open is what keeps a concurrent writer's file from being truncated.
          await pipeline(body, client.createWriteStream(path, { flags: overwrite ? "w" : "wx" }));
        } catch (error) {
          const code = (error as { code?: unknown } | null)?.code;
          if (!overwrite && (code === sftpStatusFailure || code === sftpStatusFileAlreadyExists)) {
            throw providerInputError(`${path} could not be created exclusively; it may already exist.`);
          }
          throw error;
        }
        return { path, sizeBytes: source.sizeBytes, overwritten: existing !== false };
      },
      fileTransferTimeoutMs,
    );
  },

  async delete_file(input, context) {
    const path = readRemotePath(input.path, "path");
    return withActionSession(context, async (client) => {
      const existing = await client.exists(path);
      if (existing === false) {
        throw remoteNotFound(path);
      }
      if (existing === "d") {
        throw providerInputError(`${path} is a directory; use remove_directory instead.`);
      }
      await client.delete(path);
      return { path, deleted: true };
    });
  },

  async create_directory(input, context) {
    const path = readRemotePath(input.path, "path");
    const recursive = input.recursive === true;
    return withActionSession(context, async (client) => {
      const existing = await client.exists(path);
      if (existing && existing !== "d") {
        throw providerInputError(`${path} already exists and is not a directory.`);
      }
      if (existing === "d") {
        if (!recursive) {
          throw providerInputError(`${path} already exists.`);
        }
        return { path, created: false };
      }
      await client.mkdir(path, recursive);
      return { path, created: true };
    });
  },

  async rename(input, context) {
    const fromPath = readRemotePath(input.fromPath, "fromPath");
    const toPath = readRemotePath(input.toPath, "toPath");
    return withActionSession(context, async (client) => {
      await client.rename(fromPath, toPath);
      return { fromPath, toPath };
    });
  },

  async remove_directory(input, context) {
    const path = readRemotePath(input.path, "path");
    const recursive = input.recursive === true;
    return withActionSession(context, async (client) => {
      const existing = await client.exists(path);
      if (existing === false) {
        throw remoteNotFound(path);
      }
      if (existing !== "d") {
        throw providerInputError(`${path} is not a directory; use delete_file instead.`);
      }
      await client.rmdir(path, recursive);
      return { path, removed: true };
    });
  },
};

function withActionSession<T>(
  context: SftpActionContext,
  operation: (client: SftpClient, session: SftpSession, signal: AbortSignal) => Promise<T>,
  timeoutMs?: number,
): Promise<T> {
  return withSftpSession(
    {
      credential: context.credential,
      expectedHostKey: context.expectedHostKey,
      phase: "execute",
      signal: context.signal,
      timeoutMs,
      dependencies: context.dependencies,
    },
    operation,
  );
}

/**
 * Open one guarded SSH connection, run `operation` over its SFTP channel and
 * always close the connection.
 *
 * The host passes the shared SSRF egress policy first, and the socket is
 * pinned to the screened addresses so a DNS answer cannot change between the
 * check and the connection. Aborting or timing out destroys the socket, which
 * rejects whatever SFTP request is pending.
 */
async function withSftpSession<T>(
  request: SftpSessionRequest,
  operation: (client: SftpClient, session: SftpSession, signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const { credential, dependencies } = request;
  const timeout = createProviderTimeout(request.signal, request.timeoutMs);
  const state: SshConnectionState = { hostKeyRejected: false, connected: false };
  let socket: Socket | undefined;
  const destroySocket = (): void => {
    socket?.destroy();
  };
  timeout.signal.addEventListener("abort", destroySocket, { once: true });
  // The library logs unhandled connection events to the console by default.
  const client = new SftpClient("oomol-connect", { error() {}, end() {}, close() {} });
  client.on("error", (error: SshConnectionState["firstError"]) => {
    state.firstError ??= error;
  });

  try {
    timeout.signal.throwIfAborted();
    const target = await untilAborted(
      resolveGuardedEgressTarget(`https://${credential.host}`, {
        fieldName: "SFTP host",
        createError: providerInputError,
        createResolutionError: (message) => new ProviderRequestError(502, message),
        allowPrivateNetwork: isPrivateNetworkAccessAllowed(),
        lookup: dependencies.lookup,
      }),
      timeout.signal,
    );
    if (target.addresses.length === 0) {
      throw new ProviderRequestError(502, "SFTP host could not be resolved for validation.");
    }
    timeout.signal.throwIfAborted();
    socket = (dependencies.connectSocket ?? connectSocket)({
      host: target.url.hostname,
      port: credential.port,
      lookup: createPinnedLookup(target.addresses),
      autoSelectFamily: true,
    });
    await client.connect({
      sock: socket,
      username: credential.username,
      password: credential.password,
      privateKey: credential.privateKey,
      passphrase: credential.passphrase,
      readyTimeout: handshakeTimeoutMs,
      hostVerifier: (key: Buffer): boolean => {
        const presented = hostKeyFingerprint(key);
        state.presentedHostKey = presented;
        if (request.expectedHostKey !== undefined && presented !== request.expectedHostKey) {
          state.hostKeyRejected = true;
          return false;
        }
        return true;
      },
    });
    state.connected = true;
    return await operation(client, { hostKeyFingerprint: state.presentedHostKey! }, timeout.signal);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.signal.aborted) {
      throw new ProviderRequestError(504, "SFTP request timed out");
    }
    throw mapSftpError(error, state, request);
  } finally {
    timeout.signal.removeEventListener("abort", destroySocket);
    timeout.cleanup();
    if (state.connected) {
      await closeGracefully(client);
    }
    destroySocket();
  }
}

/**
 * Settle as soon as `signal` aborts. A `node:dns` lookup cannot be cancelled,
 * so a stalled resolver would otherwise hold the request past its timeout.
 */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const onAbort = (): void => reject(signal.reason);
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

async function closeGracefully(client: SftpClient): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    client.end().catch(() => undefined),
    new Promise((resolve) => {
      timer = setTimeout(resolve, closeGraceMs);
    }),
  ]);
  clearTimeout(timer);
}

function mapSftpError(error: unknown, state: SshConnectionState, request: SftpSessionRequest): ProviderRequestError {
  const credentialStatus = request.phase === "validate" ? 400 : 401;
  const message = error instanceof Error ? error.message : String(error);
  if (state.hostKeyRejected) {
    return new ProviderRequestError(
      credentialStatus,
      `SFTP server host key ${fingerprintPrefix}${state.presentedHostKey} does not match the pinned ${fingerprintPrefix}${request.expectedHostKey}. Verify the server and reconnect if its key legitimately changed.`,
    );
  }
  const level = state.firstError?.level;
  if (level === "client-authentication") {
    return new ProviderRequestError(
      credentialStatus,
      `SFTP authentication failed for ${request.credential.username}; check the password or private key.`,
    );
  }
  if (/privateKey|private key|passphrase/i.test(message) && !state.connected) {
    return new ProviderRequestError(
      request.phase === "validate" ? 400 : 401,
      `SFTP private key is unusable: ${message}`,
    );
  }
  if (level === "client-timeout") {
    return new ProviderRequestError(504, "SFTP handshake timed out");
  }
  if (!state.connected) {
    return new ProviderRequestError(502, `SFTP connection failed: ${state.firstError?.message ?? message}`);
  }
  const code = (error as { code?: unknown } | null)?.code;
  // The client library prefixes each layer's method name, e.g. "mkdir: _doMkdir: Access denied".
  const detail = message.replace(/^(?:_?[A-Za-z]+: )+/, "");
  if (code === 2 || code === "ENOENT") {
    return new ProviderRequestError(404, `Remote path not found: ${detail}`);
  }
  if (code === 3 || code === "EACCES") {
    // A path-level refusal, not a broken credential: keep it out of authorization_failed.
    return providerInputError(`Permission denied by the SFTP server: ${detail}`);
  }
  if (typeof code === "number" || code === "ERR_BAD_PATH" || code === "ENOTDIR") {
    return providerInputError(`SFTP server refused the request: ${detail}`);
  }
  return new ProviderRequestError(502, `SFTP request failed: ${detail}`);
}

function parseSftpCredential(values: Record<string, string>): SftpCredential {
  const host = optionalString(values.host);
  if (!host || !/^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(host)) {
    throw providerInputError("host must be a hostname or IPv4 address, without a scheme, port or path.");
  }
  const username = requiredInputString(values.username, "username");
  const password = optionalString(values.password);
  const privateKey = optionalString(values.privateKey);
  if (!password && !privateKey) {
    throw providerInputError("Provide a password, a private key, or both.");
  }
  return {
    host,
    port: parsePort(values.port),
    username,
    password,
    privateKey,
    passphrase: optionalString(values.passphrase),
    hostKeyFingerprint: parseFingerprint(values.hostKeyFingerprint),
  };
}

function parsePort(value: string | undefined): number {
  const text = optionalString(value);
  if (text === undefined) {
    return defaultSftpPort;
  }
  const port = /^\d{1,5}$/.test(text) ? Number(text) : Number.NaN;
  if (!(port >= 1 && port <= 65_535)) {
    throw providerInputError("port must be an integer between 1 and 65535.");
  }
  return port;
}

function parseFingerprint(value: string | undefined): string | undefined {
  const text = optionalString(value);
  if (text === undefined) {
    return undefined;
  }
  const digest = text
    .replace(/^SHA256:/i, "")
    .trim()
    .replace(/=+$/, "");
  if (!/^[A-Za-z0-9+/]{43}$/.test(digest)) {
    throw providerInputError(
      "hostKeyFingerprint must be a SHA256 fingerprint such as SHA256:nThbg6kXUpJWGl7E1IGOCspRomTxdCARLviKw6E5SY8.",
    );
  }
  return digest;
}

/** OpenSSH-style fingerprint: unpadded base64 SHA-256 of the host key blob. */
function hostKeyFingerprint(key: Buffer): string {
  return createHash("sha256").update(key).digest("base64").replace(/=+$/, "");
}

/** Keep the path byte for byte: surrounding spaces are legal in remote file names. */
function readRemotePath(value: unknown, fieldName: string): string {
  const path = requiredRawString(value, fieldName, providerInputError);
  if (path.length === 0) {
    throw providerInputError(`${fieldName} must not be empty.`);
  }
  if (path.includes("\0")) {
    throw providerInputError(`${fieldName} must not contain NUL characters.`);
  }
  return path;
}

function remoteNotFound(path: string): ProviderRequestError {
  return new ProviderRequestError(404, `Remote path not found: ${path}`);
}

function joinRemotePath(directory: string, name: string): string {
  return directory.endsWith("/") ? `${directory}${name}` : `${directory}/${name}`;
}

function remoteBaseName(path: string): string {
  return path.replace(/\/+$/, "").split("/").pop() || "download";
}

function listingEntryType(type: string): "file" | "directory" | "symlink" | "other" {
  switch (type) {
    case "-":
      return "file";
    case "d":
      return "directory";
    case "l":
      return "symlink";
    default:
      return "other";
  }
}

/** Rebuild the rwxr-xr-x string from the per-class rights the listing parsed out of the long name. */
function listingPermissions(rights: SftpClient.FileInfo["rights"]): string {
  return [rights.user, rights.group, rights.other]
    .map(
      (bits) => `${bits.includes("r") ? "r" : "-"}${bits.includes("w") ? "w" : "-"}${/[xsStT]/.exec(bits)?.[0] ?? "-"}`,
    )
    .join("");
}

function epochMillisToIso(value: number | undefined): string | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? new Date(value).toISOString() : null;
}
