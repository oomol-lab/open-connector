import type { TransitFileWriter } from "../../core/types.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";

export interface ShopifyContext {
  accessToken: string;
  shopDomain: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  transitFiles?: TransitFileWriter;
}

export type ShopifyActionHandler = ProviderRuntimeHandler<ShopifyContext>;
