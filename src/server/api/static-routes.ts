import type { Hono } from "hono";

import { serveStatic } from "@hono/node-server/serve-static";
import { getMimeType } from "hono/utils/mime";
import { readdirSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { isConsoleShellRequest } from "./console-paths.ts";
import { notFound } from "./http-utils.ts";

export interface StaticRoutesOptions {
  /** Built console directory; undefined when the console is not built. */
  root?: string;
  /** Serve from an embedded (non-streamable, epoch-mtime) tree: files are loaded into memory once at registration. */
  embedded?: boolean;
}

interface EmbeddedFile {
  /** Backed by a plain ArrayBuffer, which is what Hono's response body type requires. */
  body: Uint8Array<ArrayBuffer>;
  contentType: string;
}

/** The console entry file is owned here: `/` resolves to `/index.html` in both serving modes. */
function rewriteRequestPath(path: string): string {
  return path === "/" ? "/index.html" : path;
}

/**
 * Register static web-console routes for the local server.
 *
 * The web console is intentionally outside `src` and may be absent during
 * backend development. Hono's static middleware handles real files; this
 * wrapper owns only the fallback behavior for API and browser requests.
 *
 * Inside a Bun standalone executable the console lives in the embedded tree,
 * where `createReadStream` does not work and every mtime is the Unix epoch, so
 * the streaming middleware cannot be used. Embedded mode instead reads the
 * whole tree into memory once and answers from that map.
 */
export function registerStaticRoutes(app: Hono, options: StaticRoutesOptions = {}): void {
  const root = options.root;
  if (root) {
    if (options.embedded) {
      registerEmbeddedFiles(app, readEmbeddedFiles(root));
    } else {
      app.use(
        "*",
        serveStatic({
          root,
          rewriteRequestPath,
        }),
      );
    }
  }

  app.notFound(async (context) => {
    const requestUrl = new URL(context.req.url);
    if (!isConsoleShellRequest(requestUrl.pathname, context.req.method)) {
      return notFound(context);
    }

    if (!root) {
      return context.json({
        ok: true,
        message:
          "Server is running. Use http://localhost:5173 for local console development, or run npm run build:web to enable the built console on this server.",
      });
    }

    try {
      return context.html(await readFile(join(root, "index.html"), "utf8"));
    } catch {
      return context.json({
        ok: true,
        message: "Server is running. Run npm run build:web to enable the built console on this server.",
      });
    }
  });
}

/**
 * Walk the console tree synchronously: `createApp()` registers routes
 * synchronously, so an asynchronous walk would race the first request.
 */
function readEmbeddedFiles(root: string): Map<string, EmbeddedFile> {
  const files = new Map<string, EmbeddedFile>();
  for (const entry of readdirSync(root, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) {
      continue;
    }
    const absolute = join(entry.parentPath, entry.name);
    // The recursive walk yields backslash-separated names on Windows; request
    // paths always use forward slashes, so normalise the key or nothing matches.
    const key = `/${relative(root, absolute).split(sep).join("/")}`;
    files.set(key, {
      body: readFileSync(absolute),
      contentType: getMimeType(entry.name) ?? "application/octet-stream",
    });
  }
  return files;
}

/**
 * Serve the in-memory console files. No Last-Modified or ETag headers: embedded
 * mtimes are the epoch, so unlike the streaming middleware there is nothing
 * truthful to validate against. Content-hashed assets are marked immutable
 * instead; everything else is served uncached.
 */
function registerEmbeddedFiles(app: Hono, files: Map<string, EmbeddedFile>): void {
  app.use("*", async (context, next) => {
    const method = context.req.method;
    if (method !== "GET" && method !== "HEAD") {
      return next();
    }

    const path = rewriteRequestPath(context.req.path);
    const file = files.get(path);
    if (!file) {
      return next();
    }

    const headers: Record<string, string> = {
      "Content-Type": file.contentType,
      "Content-Length": String(file.body.byteLength),
    };
    // Vite names everything under assets/ by content hash, so a URL never changes
    // meaning and a year-long immutable cache is safe; index.html and the other
    // root files keep their names between releases and stay uncached. Embedded
    // mode cannot offer Last-Modified as the alternative: every mtime in the
    // embedded tree is the Unix epoch, so a validator would never see a change.
    if (path.startsWith("/assets/")) {
      headers["Cache-Control"] = "public, max-age=31536000, immutable";
    }
    return method === "HEAD" ? context.body(null, 200, headers) : context.body(file.body, 200, headers);
  });
}
