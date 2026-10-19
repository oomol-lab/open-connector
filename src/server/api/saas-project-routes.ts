import type { SaasProjectService } from "../../saas/saas-project-service.ts";

import { Hono } from "hono";
import { readJsonBody } from "./http-utils.ts";

export interface SaasProjectRoutesOptions {
  saasProject: SaasProjectService;
}

/** Managed project configuration for SaaS OAuth sources. */
export function createSaasProjectRoutes({ saasProject }: SaasProjectRoutesOptions): Hono {
  const app = new Hono();

  app.get("/oauth/managed-project", async (context) =>
    context.json(await saasProject.getState(context.req.raw.signal)),
  );
  app.put("/oauth/managed-project", async (context) =>
    context.json(await saasProject.configure(await readJsonBody(context, 16_384), context.req.raw.signal)),
  );
  app.delete("/oauth/managed-project", async (context) => {
    await saasProject.remove();
    return context.json(await saasProject.getState(context.req.raw.signal));
  });
  app.get("/oauth/managed-project/provider-configs", async (context) =>
    context.json(await saasProject.listProviderConfigs(context.req.raw.signal)),
  );
  app.get("/oauth/sources/:service", async (context) =>
    context.json(await saasProject.getSource(context.req.param("service"))),
  );
  app.put("/oauth/sources/:service", async (context) =>
    context.json(
      await saasProject.setSource(
        context.req.param("service"),
        await readJsonBody(context, 16_384),
        context.req.raw.signal,
      ),
    ),
  );

  return app;
}
