import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import { looseArray, compactObject, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const service = "opensea";
const openseaApiBaseUrl = "https://api.opensea.io";

type OpenseaRequestPhase = "validate" | "execute";
type OpenseaActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const openseaActionHandlers: ProviderActionHandlers<"opensea", OpenseaActionHandler> = {
  async search(input, context) {
    const payload = await requestOpensea({
      path: "/api/v2/search",
      query: compactObject({
        query: readRequiredString(input.query, "query"),
        chains: readOptionalStringArray(input.chains),
        asset_types: readOptionalStringArray(input.assetTypes),
        limit: optionalNumber(input.limit),
      }),
      context,
      phase: "execute",
    });
    const record = readObject(payload);

    return {
      results: looseArray(record.results),
      raw: record,
    };
  },
  async get_collection(input, context) {
    const slug = readRequiredString(input.slug, "slug");
    const payload = await requestOpensea({
      path: `/api/v2/collections/${encodeURIComponent(slug)}`,
      context,
      phase: "execute",
    });

    return {
      collection: normalizeCollection(payload),
    };
  },
  async get_collection_stats(input, context) {
    const slug = readRequiredString(input.slug, "slug");
    const payload = await requestOpensea({
      path: `/api/v2/collections/${encodeURIComponent(slug)}/stats`,
      context,
      phase: "execute",
    });

    return {
      stats: payload,
    };
  },
  async list_collection_nfts(input, context) {
    const slug = readRequiredString(input.slug, "slug");
    const payload = await requestOpensea({
      path: `/api/v2/collection/${encodeURIComponent(slug)}/nfts`,
      query: compactObject({
        traits: input.traits === undefined ? undefined : JSON.stringify(input.traits),
        has_agent_binding: input.hasAgentBinding,
        limit: optionalNumber(input.limit),
        "next.value": optionalString(input.next),
      }),
      context,
      phase: "execute",
    });
    const record = readObject(payload);

    return {
      nfts: looseArray(record.nfts).map(normalizeNft),
      pagination: normalizePagination(record),
      raw: record,
    };
  },
  async list_collection_traits(input, context) {
    const slug = readRequiredString(input.slug, "slug");
    const payload = await requestOpensea({
      path: `/api/v2/traits/${encodeURIComponent(slug)}`,
      context,
      phase: "execute",
    });

    return {
      traits: payload,
    };
  },
  async list_collection_offers(input, context) {
    const slug = readRequiredString(input.slug, "slug");
    const payload = await requestOpensea({
      path: `/api/v2/offers/collection/${encodeURIComponent(slug)}`,
      query: compactObject({
        limit: optionalNumber(input.limit),
        "next.value": optionalString(input.next),
      }),
      context,
      phase: "execute",
    });
    const record = readObject(payload);

    return {
      offers: looseArray(record.offers).map(normalizeOrder),
      pagination: normalizePagination(record),
      raw: record,
    };
  },
  async get_best_nft_listing(input, context) {
    const slug = readRequiredString(input.slug, "slug");
    const identifier = readRequiredString(input.identifier, "identifier");
    const payload = await requestOpensea({
      path: `/api/v2/listings/collection/${encodeURIComponent(slug)}/nfts/${encodeURIComponent(identifier)}/best`,
      query: compactObject({
        include_private_listings: input.includePrivateListings,
      }),
      context,
      phase: "execute",
    });

    return {
      listing: normalizeOrder(payload),
    };
  },
  async get_best_nft_offer(input, context) {
    const slug = readRequiredString(input.slug, "slug");
    const identifier = readRequiredString(input.identifier, "identifier");
    const payload = await requestOpensea({
      path: `/api/v2/offers/collection/${encodeURIComponent(slug)}/nfts/${encodeURIComponent(identifier)}/best`,
      context,
      phase: "execute",
    });

    return {
      offer: normalizeOrder(payload),
    };
  },
  async get_nft(input, context) {
    const chain = readRequiredString(input.chain, "chain");
    const address = readRequiredString(input.address, "address");
    const identifier = readRequiredString(input.identifier, "identifier");
    const payload = await requestOpensea({
      path: `/api/v2/chain/${encodeURIComponent(chain)}/contract/${encodeURIComponent(address)}/nfts/${encodeURIComponent(identifier)}`,
      context,
      phase: "execute",
    });
    const record = readObject(payload);

    return {
      nft: normalizeNft(record.nft ?? record),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, openseaActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestOpensea({
      path: "/api/v2/collections",
      query: { limit: 1 },
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      phase: "validate",
    });
    const record = readObject(payload);
    const firstCollection = optionalRecord(looseArray(record.collections)[0]);

    return {
      profile: {
        accountId: createHash("sha256").update(input.apiKey).digest("hex").slice(0, 16),
        displayName: "OpenSea API Key",
        grantedScopes: [],
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: openseaApiBaseUrl,
        validationEndpoint: "/api/v2/collections",
        firstCollectionSlug: optionalString(firstCollection?.slug),
        firstCollectionName: optionalString(firstCollection?.name),
      }),
    };
  },
};

async function requestOpensea(input: {
  path: string;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: OpenseaRequestPhase;
  query?: Record<string, unknown>;
}): Promise<unknown> {
  const url = new URL(input.path, openseaApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, String(item));
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await input.context.fetcher(url, {
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "x-api-key": input.context.apiKey,
      },
      signal: input.context.signal,
    });
    payload = await readOpenseaPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `OpenSea request failed: ${error.message}` : "OpenSea request failed",
    );
  }

  if (!response.ok) {
    throw createOpenseaError(response.status, payload, input.phase);
  }

  return payload;
}

