import type { TransitFileWriter } from "../../../core/types.ts";
import type { ProviderRuntimeHandler } from "../../provider-executors.ts";

import { optionalString } from "../../../core/cast.ts";
import { providerInputError, ProviderRequestError } from "../../provider-runtime.ts";
import { requestCloudflareAccounts } from "./accounts.ts";

export interface CloudflareContext {
  authType: "api_key" | "oauth2";
  accessToken: string;
  accountId?: string;
  metadata: Record<string, unknown>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  transitFiles?: TransitFileWriter;
}

export function resolveAccountId(input: Record<string, unknown>, context: CloudflareContext): string {
  const accountId = optionalString(input.accountId) ?? context.accountId;
  if (!accountId) throw providerInputError("Specify accountId for this action");
  return accountId;
}

export async function resolveActionAccount(
  input: Record<string, unknown>,
  context: CloudflareContext,
): Promise<Record<string, unknown>> {
  const explicit = optionalString(input.accountId) ?? context.accountId;
  if (explicit) return { ...input, accountId: explicit };
  const result = await requestCloudflareAccounts(context.accessToken, context.fetcher, context.signal, {
    page: 1,
    perPage: 5,
  });
  // Only complete pagination metadata can prove uniqueness; a short page alone cannot.
  if (result.accounts.length !== 1 || result.resultInfo?.totalCount !== 1)
    throw new ProviderRequestError(
      400,
      "Specify accountId; the response does not prove exactly one accessible account",
    );
  return { ...input, accountId: result.accounts[0]!.id };
}

export function withAccount(
  handler: ProviderRuntimeHandler<CloudflareContext>,
): ProviderRuntimeHandler<CloudflareContext> {
  return async (input, context) => handler(await resolveActionAccount(input, context), context);
}

export function withAccountHandlers(
  handlers: Record<string, ProviderRuntimeHandler<CloudflareContext>>,
): Record<string, ProviderRuntimeHandler<CloudflareContext>> {
  return Object.fromEntries(Object.entries(handlers).map(([name, handler]) => [name, withAccount(handler)]));
}
