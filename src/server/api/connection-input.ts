import type { OAuthConnectionRequestInput } from "../../oauth/oauth-flow-service.ts";

import { z } from "zod";

export const oauthConnectionInput: z.ZodType<
  Omit<OAuthConnectionRequestInput, "owner" | "service" | "target" | "signal" | "connectionName">
> = z.strictObject({
  returnUri: z.string().optional(),
  authorizationOptionIds: z.array(z.string().trim().min(1)).optional(),
  extra: z.record(z.string(), z.unknown()).optional(),
  secretExtra: z.record(z.string(), z.string().trim().min(1)).optional(),
});

export const consoleOAuthConnectionInput: z.ZodType<{
  service: string;
  connectionName: string;
  appId?: string;
  authorizationOptionIds?: string[];
}> = z.strictObject({
  service: z.string().trim().min(1),
  connectionName: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/),
  appId: z.string().min(1).optional(),
  authorizationOptionIds: z.array(z.string().trim().min(1)).optional(),
});

export const apiKeyConnectionInput: z.ZodType<{
  apiKey: string;
  extra?: Record<string, string>;
  comment?: string | null;
}> = z
  .object({
    apiKey: z.string(),
    extra: z.record(z.string(), z.string()).optional(),
    comment: z.string().nullable().optional(),
  })
  .strict();

export const customConnectionInput: z.ZodType<{ values: Record<string, string>; comment?: string | null }> = z
  .object({
    values: z.record(z.string(), z.string()),
    comment: z.string().nullable().optional(),
  })
  .strict();

export const connectionStatusInput: z.ZodType<"active" | "reauth_required" | "error" | "disconnected" | undefined> = z
  .enum(["active", "reauth_required", "error", "disconnected"])
  .optional();
