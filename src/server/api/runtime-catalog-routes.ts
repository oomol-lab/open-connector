import type { CatalogStore, RuntimeActionDefinition } from "../../catalog-store.ts";
import type { ConnectionService } from "../../connection-service.ts";
import type { ActionSearchDocument, ActionSearchIndexProvider } from "../../core/action-search.ts";
import type { OAuthClientConfigService } from "../../oauth/oauth-client-config-service.ts";
import type { SaasProjectService } from "../../saas/saas-project-service.ts";
import type { Context } from "hono";

import { Hono } from "hono";
import { DEFAULT_ACTION_SEARCH_LIMIT, searchActions } from "../../core/action-search.ts";
import { optionalString } from "../../core/cast.ts";
import {
  serializeRuntimeAction,
  serializeRuntimeActionService,
  serializeRuntimeProvider,
  serializeRuntimeProviderSetup,
  unknownActionFailure,
  unknownServiceFailure,
  writeRuntimeFailure,
  writeRuntimeSuccess,
} from "./runtime-api.ts";

export interface RuntimeActionSearchResult {
  id: string;
  service: string;
  name: string;
  description: string;
  operationType: RuntimeActionDefinition["operationType"];
  authenticated: boolean;
  inputSchema: RuntimeActionDefinition["inputSchema"];
  outputSchema: RuntimeActionDefinition["outputSchema"];
}

export function serializeActionSearchResult(
  result: ActionSearchDocument,
  action: RuntimeActionDefinition,
  authenticated: boolean,
): RuntimeActionSearchResult {
  return {
    id: result.id,
    service: result.service,
    name: result.name,
    description: result.description,
    operationType: action.operationType,
    authenticated,
    inputSchema: action.inputSchema,
    outputSchema: action.outputSchema,
  };
}

export type SearchQuery =
  | {
      ok: true;
      q: string;
      service?: string;
      limit: number;
    }
  | {
      ok: false;
      message: string;
    };

export function readSearchQuery(context: Context, defaultLimit: number = DEFAULT_ACTION_SEARCH_LIMIT): SearchQuery {
  const q = optionalString(context.req.query("q") ?? context.req.query("query"));
  if (!q || q.length > 256) {
    return { ok: false, message: "q must be a non-empty string of at most 256 characters." };
  }

  const rawLimit = optionalString(context.req.query("limit"));
  if (!rawLimit) {
    return {
      ok: true,
      q,
      service: optionalString(context.req.query("service")),
      limit: defaultLimit,
    };
  }

  const limit = Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    return { ok: false, message: "limit must be an integer between 1 and 50." };
  }

  return {
    ok: true,
    q,
    service: optionalString(context.req.query("service")),
    limit,
  };
}

export interface RuntimeCatalogRoutesOptions {
  catalog: CatalogStore;
  connections: ConnectionService;
  actionSearch: ActionSearchIndexProvider;
  oauthClientConfigs: OAuthClientConfigService;
  saasProject?: SaasProjectService;
}

/** Provider and action discovery, inspection and search routes under /v1. */
export function createRuntimeCatalogRoutes({
  catalog,
  connections,
  actionSearch,
  oauthClientConfigs,
  saasProject,
}: RuntimeCatalogRoutesOptions): Hono {
  const app = new Hono();

  const serializeSearchResults = async (results: ActionSearchDocument[]): Promise<RuntimeActionSearchResult[]> => {
    const authenticated = new Set(
      await connections.listAuthenticatedServices([...new Set(results.map((result) => result.service))]),
    );
    return results.flatMap((result) => {
      const action = catalog.actionsById.get(result.id);
      if (!action) {
        return [];
      }
      return [serializeActionSearchResult(result, action, authenticated.has(action.service))];
    });
  };

  app.get("/providers/:service/setup", async (context) => {
    const service = context.req.param("service");
    const provider = catalog.providers.find((p) => p.service === service);
    if (!provider) return writeRuntimeFailure(context, unknownServiceFailure(service));
    let oauth = provider.auth.some((auth) => auth.type === "oauth2")
      ? await oauthClientConfigs.getSummary(service)
      : undefined;
    const source = oauth ? await saasProject?.getSource(service) : undefined;
    if (oauth && source?.mode === "saas") {
      const { config } = await saasProject!.resolveConfig(
        service,
        source.providerConfigId,
        source.managedProjectId,
        context.req.raw.signal,
      );
      oauth = {
        ...oauth,
        configured: true,
        customClientAvailable: false,
        expectedRedirectUri: config.callbackUrl,
        missingFields: [],
      };
    }
    return writeRuntimeSuccess(context, serializeRuntimeProviderSetup(provider, oauth));
  });

  app.get("/providers", (context) => {
    const services = context.req.queries("service") ?? [];
    const query = optionalString(context.req.query("q"))?.toLowerCase();
    const providers = catalog.providers.filter((provider) => {
      if (services.length > 0 && !services.includes(provider.service)) {
        return false;
      }
      if (!query) {
        return true;
      }

      return [
        provider.service,
        provider.displayName,
        provider.categories.join(" "),
        provider.scenario,
        provider.authTypes.join(" "),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });

    return writeRuntimeSuccess(context, providers.map(serializeRuntimeProvider));
  });

  app.get("/actions", (context) => {
    const service = optionalString(context.req.query("service"));
    if (!service) {
      const services = [...new Set(catalog.actions.map((action) => action.service))];
      return writeRuntimeSuccess(context, services.map(serializeRuntimeActionService));
    }

    const actions = catalog.actions.filter((action) => action.service === service);
    return writeRuntimeSuccess(context, actions.map(serializeRuntimeAction));
  });

  app.get("/actions/search", async (context) => {
    const query = readSearchQuery(context, 10);
    if (!query.ok) {
      return writeRuntimeFailure(context, {
        status: 400,
        errorCode: "invalid_input",
        message: query.message,
      });
    }

    const index = await actionSearch.get();
    const results = searchActions(index, query.q, {
      service: query.service,
      limit: query.limit,
    });
    return writeRuntimeSuccess(context, await serializeSearchResults(results));
  });

  app.get("/actions/:actionId", (context) => {
    const actionId = context.req.param("actionId");
    const action = catalog.actionsById.get(actionId);
    if (!action) {
      return writeRuntimeFailure(context, unknownActionFailure(actionId));
    }

    return writeRuntimeSuccess(context, serializeRuntimeAction(action));
  });

  return app;
}
