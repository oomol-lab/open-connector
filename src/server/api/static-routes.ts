import type { Hono } from "hono";

import { serveStatic } from "@hono/node-server/serve-static";
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

  app.notFound((context) => {
    const requestUrl = new URL(context.req.url);
    if (requestUrl.pathname.startsWith("/api") || requestUrl.pathname.startsWith("/mcp")) {
      return notFound(context);
    }

    return context.json({
      ok: true,
      message: "Server is running. Build the web workspace to enable the local console.",
    });
  });
}