function createOpenseaError(status: number, payload: unknown, phase: OpenseaRequestPhase): ProviderRequestError {
  const message = extractOpenseaErrorMessage(payload) ?? "OpenSea request failed";

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if ((status === 401 || status === 403) && phase === "validate") {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(status, message, payload);
  }
  if (status === 400 || status === 404) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status || 502, message, payload);
}

async function readOpenseaPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function extractOpenseaErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const directMessage = optionalString(record.message) ?? optionalString(record.detail);
  if (directMessage) {
    return directMessage;
  }

  const errors = Array.isArray(record.errors) ? record.errors : null;
  const errorMessages = errors?.filter((item): item is string => typeof item === "string");
  if (errorMessages?.length) {
    return errorMessages.join("; ");
  }

  const error = record.error;
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }
  const errorRecord = optionalRecord(error);
  return optionalString(errorRecord?.message);
}

function normalizeCollection(payload: unknown): Record<string, unknown> {
  const record = readObject(payload);
  return {
    slug: nullableString(record.collection) ?? nullableString(record.slug),
    name: nullableString(record.name),
    description: nullableString(record.description),
    imageUrl: nullableString(record.image_url),
    bannerImageUrl: nullableString(record.banner_image_url),
    owner: nullableString(record.owner),
    raw: record,
  };
}

function normalizeNft(payload: unknown): Record<string, unknown> {
  const record = readObject(payload);
  const contract = optionalRecord(record.contract);
  return {
    identifier: nullableString(record.identifier),
    name: nullableString(record.name),
    description: nullableString(record.description),
    imageUrl: nullableString(record.image_url),
    collection: nullableString(record.collection),
    contract: nullableString(contract?.address) ?? nullableString(record.contract),
    chain: nullableString(record.chain),
    raw: record,
  };
}

function normalizeOrder(payload: unknown): Record<string, unknown> {
  const record = readObject(payload);
  const price = optionalRecord(record.price) ?? optionalRecord(record.current_price);
  const maker = optionalRecord(record.maker);
  const taker = optionalRecord(record.taker);
  const paymentToken = optionalRecord(price?.currency) ?? optionalRecord(record.payment_token);
  return {
    orderHash: nullableString(record.order_hash),
    type: nullableString(record.type) ?? nullableString(record.order_type),
    price: nullableString(price?.value) ?? nullableString(record.price),
    currency: nullableString(paymentToken?.symbol) ?? nullableString(record.currency),
    maker: nullableString(maker?.address) ?? nullableString(record.maker),
    taker: nullableString(taker?.address) ?? nullableString(record.taker),
    raw: record,
  };
}

function normalizePagination(record: Record<string, unknown>): Record<string, string | null> {
  return {
    next: nullableString(record.next),
    previous: nullableString(record.previous),
  };
}

function readObject(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "OpenSea returned a non-object response");
  }

  return record;
}

function readRequiredString(value: unknown, fieldName: string): string {
  const result = optionalString(value);
  if (!result) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }

  return result;
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
  return items.length ? items : undefined;
}

function nullableString(value: unknown): string | null {
  return optionalString(value) ?? null;
}
