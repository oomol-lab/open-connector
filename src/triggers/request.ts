import type { JsonValue } from "./common/types.ts";

import { z } from "zod";
import { HttpRequestError } from "../server/api/http-utils.ts";

const config = z.record(z.string(), z.json());
const subscriptionId = z.string().min(1).max(128);
const requestKey = z.string().min(1).max(512);
const requestSchema = z.discriminatedUnion("operation", [
  z.strictObject({ operation: z.literal("options"), config, field: z.string().min(1).max(128) }),
  z.strictObject({ operation: z.literal("read"), config, checkpoint: z.json() }),
  z.strictObject({
    operation: z.literal("reconcile"),
    config,
    subscriptionId: subscriptionId.optional(),
    requestKey,
    endpointUrl: z.url().max(4096),
    active: z.boolean(),
  }),
  z.strictObject({
    operation: z.literal("receive"),
    subscriptionId,
    method: z.enum(["GET", "POST", "HEAD", "PUT", "PATCH", "DELETE"]),
    headers: z.record(z.string(), z.string().max(8192)),
    query: z.record(z.string(), z.string().max(8192)),
    rawBody: z
      .string()
      .max(90000)
      .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
    admit: z.boolean(),
    current: z.boolean(),
  }),
  z.strictObject({ operation: z.literal("resource"), config, requestKey, active: z.boolean() }),
]);
interface ConfigRequest {
  config: Readonly<Record<string, JsonValue>>;
}
export type TriggerRequest =
  | (ConfigRequest & { operation: "options"; field: string })
  | (ConfigRequest & { operation: "read"; checkpoint: JsonValue })
  | (ConfigRequest & {
      operation: "reconcile";
      subscriptionId?: string;
      requestKey: string;
      endpointUrl: string;
      active: boolean;
    })
  | {
      operation: "receive";
      subscriptionId: string;
      method: "GET" | "POST" | "HEAD" | "PUT" | "PATCH" | "DELETE";
      headers: Record<string, string>;
      query: Record<string, string>;
      rawBody: string;
      admit: boolean;
      current: boolean;
    }
  | (ConfigRequest & { operation: "resource"; requestKey: string; active: boolean });

export function readTriggerRequest(value: unknown): TriggerRequest {
  const result = requestSchema.safeParse(value);
  if (!result.success) throw new HttpRequestError("invalid_input", "Invalid Trigger operation input.");
  if (result.data.operation === "read" && Buffer.byteLength(JSON.stringify(result.data.checkpoint)) > 65536)
    throw new HttpRequestError("invalid_input", "Trigger checkpoint exceeds 64 KiB.");
  if (result.data.operation === "receive") {
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(result.data.headers)) {
      const name = key.toLowerCase();
      if (name in headers) throw new HttpRequestError("invalid_input", "Duplicate webhook header.");
      headers[name] = value;
    }
    result.data.headers = headers;
  }
  return result.data;
}

export function triggerOperationSchema(): Record<string, unknown> {
  return z.toJSONSchema(requestSchema);
}
