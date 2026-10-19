import type { MarketplaceConfigInput, MarketplaceService } from "../../marketplace/marketplace-service.ts";
import type { Context } from "hono";

import { Hono } from "hono";
import { optionalString } from "../../core/cast.ts";
import { MarketplaceError } from "../../marketplace/marketplace-service.ts";
import { jsonError, readJsonBody } from "./http-utils.ts";

export interface MarketplaceRoutesOptions {
  marketplace: MarketplaceService;
}

function writeMarketplaceError(context: Context, error: MarketplaceError): Response {
  const status = error.status;
  return jsonError(
    context,
    status === 401 || status === 403 || status === 404 || status === 502 || status === 504 ? status : 400,
    error.code,
    error.message,
  );
}

/** Marketplace configuration and provider preference routes. */
export function createMarketplaceRoutes({ marketplace }: MarketplaceRoutesOptions): Hono {
  const app = new Hono();

  app.get("/marketplace", (context) => context.json(marketplace.getState()));

  app.get("/marketplace/discovery", async (context) => {
    try {
      return context.json(await marketplace.getDefaultDiscovery(context.req.raw.signal));
    } catch (error) {
      if (error instanceof MarketplaceError) return writeMarketplaceError(context, error);
      throw error;
    }
  });

  const configureMarketplace = async (context: Context): Promise<Response> => {
    const body = await readJsonBody(context);
    const input: MarketplaceConfigInput = {
      discoveryUrl: optionalString(body.discoveryUrl),
      apiKey: optionalString(body.apiKey),
      enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
    };
    try {
      return context.json(await marketplace.configure(input));
    } catch (error) {
      if (error instanceof MarketplaceError) return writeMarketplaceError(context, error);
      throw error;
    }
  };

  app.put("/marketplace", configureMarketplace);
  app.patch("/marketplace", configureMarketplace);

  app.delete("/marketplace", async (context) => {
    await marketplace.remove();
    return context.json(marketplace.getState());
  });

  app.get("/provider-preferences", async (context) => context.json(await marketplace.listProviderPreferences()));

  app.patch("/provider-preferences/:service", async (context) => {
    const service = context.req.param("service");
    const body = await readJsonBody(context);
    if (typeof body.enabled !== "boolean") {
      return jsonError(context, 400, "invalid_input", "enabled must be a boolean.");
    }
    try {
      return context.json(await marketplace.setProviderEnabled(service, body.enabled));
    } catch (error) {
      if (error instanceof MarketplaceError) return jsonError(context, 404, error.code, error.message);
      throw error;
    }
  });

  return app;
}
