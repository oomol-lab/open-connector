import type { CatalogStore } from "../../catalog-store.ts";
import type { ConnectionService } from "../../connection-service.ts";
import type { ActionPolicySnapshot } from "../../core/action-policy.ts";
import type { ActionSearchDocument, ActionSearchIndexProvider } from "../../core/action-search.ts";
import type { Context } from "hono";

import { Hono } from "hono";
import { ConnectionError } from "../../connection-error.ts";
import { searchActions } from "../../core/action-search.ts";
import { renderActionMarkdown } from "./action-markdown.ts";
import { jsonError, notFound, readConnectionName as defaultReadConnectionName } from "./http-utils.ts";
import { mapConnectionErrorStatus } from "./runtime-api.ts";
import { readSearchQuery, serializeActionSearchResult } from "./runtime-catalog-routes.ts";

function stripWeakPrefix(etag: string): string {
  return etag.startsWith("W/") ? etag.slice(2) : etag;
}

function requestMatchesEtag(ifNoneMatch: string | undefined, etag: string): boolean {
  if (!ifNoneMatch) return false;
  if (ifNoneMatch.trim() === "*") return true;
  const target = stripWeakPrefix(etag);
  return ifNoneMatch.split(",").some((candidate) => stripWeakPrefix(candidate.trim()) === target);
}

export interface ConsoleCatalogRoutesOptions {
  catalog: CatalogStore;
  connections: ConnectionService;
  actionSearch: ActionSearchIndexProvider;
  publicOrigin: string;
  getPolicySnapshot: (context: Context) => Promise<ActionPolicySnapshot>;
  readConnectionName?: (context: Context, body?: Record<string, unknown>) => string | undefined;
  serializeSearchResults?: (results: ActionSearchDocument[]) => Promise<unknown[]>;
}

/** Console catalog, providers, actions and documentation routes. */
export function createConsoleCatalogRoutes({
  catalog,
  connections,
  actionSearch,
  publicOrigin,
  getPolicySnapshot,
  readConnectionName = defaultReadConnectionName,
  serializeSearchResults: injectedSerializeSearchResults,
}: ConsoleCatalogRoutesOptions): Hono {
  const app = new Hono();

  const serializeSearchResults =
    injectedSerializeSearchResults ??
    (async (results: ActionSearchDocument[]): Promise<unknown[]> => {
      const authenticated = new Set(
        await connections.listAuthenticatedServices([...new Set(results.map((result) => result.service))]),
      );
      const items: unknown[] = [];
      for (const result of results) {
        const action = await catalog.getAction(result.id);
        if (action) items.push(serializeActionSearchResult(result, action, authenticated.has(action.service)));
      }
      return items;
    });

  app.get("/providers", (context) => {
    const { providerSummariesJson, providerSummariesEtag } = catalog;
    context.header("ETag", providerSummariesEtag);
    if (requestMatchesEtag(context.req.header("If-None-Match"), providerSummariesEtag)) {
      return context.body(null, 304);
    }
    return context.body(providerSummariesJson, 200, { "Content-Type": "application/json" });
  });

  app.get("/providers/:service", async (context) => {
    const provider = catalog.providers.find((p) => p.service === context.req.param("service"));
    if (!provider) return notFound(context);
    return context.json({
      ...provider,
      actions: await Promise.all(provider.actions.map((action) => catalog.getAction(action.id))),
    });
  });

  app.get("/actions", async (context) =>
    context.json(await Promise.all(catalog.actions.map((action) => catalog.getAction(action.id)))),
  );

  app.get("/actions/search", async (context) => {
    const query = readSearchQuery(context);
    if (!query.ok) {
      return jsonError(context, 400, "invalid_input", query.message);
    }

    const index = await actionSearch.get();
    return context.json(
      await serializeSearchResults(
        searchActions(index, query.q, {
          service: query.service,
          limit: query.limit,
        }),
      ),
    );
  });

  app.get("/actions/:actionId/agent.md", async (context) => {
    const actionId = context.req.param("actionId");
    const action = await catalog.getAction(actionId);
    if (!action) return notFound(context);

    try {
      const policy = (await getPolicySnapshot(context)).evaluate(action);
      return context.text(
        renderActionMarkdown(action, {
          transport: { kind: "http", origin: publicOrigin },
          connection: await connections.getConnectionSummary(action.service, readConnectionName(context)),
          policy,
        }),
        200,
        {
          "content-type": "text/markdown; charset=utf-8",
        },
      );
    } catch (error) {
      if (error instanceof ConnectionError) {
        const status = mapConnectionErrorStatus(error);
        return jsonError(context, status, error.code, error.message);
      }
      throw error;
    }
  });

  app.get("/actions/:actionId", async (context) => {
    const action = await catalog.getAction(context.req.param("actionId"));
    if (!action) return notFound(context);
    return context.json(action);
  });

  return app;
}
