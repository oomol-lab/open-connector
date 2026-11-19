import type { CloudflareRequestInput, CloudflareEnvelope } from "./client.ts";
import type { CloudflareContext } from "./context.ts";

import { optionalInteger } from "../../../core/cast.ts";
import { ProviderRequestError, requiredInputString, runProviderRequest } from "../../provider-runtime.ts";
import { cloudflareRequestEnvelope } from "./client.ts";

export class CloudflareClient {
  readonly input: Record<string, unknown>;
  readonly apiToken: string;
  readonly fetcher: typeof fetch;
  readonly signal?: AbortSignal;
  constructor(input: Record<string, unknown>, apiToken: string, fetcher: typeof fetch, signal?: AbortSignal) {
    this.input = input;
    this.apiToken = apiToken;
    this.fetcher = fetcher;
    this.signal = signal;
  }

  id(field: string): string {
    const value = requiredInputString(this.input[field], field);
    if (value === "." || value === "..") throw new ProviderRequestError(400, `${field} cannot be . or ..`);
    return encodeURIComponent(value);
  }

  accountPath(): string {
    return `/accounts/${this.id("accountId")}`;
  }

  zonePath(): string {
    return `/zones/${this.id("zoneId")}`;
  }

  paginationQuery(): Record<string, number | undefined> {
    return {
      page: optionalInteger(this.input.page),
      per_page: optionalInteger(this.input.perPage),
    };
  }

  request(request: CloudflareRequestInput): Promise<CloudflareEnvelope> {
    return cloudflareRequestEnvelope(this.apiToken, request, this.fetcher, "execute");
  }

  async resource(request: CloudflareRequestInput): Promise<{ result: unknown }> {
    const envelope = await this.request(request);
    return { result: envelope.result ?? {} };
  }

  async list(request: CloudflareRequestInput): Promise<{ items: unknown; resultInfo: unknown }> {
    const envelope = await this.request(request);
    return { items: envelope.result, resultInfo: envelope.result_info ?? {} };
  }
}

export function withCloudflareClient(
  handler: (client: CloudflareClient) => Promise<unknown>,
  timeoutMs?: number,
): (input: Record<string, unknown>, context: CloudflareContext) => Promise<unknown> {
  return (input: Record<string, unknown>, context: CloudflareContext) =>
    runProviderRequest({ label: "Cloudflare", timeoutMs, signal: context.signal }, (signal) => {
      const requestFetch = ((url, init) =>
        context.fetcher(url, {
          ...init,
          signal: init?.signal && signal ? AbortSignal.any([signal, init.signal]) : (init?.signal ?? signal),
        })) as typeof fetch;
      return handler(new CloudflareClient(input, context.accessToken, requestFetch, signal));
    });
}
