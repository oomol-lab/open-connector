import type { TransitFileStore } from "../../core/types.ts";
import type { AddressInfo, Socket, TcpNetConnectOpts } from "node:net";
import type { Attributes, Connection, SFTPWrapper } from "ssh2";

import { createHash } from "node:crypto";
import { connect } from "node:net";
import { posix } from "node:path";
import ssh2 from "ssh2";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ProviderRequestError } from "../provider-runtime.ts";
import { createSftpContext, sftpActionHandlers, validateSftpCredential } from "./runtime.ts";

const { Server, utils } = ssh2;
const { STATUS_CODE, OPEN_MODE } = utils.sftp;

const homeDirectory = "/home/deploy";
const publicLookup = async () => [{ address: "93.184.216.34", family: 4 as const }];

type MemoryNode = { kind: "dir" } | { kind: "file"; data: Buffer };

const hostKey = utils.generateKeyPairSync("ed25519");
const hostKeyFingerprint = fingerprintOf(hostKey.public);

let server: InstanceType<typeof Server>;
let serverPort = 0;
let files: Map<string, MemoryNode>;
/** Paths STAT and LSTAT report as missing, as if another client created them right after the check. */
let hiddenFromStat: Set<string>;

beforeAll(async () => {
  server = new Server({ hostKeys: [hostKey.private] }, (client) => serveClient(client));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  serverPort = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function resetFiles(): void {
  hiddenFromStat = new Set();
  files = new Map<string, MemoryNode>([
    ["/", { kind: "dir" }],
    ["/home", { kind: "dir" }],
    [homeDirectory, { kind: "dir" }],
    [`${homeDirectory}/reports`, { kind: "dir" }],
    [`${homeDirectory}/reports/q3.csv`, { kind: "file", data: Buffer.from("quarter,total\nq3,42\n") }],
    [`${homeDirectory}/notes.txt`, { kind: "file", data: Buffer.from("hello") }],
  ]);
}

/** Route every guarded connection to the local test server instead of the pinned public address. */
const dependencies = {
  lookup: publicLookup,
  connectSocket: vi.fn((_options: TcpNetConnectOpts): Socket => connect({ host: "127.0.0.1", port: serverPort })),
};

const values = { host: "sftp.example.com", username: "deploy", password: "correct-password" };

async function validatedContext(transitFiles?: TransitFileStore) {
  const validation = await validateSftpCredential(values, undefined, dependencies);
  return createSftpContext(values, validation.metadata ?? {}, transitFiles, undefined, dependencies);
}

describe("sftp credential validation", () => {
  it("records the presented host key and the account identity", async () => {
    resetFiles();
    const result = await validateSftpCredential(values, undefined, dependencies);
    expect(result.metadata).toEqual({ hostKeyFingerprint });
    expect(result.profile).toEqual({ accountId: "deploy@sftp.example.com", displayName: "deploy@sftp.example.com" });
  });

  it("rejects a wrong password as a field error", async () => {
    resetFiles();
    await expect(
      validateSftpCredential({ ...values, password: "wrong" }, undefined, dependencies),
    ).rejects.toMatchObject({ status: 400, message: expect.stringContaining("authentication failed") });
  });

  it("rejects a server whose key differs from the configured fingerprint", async () => {
    resetFiles();
    await expect(
      validateSftpCredential({ ...values, hostKeyFingerprint: `SHA256:${"A".repeat(43)}` }, undefined, dependencies),
    ).rejects.toMatchObject({ status: 400, message: expect.stringContaining("does not match the pinned") });
  });

  it("refuses private targets before opening a socket", async () => {
    dependencies.connectSocket.mockClear();
    await expect(
      validateSftpCredential(values, undefined, {
        ...dependencies,
        lookup: async () => [{ address: "10.0.0.5", family: 4 as const }],
      }),
    ).rejects.toBeInstanceOf(ProviderRequestError);
    expect(dependencies.connectSocket).not.toHaveBeenCalled();
  });

  it("stops waiting for a stalled DNS lookup when the caller aborts", async () => {
    const controller = new AbortController();
    const pending = validateSftpCredential(values, controller.signal, {
      ...dependencies,
      lookup: () => new Promise(() => undefined),
    });
    setTimeout(() => controller.abort(), 20);
    await expect(pending).rejects.toMatchObject({ status: 504 });
  });

  it("rejects hosts that carry a scheme or port", async () => {
    await expect(
      validateSftpCredential({ ...values, host: "sftp://sftp.example.com:22" }, undefined, dependencies),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("sftp actions", () => {
  it("refuses to execute when the server host key changed after validation", async () => {
    resetFiles();
    const context = createSftpContext(
      values,
      { hostKeyFingerprint: "B".repeat(43) },
      undefined,
      undefined,
      dependencies,
    );
    await expect(sftpActionHandlers.stat({ path: "notes.txt" }, context)).rejects.toMatchObject({ status: 401 });
  });

  it("refuses to execute without a recorded host key", () => {
    expect(() => createSftpContext(values, {}, undefined, undefined, dependencies)).toThrow(/host key/);
  });

  it("lists, inspects and reports missing paths", async () => {
    resetFiles();
    const context = await validatedContext();
    await expect(sftpActionHandlers.list_directory({ path: "." }, context)).resolves.toMatchObject({
      path: ".",
      truncated: false,
      entries: [
        { name: "notes.txt", path: "./notes.txt", type: "file", sizeBytes: 5, permissions: "rw-r--r--" },
        { name: "reports", path: "./reports", type: "directory", permissions: "rwxr-xr-x" },
      ],
    });
    await expect(sftpActionHandlers.list_directory({ path: ".", maxEntries: 1 }, context)).resolves.toMatchObject({
      truncated: true,
      entries: [{ name: "notes.txt" }],
    });
    await expect(sftpActionHandlers.stat({ path: "reports/q3.csv" }, context)).resolves.toMatchObject({
      type: "file",
      sizeBytes: 20,
      mode: "0644",
    });
    await expect(sftpActionHandlers.stat({ path: "missing.txt" }, context)).rejects.toMatchObject({ status: 404 });
  });

  it("uploads and downloads through transit files", async () => {
    resetFiles();
    const stored = new Map<string, File>();
    const transitFiles: TransitFileStore = {
      maxBytes: 1024,
      async create(file) {
        stored.set("download-1", file);
        return {
          fileId: "download-1",
          downloadUrl: "http://localhost/api/files/download-1",
          sizeBytes: file.size,
          name: file.name,
          mimeType: file.type,
        };
      },
      async read(fileId) {
        const file = new File(["uploaded body"], "upload.txt", { type: "text/plain" });
        if (fileId !== "upload-1") throw new Error("unknown file");
        return { file, sizeBytes: file.size, name: file.name, mimeType: file.type };
      },
      async delete() {
        return true;
      },
    };
    const context = await validatedContext(transitFiles);

    await expect(
      sftpActionHandlers.upload_file({ path: "notes.txt", file: { fileId: "upload-1" } }, context),
    ).rejects.toMatchObject({ status: 400, message: expect.stringContaining("already exists") });
    await expect(
      sftpActionHandlers.upload_file({ path: "reports/new.txt", file: { fileId: "upload-1" } }, context),
    ).resolves.toEqual({ path: "reports/new.txt", sizeBytes: 13, overwritten: false });
    expect(files.get(`${homeDirectory}/reports/new.txt`)).toEqual({ kind: "file", data: Buffer.from("uploaded body") });

    const download = await sftpActionHandlers.download_file({ path: "reports/q3.csv", mimeType: "text/csv" }, context);
    expect(download).toMatchObject({
      path: "reports/q3.csv",
      file: { name: "q3.csv", sizeBytes: 20, mimeType: "text/csv" },
    });
    await expect(stored.get("download-1")?.text()).resolves.toBe("quarter,total\nq3,42\n");

    await expect(sftpActionHandlers.download_file({ path: "reports" }, context)).rejects.toMatchObject({ status: 400 });
  });

  it("never truncates a file another client created after the existence check", async () => {
    resetFiles();
    const transitFiles: TransitFileStore = {
      maxBytes: 1024,
      async create() {
        throw new Error("create is not expected in this test");
      },
      async read() {
        const file = new File(["replacement"], "race.txt", { type: "text/plain" });
        return { file, sizeBytes: file.size, name: file.name, mimeType: file.type };
      },
      async delete() {
        return true;
      },
    };
    const racedPath = `${homeDirectory}/race.txt`;
    files.set(racedPath, { kind: "file", data: Buffer.from("first writer") });
    hiddenFromStat.add(racedPath);
    const context = await validatedContext(transitFiles);

    await expect(
      sftpActionHandlers.upload_file({ path: "race.txt", file: { fileId: "upload-1" } }, context),
    ).rejects.toMatchObject({ status: 400, message: expect.stringContaining("could not be created exclusively") });
    expect(files.get(racedPath)).toEqual({ kind: "file", data: Buffer.from("first writer") });
  });

  it("keeps surrounding spaces in remote paths", async () => {
    resetFiles();
    files.set(`${homeDirectory}/notes.txt `, { kind: "file", data: Buffer.from("trailing space") });
    const context = await validatedContext();

    await expect(sftpActionHandlers.delete_file({ path: "notes.txt " }, context)).resolves.toEqual({
      path: "notes.txt ",
      deleted: true,
    });
    expect(files.has(`${homeDirectory}/notes.txt `)).toBe(false);
    expect(files.has(`${homeDirectory}/notes.txt`)).toBe(true);
    await expect(sftpActionHandlers.stat({ path: "" }, context)).rejects.toMatchObject({ status: 400 });
  });

  it("creates, renames and removes entries", async () => {
    resetFiles();
    const context = await validatedContext();

    await expect(sftpActionHandlers.create_directory({ path: "archive" }, context)).resolves.toEqual({
      path: "archive",
      created: true,
    });
    await expect(sftpActionHandlers.create_directory({ path: "archive" }, context)).rejects.toMatchObject({
      status: 400,
    });
    await expect(sftpActionHandlers.create_directory({ path: "archive", recursive: true }, context)).resolves.toEqual({
      path: "archive",
      created: false,
    });
    await expect(
      sftpActionHandlers.rename({ fromPath: "notes.txt", toPath: "archive/notes.txt" }, context),
    ).resolves.toEqual({ fromPath: "notes.txt", toPath: "archive/notes.txt" });
    expect(files.has(`${homeDirectory}/archive/notes.txt`)).toBe(true);

    await expect(sftpActionHandlers.delete_file({ path: "archive" }, context)).rejects.toMatchObject({ status: 400 });
    await expect(sftpActionHandlers.remove_directory({ path: "archive" }, context)).rejects.toMatchObject({
      status: 400,
    });
    await expect(sftpActionHandlers.delete_file({ path: "archive/notes.txt" }, context)).resolves.toEqual({
      path: "archive/notes.txt",
      deleted: true,
    });
    await expect(sftpActionHandlers.remove_directory({ path: "archive" }, context)).resolves.toEqual({
      path: "archive",
      removed: true,
    });
    await expect(sftpActionHandlers.remove_directory({ path: "reports", recursive: true }, context)).resolves.toEqual({
      path: "reports",
      removed: true,
    });
    expect([...files.keys()].some((key) => key.startsWith(`${homeDirectory}/reports`))).toBe(false);
    await expect(sftpActionHandlers.delete_file({ path: "missing.txt" }, context)).rejects.toMatchObject({
      status: 404,
    });
  });
});

/** OpenSSH-style unpadded base64 SHA-256 of a public key blob. */
function fingerprintOf(publicKey: string): string {
  const parsed = utils.parseKey(publicKey);
  if (parsed instanceof Error) throw parsed;
  const key = Array.isArray(parsed) ? parsed[0]! : parsed;
  return createHash("sha256").update(key.getPublicSSH()).digest("base64").replace(/=+$/, "");
}

function serveClient(client: Connection): void {
  client.on("error", () => undefined);
  client.on("authentication", (context) => {
    if (context.method === "password" && context.username === "deploy" && context.password === "correct-password") {
      context.accept();
      return;
    }
    context.reject(["password"]);
  });
  client.on("ready", () => {
    client.on("session", (accept) => {
      accept().on("sftp", (acceptSftp) => serveSftp(acceptSftp()));
    });
  });
}

/** Serve a minimal in-memory filesystem rooted at the deploy user's home directory. */
function serveSftp(sftp: SFTPWrapper): void {
  const handles = new Map<number, { path: string; listed?: boolean; flags?: number }>();
  let nextHandle = 0;
  const resolvePath = (path: string): string =>
    posix.normalize(path.startsWith("/") ? path : `${homeDirectory}/${path}`);
  const toHandle = (id: number): Buffer => Buffer.from(String(id));
  const fromHandle = (handle: Buffer) => handles.get(Number(handle.toString()));
  const attributes = (node: MemoryNode): Attributes => ({
    mode: node.kind === "dir" ? 0o040755 : 0o100644,
    uid: 1000,
    gid: 1000,
    size: node.kind === "file" ? node.data.length : 4096,
    atime: 1_700_000_000,
    mtime: 1_700_000_000,
  });
  const longname = (name: string, node: MemoryNode): string =>
    `${node.kind === "dir" ? "drwxr-xr-x" : "-rw-r--r--"} 1 deploy deploy ${attributes(node).size} Nov 14 2023 ${name}`;
  const children = (directory: string) =>
    [...files.entries()].filter(([path]) => path !== directory && posix.dirname(path) === directory);

  sftp.on("REALPATH", (reqId, path) => {
    const resolved = resolvePath(path);
    sftp.name(reqId, [{ filename: resolved, longname: resolved, attrs: {} as Attributes }]);
  });
  const stat = (reqId: number, path: string): void => {
    const resolved = resolvePath(path);
    const node = files.get(resolved);
    if (!node || hiddenFromStat.has(resolved)) return void sftp.status(reqId, STATUS_CODE.NO_SUCH_FILE);
    sftp.attrs(reqId, attributes(node));
  };
  sftp.on("STAT", stat);
  sftp.on("LSTAT", stat);
  sftp.on("OPENDIR", (reqId, path) => {
    const resolved = resolvePath(path);
    if (files.get(resolved)?.kind !== "dir") return void sftp.status(reqId, STATUS_CODE.NO_SUCH_FILE);
    handles.set(nextHandle, { path: resolved });
    sftp.handle(reqId, toHandle(nextHandle++));
  });
  sftp.on("READDIR", (reqId, handle) => {
    const entry = fromHandle(handle);
    if (!entry || entry.listed) return void sftp.status(reqId, STATUS_CODE.EOF);
    entry.listed = true;
    sftp.name(
      reqId,
      children(entry.path).map(([path, node]) => ({
        filename: posix.basename(path),
        longname: longname(posix.basename(path), node),
        attrs: attributes(node),
      })),
    );
  });
  sftp.on("OPEN", (reqId, filename, flags) => {
    const resolved = resolvePath(filename);
    const node = files.get(resolved);
    if (flags & OPEN_MODE.WRITE) {
      if (flags & OPEN_MODE.EXCL && node) return void sftp.status(reqId, STATUS_CODE.FAILURE);
      if (files.get(posix.dirname(resolved))?.kind !== "dir") return void sftp.status(reqId, STATUS_CODE.NO_SUCH_FILE);
      if (!node || flags & OPEN_MODE.TRUNC) files.set(resolved, { kind: "file", data: Buffer.alloc(0) });
    } else if (node?.kind !== "file") {
      return void sftp.status(reqId, STATUS_CODE.NO_SUCH_FILE);
    }
    handles.set(nextHandle, { path: resolved, flags });
    sftp.handle(reqId, toHandle(nextHandle++));
  });
  sftp.on("READ", (reqId, handle, offset, length) => {
    const node = files.get(fromHandle(handle)?.path ?? "");
    if (node?.kind !== "file" || offset >= node.data.length) return void sftp.status(reqId, STATUS_CODE.EOF);
    sftp.data(reqId, node.data.subarray(offset, offset + length));
  });
  sftp.on("WRITE", (reqId, handle, offset, data) => {
    const path = fromHandle(handle)?.path ?? "";
    const node = files.get(path);
    if (node?.kind !== "file") return void sftp.status(reqId, STATUS_CODE.FAILURE);
    const next = Buffer.alloc(Math.max(node.data.length, offset + data.length));
    node.data.copy(next);
    data.copy(next, offset);
    files.set(path, { kind: "file", data: next });
    sftp.status(reqId, STATUS_CODE.OK);
  });
  sftp.on("FSTAT", (reqId, handle) => {
    const node = files.get(fromHandle(handle)?.path ?? "");
    if (!node) return void sftp.status(reqId, STATUS_CODE.FAILURE);
    sftp.attrs(reqId, attributes(node));
  });
  sftp.on("CLOSE", (reqId, handle) => {
    handles.delete(Number(handle.toString()));
    sftp.status(reqId, STATUS_CODE.OK);
  });
  sftp.on("MKDIR", (reqId, path) => {
    const resolved = resolvePath(path);
    if (files.has(resolved) || files.get(posix.dirname(resolved))?.kind !== "dir") {
      return void sftp.status(reqId, STATUS_CODE.FAILURE);
    }
    files.set(resolved, { kind: "dir" });
    sftp.status(reqId, STATUS_CODE.OK);
  });
  sftp.on("RMDIR", (reqId, path) => {
    const resolved = resolvePath(path);
    if (files.get(resolved)?.kind !== "dir") return void sftp.status(reqId, STATUS_CODE.NO_SUCH_FILE);
    if (children(resolved).length > 0) return void sftp.status(reqId, STATUS_CODE.FAILURE);
    files.delete(resolved);
    sftp.status(reqId, STATUS_CODE.OK);
  });
  sftp.on("REMOVE", (reqId, path) => {
    const resolved = resolvePath(path);
    if (files.get(resolved)?.kind !== "file") return void sftp.status(reqId, STATUS_CODE.NO_SUCH_FILE);
    files.delete(resolved);
    sftp.status(reqId, STATUS_CODE.OK);
  });
  sftp.on("RENAME", (reqId, oldPath, newPath) => {
    const from = resolvePath(oldPath);
    const to = resolvePath(newPath);
    if (!files.has(from)) return void sftp.status(reqId, STATUS_CODE.NO_SUCH_FILE);
    if (files.has(to)) return void sftp.status(reqId, STATUS_CODE.FAILURE);
    for (const [path, node] of [...files.entries()]) {
      if (path === from || path.startsWith(`${from}/`)) {
        files.delete(path);
        files.set(`${to}${path.slice(from.length)}`, node);
      }
    }
    sftp.status(reqId, STATUS_CODE.OK);
  });
}
