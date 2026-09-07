import type { IConnectionStore } from "../../connection-service.ts";
import type { IMarketplaceStore } from "../../marketplace/marketplace-service.ts";
import type { IOAuthClientConfigStore } from "../../oauth/oauth-client-config-service.ts";
import type { IOAuthStateStore } from "../../oauth/oauth-flow-service.ts";
import type { ConnectionRequestStore } from "./connection-request-store.ts";
import type { IIdempotencyStore } from "./idempotency-store.ts";
import type { IRuntimePolicyStore } from "./runtime-policy-store.ts";
import type { IRunLogStore } from "./runtime-store.ts";
import type { IRuntimeTokenStore } from "./runtime-token-service.ts";

export interface RuntimeDatabase {
  connectionRequestStore: ConnectionRequestStore;
  connectionStore: IConnectionStore;
  oauthClientConfigStore: IOAuthClientConfigStore;
  oauthStateStore: IOAuthStateStore;
  runtimeTokenStore: IRuntimeTokenStore;
  runtimePolicyStore: IRuntimePolicyStore;
  runLogStore: IRunLogStore;
  idempotencyStore: IIdempotencyStore;
  marketplaceStore: IMarketplaceStore;
}
