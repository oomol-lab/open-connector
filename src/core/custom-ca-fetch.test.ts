import type { Server } from "node:https";
import type { AddressInfo } from "node:net";

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ProviderRequestError } from "../providers/provider-runtime.ts";
import { createCustomCaFetch } from "./custom-ca-fetch.ts";

describe("createCustomCaFetch", () => {
  let directory: string;
  let trustedCa: string;
  let unrelatedCa: string;
  let server: Server;
  let origin: string;

  function openssl(...args: string[]): void {
    execFileSync("openssl", args, { cwd: directory, stdio: "ignore" });
  }

  function createCa(name: string): string {
    openssl(
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      `${name}.key`,
      "-out",
      `${name}.pem`,
      "-days",
      "1",
      "-subj",
      `/CN=${name}`,
      "-addext",
      "basicConstraints=critical,CA:TRUE",
      "-addext",
      "keyUsage=critical,keyCertSign",
    );
    return readFileSync(join(directory, `${name}.pem`), "utf8");
  }

  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), "custom-ca-fetch-"));
    trustedCa = createCa("trusted");
    unrelatedCa = createCa("unrelated");
    writeFileSync(join(directory, "san.cnf"), "subjectAltName=IP:127.0.0.1\n");
    openssl("req", "-newkey", "rsa:2048", "-nodes", "-keyout", "leaf.key", "-out", "leaf.csr", "-subj", "/CN=leaf");
    openssl(
      "x509",
      "-req",
      "-in",
      "leaf.csr",
      "-CA",
      "trusted.pem",
      "-CAkey",
      "trusted.key",
      "-set_serial",
      "1",
      "-days",
      "1",
      "-extfile",
      "san.cnf",
      "-out",
      "leaf.pem",
    );
    server = createServer(
      { key: readFileSync(join(directory, "leaf.key")), cert: readFileSync(join(directory, "leaf.pem")) },
      (request, response) => {
        if (request.url === "/redirect") {
          response.writeHead(302, { location: "/elsewhere" }).end();
          return;
        }
        const chunks: Buffer[] = [];
        request.on("data", (chunk: Buffer) => chunks.push(chunk));
        request.on("end", () => {
          response.writeHead(200, { "content-type": "application/json" }).end(
            JSON.stringify({
              method: request.method,
              authorization: request.headers.authorization,
              body: Buffer.concat(chunks).toString("utf8"),
            }),
          );
        });
      },
    );
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    origin = `https://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    rmSync(directory, { recursive: true, force: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("trusts a server whose certificate chains to the supplied CA and forwards the request", async () => {
    const response = await createCustomCaFetch(trustedCa)(new URL(`${origin}/resource`), {
      method: "PATCH",
      headers: new Headers({ authorization: "Bearer token" }),
      body: '{"spec":{}}',
      signal: new AbortController().signal,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      method: "PATCH",
      authorization: "Bearer token",
      body: '{"spec":{}}',
    });
  });

  it("rejects a server that does not chain to the supplied CA", async () => {
    await expect(createCustomCaFetch(unrelatedCa)(`${origin}/resource`)).rejects.toThrow(TypeError);
  });

  it("does not extend trust to the platform fetch", async () => {
    await expect(fetch(`${origin}/resource`)).rejects.toThrow(TypeError);
  });

  // The guarded fetch follows redirects itself, so it depends on the transport surfacing the 3xx.
  it("returns an unfollowed redirect with its location", async () => {
    const response = await createCustomCaFetch(trustedCa)(`${origin}/redirect`, { redirect: "manual" });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/elsewhere");
  });

  it("fails with a 400 on Cloudflare Workers instead of using the default trust store", async () => {
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
    const platformFetch = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", platformFetch);

    const failure = await createCustomCaFetch(trustedCa)(`${origin}/resource`).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ProviderRequestError);
    expect(failure).toMatchObject({ status: 400 });
    expect(platformFetch).not.toHaveBeenCalled();
  });

  it("uses the native tls option on Bun", async () => {
    vi.stubGlobal("Bun", {});
    const platformFetch = vi.fn<typeof fetch>(async () => new Response("ok"));
    vi.stubGlobal("fetch", platformFetch);

    await createCustomCaFetch(trustedCa)("https://cluster.example.com/resource", { method: "DELETE" });

    expect(platformFetch).toHaveBeenCalledWith("https://cluster.example.com/resource", {
      method: "DELETE",
      tls: { ca: trustedCa },
    });
  });

  it("rejects Request input, which undici cannot read from a platform Request", async () => {
    await expect(createCustomCaFetch(trustedCa)(new Request(`${origin}/resource`))).rejects.toThrow(
      "accepts only URL or string input",
    );
  });
});
