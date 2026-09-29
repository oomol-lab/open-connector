import type { D1DatabaseBinding } from "./cloudflare-bindings.ts";

import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { readBoundedResponseBytes } from "../../core/request.ts";
import { D1RuntimeDatabase } from "../storage/d1/runtime-store.ts";

interface MaintenanceEnv {
  DB: D1DatabaseBinding;
  TARGET_DATABASE_ID: string;
  MAINTENANCE_TOKEN?: string;
}

const resetInput = z.strictObject({ databaseId: z.uuid(), expectedInstanceId: z.uuid(), newInstanceId: z.uuid() });

/** Deployed only by the offline D1 maintenance script, with a dedicated temporary bearer secret. */
export default {
  async fetch(request: Request, env: MaintenanceEnv): Promise<Response> {
    const reply = (data: unknown, status = 200): Response =>
      Response.json(data, {
        status,
        headers: { "cache-control": "private, no-store" },
      });
    const provided = Buffer.from(request.headers.get("authorization") ?? "");
    const expected = Buffer.from(`Bearer ${env.MAINTENANCE_TOKEN ?? ""}`);
    if (!env.MAINTENANCE_TOKEN || provided.length !== expected.length || !timingSafeEqual(provided, expected))
      return reply({ error: "unauthorized" }, 401);
    const url = new URL(request.url);
    const store = new D1RuntimeDatabase(env.DB).saasProjectStore;
    if (request.method === "GET" && url.pathname === "/inspect") {
      if (url.searchParams.get("databaseId") !== env.TARGET_DATABASE_ID) return reply({ error: "wrong_database" }, 409);
      return reply({ databaseId: env.TARGET_DATABASE_ID, ...(await store.inspectInstance()) });
    }
    if (request.method !== "POST" || url.pathname !== "/reset-instance") return reply({ error: "not_found" }, 404);
    let input: z.infer<typeof resetInput>;
    try {
      if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
        throw new Error();
      const bytes = await readBoundedResponseBytes(new Response(request.body), {
        maxBytes: 1024,
        fieldName: "maintenance request",
        signal: request.signal,
        createError: () => new Error(),
      });
      input = resetInput.parse(JSON.parse(new TextDecoder().decode(bytes)));
      if (input.expectedInstanceId === input.newInstanceId) throw new Error();
    } catch {
      return reply({ error: "invalid_input" }, 400);
    }
    if (input.databaseId !== env.TARGET_DATABASE_ID) return reply({ error: "wrong_database" }, 409);
    try {
      const result = await store.resetInstance(input);
      return result === "conflict"
        ? reply({ error: "instance_conflict" }, 409)
        : reply({ databaseId: env.TARGET_DATABASE_ID, instanceId: input.newInstanceId, result });
    } catch {
      return reply(
        {
          error: "reset_failed",
          message: "The atomic batch failed; retry the same operation after resolving the failure.",
        },
        500,
      );
    }
  },
};
