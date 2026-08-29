import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";

import { isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { createProviderFetch, defineProviderExecutors, requireApiKeyCredential } from "../provider-runtime.ts";
import { invoiceNinjaActionHandlers, normalizeInvoiceNinjaUrls, validateInvoiceNinjaCredential } from "./runtime.ts";

interface InvoiceNinjaContext {
  apiKey: string;
  apiBaseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

const handlers: Record<string, (input: Record<string, unknown>, context: InvoiceNinjaContext) => Promise<unknown>> =
  Object.fromEntries(
    Object.entries(invoiceNinjaActionHandlers).map(([name, handler]) => [
      name,
      (input: Record<string, unknown>, context: InvoiceNinjaContext) =>
        handler(
          {
            apiKey: context.apiKey,
            providerMetadata: { apiBaseUrl: context.apiBaseUrl },
            input,
            signal: context.signal,
          },
          context.fetcher,
        ),
    ]),
  );

export const executors: ProviderExecutors = defineProviderExecutors({
  service: "invoice_ninja",
  handlers,
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, "invoice_ninja");
    const urls = normalizeInvoiceNinjaUrls(credential.values.instanceUrl);
    return { apiKey: credential.apiKey, apiBaseUrl: urls.apiBaseUrl, fetcher, signal: context.signal };
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    const guardedFetcher = createProviderFetch({ fetch: fetcher, allowPrivateNetwork: isPrivateNetworkAccessAllowed });
    return validateInvoiceNinjaCredential({ apiKey: input.apiKey, ...input.values }, guardedFetcher, signal);
  },
};
