import type { ConnectionService } from "../connection-service.ts";
import type { CustomMcpCatalog } from "../custom-mcp/catalog.ts";
import type { CustomMcpService } from "../custom-mcp/service.ts";
import type { MarketplaceService } from "../marketplace/marketplace-service.ts";
import type { OAuthClientConfigService } from "../oauth/oauth-client-config-service.ts";
import type { OAuthFlowService } from "../oauth/oauth-flow-service.ts";
import type { IProviderLoader } from "../providers/provider-loader.ts";
import type { SaasExecutionService } from "../saas/saas-execution-service.ts";
import type { SaasOAuthService } from "../saas/saas-oauth-service.ts";
import type { SaasProjectService } from "../saas/saas-project-service.ts";
import type { TriggerMaintenance } from "../triggers/maintenance.ts";
import type { TriggerRunner } from "../triggers/trigger-runner.ts";
import type { ActionRunner } from "./actions/action-runner.ts";
import type { IIdempotencyStore } from "./storage/idempotency-store.ts";

/**
 * The request-facing service graph built from one `RuntimeDatabase` view.
 * Every member is bound to the same tenant: `forTenant(tenantId)` produces a
 * sibling bundle whose stores all carry that tenant's scope.
 */
export interface TenantServices {
  catalog: CustomMcpCatalog;
  providerLoader: IProviderLoader;
  saasProject?: SaasProjectService;
  saasOAuth?: SaasOAuthService;
  saas?: SaasExecutionService;
  marketplace?: MarketplaceService;
  oauthClientConfigs: OAuthClientConfigService;
  customMcp?: CustomMcpService;
  connections: ConnectionService;
  actions?: ActionRunner;
  oauthFlow: OAuthFlowService;
  triggers?: TriggerRunner;
  triggerMaintenance?: TriggerMaintenance;
  idempotency?: IIdempotencyStore;
}

/** Root (`local`) service bundle plus the per-request scoped-view factory. */
export interface ScopedServices extends TenantServices {
  /** Sibling bundle bound to `tenantId`; views are built lazily and cached per tenant. */
  forTenant(tenantId: string): Promise<TenantServices>;
}
