import type { SaasOAuthService } from "../../saas/saas-oauth-service.ts";
import type { SaasProjectService } from "../../saas/saas-project-service.ts";

import { Hono } from "hono";
import { SaasError } from "../../saas/saas-client.ts";
import { jsonError } from "./http-utils.ts";
import { renderSaasCompletionPage } from "./saas-completion-page.ts";

export interface SaasOAuthRoutesOptions {
  saasProject: SaasProjectService;
  saasOAuth: SaasOAuthService;
}

/** Complete SaaS OAuth flow and browser-initiated connection sync. */
export function createSaasOAuthRoutes({ saasProject, saasOAuth }: SaasOAuthRoutesOptions): Hono {
  const app = new Hono();

  app.get("/oauth/saas/complete", (context) => {
    context.header(
      "Content-Security-Policy",
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
    );
    context.header("Referrer-Policy", "no-referrer");
    return context.html(renderSaasCompletionPage());
  });

  app.post("/api/oauth/connection-requests/:id/sync", async (context) => {
    const expectedOrigin = saasProject.requireOrigin();
    if (context.req.header("origin") !== expectedOrigin)
      throw new SaasError(
        "oauth_source_origin_mismatch",
        `Open Console at ${expectedOrigin}, or set OOMOL_CONNECT_ORIGIN to the exact Console address in your browser and restart Connect. localhost and 127.0.0.1 are different origins.`,
        403,
      );
    if (
      context.req.header("x-openconnector-request") !== "sync" ||
      context.req.header("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json"
    )
      return context.json(
        { error: { code: "forbidden", message: "OAuth synchronization requires a same-origin JSON request." } },
        403,
      );
    const result = await saasOAuth.syncForBrowser(context.req.param("id"), "local-admin", context.req.raw.signal);
    if (!result) return jsonError(context, 404, "connection_request_not_found", "Connection request not found.");
    context.header("Cache-Control", "private, no-store");
    return context.json(result);
  });

  return app;
}
