import type { ProviderDefinition } from "../../core/types.ts";
import type { MiddlewareHandler } from "hono";

import { Hono } from "hono";
import { optionalString } from "../../core/cast.ts";
import { PromiseCache } from "../../core/promise-cache.ts";

const docsHandler = new PromiseCache<MiddlewareHandler>();

/** The Scalar API reference is only rendered for /docs, so its package is loaded on demand. */
export function loadDocsHandler(openapiUrl = "/openapi.json"): Promise<MiddlewareHandler> {
  return docsHandler.get(openapiUrl, async () => {
    const { Scalar } = await import("@scalar/hono-api-reference");
    return Scalar({
      pageTitle: "OOMOL Connect API Reference",
      url: openapiUrl,
      theme: "default",
      darkMode: false,
      forceDarkModeState: "light",
      customCss: `
          :root {
            --scalar-color-accent: rgb(59, 99, 251);
            --scalar-background-accent: rgba(59, 99, 251, 0.12);
          }
        `,
    });
  });
}

export interface DocsRoutesOptions {
  providers: ProviderDefinition[];
  publicOrigin: string;
  serveDocumentation?: boolean;
}

/** OpenAPI 3.1 schema and interactive documentation routes. */
export function createDocsRoutes({ providers, publicOrigin, serveDocumentation }: DocsRoutesOptions): Hono {
  const app = new Hono();

  app.get("/openapi.json", async (context) => {
    const { createOpenApiDocument } = await import("./openapi.ts");
    return context.json(
      createOpenApiDocument(providers, {
        actionId: optionalString(context.req.query("actionId")),
      }),
    );
  });

  if (serveDocumentation !== false) {
    const openapiUrl = `${new URL(publicOrigin).pathname.replace(/\/+$/, "")}/openapi.json`;
    app.get("/docs", async (context, next) => (await loadDocsHandler(openapiUrl))(context, next));
  }

  return app;
}
