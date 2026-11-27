import type { OAuthConnectionRequestInput } from "../../oauth/oauth-flow-service.ts";

import { z } from "zod";
import { isScope, scopeMessage } from "../../core/scope.ts";

const scopeInput = z.string().refine(isScope, { message: scopeMessage });

export const oauthConnectionInput: z.ZodType<
  Omit<OAuthConnectionRequestInput, "owner" | "service" | "target" | "signal" | "connectionName">
> = z.strictObject({
  scope: scopeInput.optional(),
  returnUri: z.string().optional(),
  authorizationOptionIds: z.array(z.string()).optional(),
  extra: z.record(z.string(), z.unknown()).optional(),
  secretExtra: z.record(z.string(), z.string().trim().min(1)).optional(),
});

export const consoleOAuthConnectionInput: z.ZodType<{
  service: string;
  connectionName: string;
  scope?: string;
  appId?: string;
  authorizationOptionIds?: string[];
  returnUri?: string;
}> = z.strictObject({
  service: z.string().trim().min(1),
  connectionName: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/),
  scope: scopeInput.optional(),
  appId: z.string().min(1).optional(),
  authorizationOptionIds: z.array(z.string()).optional(),
  returnUri: z.string().optional(),
});

export const apiKeyConnectionInput: z.ZodType<{
  apiKey: string;
  extra?: Record<string, string>;
  comment?: string | null;
  scope?: string;
}> = z
  .object({
    scope: scopeInput.optional(),
    apiKey: z.string(),
    extra: z.record(z.string(), z.string()).optional(),
    comment: z.string().nullable().optional(),
  })
  .strict();

export const customConnectionInput: z.ZodType<{
  values: Record<string, string>;
  comment?: string | null;
  scope?: string;
}> = z
  .object({
    scope: scopeInput.optional(),
    values: z.record(z.string(), z.string()),
    comment: z.string().nullable().optional(),
  })
  .strict();

export const connectionStatusInput: z.ZodType<"active" | "reauth_required" | "error" | "disconnected" | undefined> = z
  .enum(["active", "reauth_required", "error", "disconnected"])
  .optional();
