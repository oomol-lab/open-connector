import type { ActionPolicySnapshot } from "../../core/action-policy.ts";
import type { RuntimeLogger } from "../../core/types.ts";
import type { RuntimeDatabase } from "../storage/runtime-database.ts";
import type { IRuntimePolicyStore } from "../storage/runtime-policy-store.ts";
import type { Context } from "hono";

import { Hono } from "hono";
import { optionalString } from "../../core/cast.ts";
import { DEFAULT_TENANT_ID } from "../../tenant/tenant-id.ts";
import { RuntimeTokenService, summarizeRuntimeToken } from "../storage/runtime-token-service.ts";
import { readTenantId } from "./auth.ts";
import { jsonError, readJsonBody } from "./http-utils.ts";
import { policyRequestMaxBytes, readRuntimePolicyRules, readTokenPolicy } from "./policy-input.ts";

export interface PolicyRoutesOptions {
  /** Local-tenant token service; other tenants resolve through `runtimeDatabase.forTenant`. */
  runtimeTokens: RuntimeTokenService;
  runtimeDatabase: RuntimeDatabase;
  logger?: RuntimeLogger;
  runtimePolicyStore: IRuntimePolicyStore;
  deploymentPolicyRules: unknown;
  getPolicySnapshot: (context: Context) => Promise<ActionPolicySnapshot>;
}

/** Runtime token management and runtime policy administration routes. */
export function createPolicyRoutes({
  runtimeTokens,
  runtimeDatabase,
  logger,
  runtimePolicyStore,
  deploymentPolicyRules,
  getPolicySnapshot,
}: PolicyRoutesOptions): Hono {
  const app = new Hono();

  const tokensFor = (context: Context): RuntimeTokenService => {
    const tenantId = readTenantId(context);
    return tenantId === DEFAULT_TENANT_ID
      ? runtimeTokens
      : new RuntimeTokenService(runtimeDatabase.forTenant(tenantId).runtimeTokenStore, logger, tenantId);
  };

  app.get("/runtime-tokens", async (context) => context.json(await tokensFor(context).listTokens()));

  app.post("/runtime-tokens", async (context) => {
    const body = await readJsonBody(context, policyRequestMaxBytes);
    const name = optionalString(body.name);
    if (!name) {
      return jsonError(context, 400, "invalid_input", "name is required.");
    }

    const created = await tokensFor(context).createToken(name, readTokenPolicy(body, true));
    return context.json({
      token: created.token,
      record: summarizeRuntimeToken(created.record),
    });
  });

  app.put("/runtime-tokens/:id", async (context) => {
    const id = context.req.param("id");
    const body = await readJsonBody(context, policyRequestMaxBytes);
    const token = await tokensFor(context).updateTokenPolicy(id, readTokenPolicy(body));
    return token
      ? context.json(token)
      : jsonError(context, 404, "runtime_token_not_found", `Runtime token not found: ${id}.`);
  });

  app.delete("/runtime-tokens/:id", async (context) => {
    const id = context.req.param("id");
    if (!(await tokensFor(context).revokeToken(id))) {
      return jsonError(context, 404, "runtime_token_not_found", `Runtime token not found: ${id}.`);
    }

    return context.json({ id, revoked: true });
  });

  app.get("/runtime-policy", async (context) => context.json((await getPolicySnapshot(context)).state));

  app.put("/runtime-policy", async (context) => {
    const body = await readJsonBody(context, policyRequestMaxBytes);
    const rules = readRuntimePolicyRules(body);
    const updatedAt = new Date().toISOString();
    await runtimePolicyStore.set({ rules, updatedAt });
    return context.json({
      deployment: deploymentPolicyRules,
      runtime: rules,
      updatedAt,
    });
  });

  return app;
}
