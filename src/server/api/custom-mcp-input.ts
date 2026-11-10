import type { CustomMcpRegistration } from "../../custom-mcp/definition.ts";

import { z } from "zod";

interface UpdateCustomMcpInput {
  displayName: string;
  enabled: boolean;
}
interface SyncCustomMcpInput {
  connectionId?: string;
}

const header = z.object({
  name: z
    .string()
    .regex(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/)
    .max(128),
  prefix: z.string().max(128).default(""),
});
const client = z.object({ clientId: z.string().trim().min(1), clientSecret: z.string().optional() });
const manualOAuth = z.object({
  authorizationUrl: z.string().url(),
  tokenUrl: z.string().url(),
  issuer: z.string().url(),
  scopes: z.array(z.string()).default([]),
  tokenEndpointAuthMethod: z.enum(["none", "client_secret_post", "client_secret_basic"]).default("none"),
});
export const customMcpCreateInput: z.ZodType<CustomMcpRegistration> = z.object({
  service: z.string().trim().min(1).max(100).optional(),
  displayName: z.string().trim().min(1).max(100),
  endpoint: z.string().url().max(2048),
  transport: z.enum(["streamable_http", "sse"]).default("streamable_http"),
  auth: z.discriminatedUnion("type", [
    z.object({ type: z.literal("none") }),
    z.object({ type: z.literal("headers"), headers: z.array(header).min(1).max(20) }),
    z.object({ type: z.literal("oauth2"), client: client.optional(), manual: manualOAuth.optional() }),
  ]),
});
export const customMcpUpdateInput: z.ZodType<UpdateCustomMcpInput> = z.object({
  displayName: z.string().trim().min(1).max(100),
  enabled: z.boolean(),
});
export const customMcpSyncInput: z.ZodType<SyncCustomMcpInput> = z.object({ connectionId: z.string().optional() });
