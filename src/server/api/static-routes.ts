import type { Hono } from "hono";

import { serveStatic } from "@hono/node-server/serve-static";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isConsoleShellRequest } from "./console-paths.ts";
import { notFound } from "./http-utils.ts";

/**
 * Register static web-console routes for the local server.
 *
 * The web console is intentionally outside `src` and may be absent during
 * backend development. Hono's static middleware handles real files; this
 * wrapper owns only the fallback behavior for API and browser requests.
 */
export function registerStaticRoutes(app: Hono, root: string): void {
  app.use(
    "*",
    serveStatic({
      root,
      rewriteRequestPath: (path) => (path === "/" ? "/index.html" : path),
    }),
  );

  app.notFound(async (context) => {
    const requestUrl = new URL(context.req.url);
    if (!isConsoleShellRequest(requestUrl.pathname, context.req.method)) {
      return notFound(context);
    }

    try {
      return context.html(await readFile(join(root, "index.html"), "utf8"));
    } catch {
      return context.json({
        ok: true,
        message: "Server is running. Build the web workspace to enable the local console.",
      });
    }
  });
}
