import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalString, requiredString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import { arrayPayload, objectPayload, requestJson } from "../http-json-runtime.ts";
import { defineProviderExecutors, ProviderRequestError, requireApiKeyCredential } from "../provider-runtime.ts";

const service = "recruitee";
const apiBaseUrl = "https://api.recruitee.com";

interface RecruiteeContext {
  apiKey: string;
  companyId: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

type Handler = ProviderRuntimeHandler<RecruiteeContext>;

export const recruiteeActionHandlers: ProviderActionHandlers<"recruitee", Handler> = {
  async list_offers(_input, context) {
    const raw = objectPayload(await recruiteeRequest("/offers", context), "offers");
    return { offers: arrayPayload(raw.offers, "offers"), raw };
  },
  async get_offer(input, context) {
    const raw = objectPayload(
      await recruiteeRequest(`/offers/${encodePathSegment(requiredString(input.offerId, "offerId"))}`, context),
      "offer",
    );
    return { offer: objectPayload(raw.offer, "offer"), raw };
  },
  async search_candidates(input, context) {
    const query = compactObject({
      limit: optionalInteger(input.limit),
      page: optionalInteger(input.page),
      sort_by: optionalString(input.sortBy),
      filters_json: Array.isArray(input.filters) ? JSON.stringify(input.filters) : undefined,
    });
    const raw = objectPayload(await recruiteeRequest("/search/new/candidates", context, { query }), "candidates");
    return {
      candidates: arrayPayload(raw.hits, "hits"),
      total: optionalInteger(raw.total) ?? 0,
      aggregations: raw.aggregations ?? null,
      raw,
    };
  },
  async create_candidate(input, context) {
    const raw = objectPayload(
      await recruiteeRequest("/candidates", context, {
        method: "POST",
        body: compactObject({
          candidate: compactObject({
            name: requiredString(input.name, "name"),
            emails: input.emails,
            phones: input.phones,
            social_links: input.socialLinks,
            links: input.links,
            cover_letter: optionalString(input.coverLetter),
            sources: input.sources,
            remote_cv_url: optionalString(input.remoteCvUrl),
          }),
          offers: input.offers,
          offer_id: input.offerId,
        }),
      }),
      "candidate",
    );
    return {
      candidate: objectPayload(raw.candidate, "candidate"),
      references: Array.isArray(raw.references) ? raw.references : [],
      raw,
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<RecruiteeContext>({
  service,
  handlers: recruiteeActionHandlers,
  async createContext(context, fetcher) {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      companyId: requiredString(
        credential.values.companyId,
        "companyId",
        (message) => new ProviderRequestError(400, message),
      ),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const companyId = requiredString(
      input.values.companyId,
      "companyId",
      (message) => new ProviderRequestError(400, message),
    );
    await recruiteeRequest("/offers", { apiKey: input.apiKey, companyId, fetcher, signal }, "validate");
    return {
      profile: {
        accountId: companyId,
        displayName: `Recruitee ${companyId}`,
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl,
        companyId,
        validationEndpoint: companyPath(companyId, "/offers"),
      },
    };
  },
};

function recruiteeRequest(
  path: string,
  context: RecruiteeContext,
  options:
    | "validate"
    | {
        method?: string;
        query?: Record<string, string | number | undefined>;
        body?: unknown;
      } = {},
): Promise<unknown> {
  const phase = options === "validate" ? "validate" : "execute";
  const requestOptions = typeof options === "object" ? options : {};
  return requestJson({
    providerName: "Recruitee",
    baseUrl: apiBaseUrl,
    path: companyPath(context.companyId, path),
    fetcher: context.fetcher,
    signal: context.signal,
    method: requestOptions.method,
    query: requestOptions.query,
    body: requestOptions.body,
    phase,
    headers: {
      authorization: `Bearer ${context.apiKey}`,
    },
  });
}

function companyPath(companyId: string, path: string): string {
  return `/c/${encodePathSegment(companyId)}${path.startsWith("/") ? path : `/${path}`}`;
}
