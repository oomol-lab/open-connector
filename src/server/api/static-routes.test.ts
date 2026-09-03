import { Hono } from "hono";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { registerStaticRoutes } from "./static-routes.ts";

const indexHtml = '<!doctype html><div id="root"></div>';
const consoleScript = "console.log('ok');";
const headersFile = "/*\n  X-Frame-Options: DENY\n";
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("registerStaticRoutes in embedded mode", () => {
  it("serves index.html for the root path", async () => {
    const app = await createEmbeddedApp();

    const response = await app.request("/");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("content-length")).toBe(String(Buffer.byteLength(indexHtml)));
    await expect(response.text()).resolves.toBe(indexHtml);
  });

  it("serves nested assets with their content type", async () => {
    const app = await createEmbeddedApp();

    const response = await app.request("/assets/x.js");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^text\/javascript/);
    expect(response.headers.get("content-length")).toBe(String(Buffer.byteLength(consoleScript)));
    await expect(response.text()).resolves.toBe(consoleScript);
  });

  it("falls back to application/octet-stream for files without an extension", async () => {
    const app = await createEmbeddedApp();

    const response = await app.request("/_headers");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/octet-stream");
    await expect(response.text()).resolves.toBe(headersFile);
  });

  it("answers HEAD with headers only", async () => {
    const app = await createEmbeddedApp();

    const response = await app.request("/assets/x.js", { method: "HEAD" });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^text\/javascript/);
    expect(response.headers.get("content-length")).toBe(String(Buffer.byteLength(consoleScript)));
    await expect(response.text()).resolves.toBe("");
  });

  it("serves the console shell for unknown console paths", async () => {
    const app = await createEmbeddedApp();

    const response = await app.request("/providers/github");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    await expect(response.text()).resolves.toBe(indexHtml);
  });

  it("keeps JSON 404 responses for API paths", async () => {
    const app = await createEmbeddedApp();

    const response = await app.request("/v1/nope");

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({
      error: { code: "not_found", message: "Not found." },
    });
  });

  it("does not serve assets for POST requests", async () => {
    const app = await createEmbeddedApp();

    const response = await app.request("/assets/x.js", { method: "POST" });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: { code: "not_found", message: "Not found." },
    });
  });

  it("marks content-hashed assets immutable and leaves index.html uncached", async () => {
    const app = await createEmbeddedApp();

    const asset = await app.request("/assets/x.js");
    const index = await app.request("/index.html");

    expect(asset.status).toBe(200);
    expect(asset.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(index.status).toBe(200);
    expect(index.headers.get("cache-control")).toBeNull();
  });

  it("loads the tree into memory at registration", async () => {
    const root = await createConsoleRoot();
    const app = new Hono();
    registerStaticRoutes(app, { root, embedded: true });
    await rm(root, { recursive: true, force: true });

    const response = await app.request("/assets/x.js");

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe(consoleScript);
  });
});

describe("registerStaticRoutes in Node mode", () => {
  it("streams assets from disk", async () => {
    const root = await createConsoleRoot();
    const app = new Hono();
    registerStaticRoutes(app, { root });

    const response = await app.request("/assets/x.js");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^text\/javascript/);
    await expect(response.text()).resolves.toBe(consoleScript);
  });
});

async function createEmbeddedApp(): Promise<Hono> {
  const app = new Hono();
  registerStaticRoutes(app, { root: await createConsoleRoot(), embedded: true });
  return app;
}

async function createConsoleRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "oomol-connect-static-"));
  tempDirs.push(root);
  await mkdir(join(root, "assets"), { recursive: true });
  await writeFile(join(root, "index.html"), indexHtml);
  await writeFile(join(root, "assets", "x.js"), consoleScript);
  await writeFile(join(root, "_headers"), headersFile);
  return root;
}
