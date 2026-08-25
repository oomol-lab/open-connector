import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import { arrayPayload, firstString, objectPayload, requestJson } from "../http-json-runtime.ts";
import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";

const service = "recruitcrm";
const apiBaseUrl = "https://api.recruitcrm.io/v1";

type Handler = ProviderRuntimeHandler<ApiKeyProviderContext>;

interface ListSpec {
  collectionKey: string;
  path: string;
}

interface GetSpec extends ListSpec {
  inputKey: string;
}

const lists = {
  candidates: { collectionKey: "candidates", path: "/candidates" },
  contacts: { collectionKey: "contacts", path: "/contacts" },
  companies: { collectionKey: "companies", path: "/companies" },
  jobs: { collectionKey: "jobs", path: "/jobs" },
};

const gets = {
  candidate: { ...lists.candidates, inputKey: "candidate" },
  contact: { ...lists.contacts, inputKey: "contact" },
  company: { ...lists.companies, inputKey: "company" },
  job: { ...lists.jobs, inputKey: "job" },
};

export const recruitcrmActionHandlers: ProviderActionHandlers<"recruitcrm", Handler> = {
  list_candidates(input, context) {
    return listRecruitcrm(lists.candidates, input, context);
  },
  get_candidate(input, context) {
    return getRecruitcrm(gets.candidate, input, context);
  },
  list_contacts(input, context) {
    return listRecruitcrm(lists.contacts, input, context);
  },
  get_contact(input, context) {
    return getRecruitcrm(gets.contact, input, context);
  },
  list_companies(input, context) {
    return listRecruitcrm(lists.companies, input, context);
  },
  get_company(input, context) {
    return getRecruitcrm(gets.company, input, context);
  },
  list_jobs(input, context) {
    return listRecruitcrm(lists.jobs, input, context);
  },
  get_job(input, context) {
    return getRecruitcrm(gets.job, input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, recruitcrmActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = objectPayload(
      await recruitcrmRequest("/candidates", { apiKey: input.apiKey, fetcher, signal }, "validate", {
        limit: 1,
      }),
      "Recruit CRM candidates",
    );
    const candidates = arrayPayload(payload.candidates ?? payload.data, "candidates");
    const firstCandidate = optionalRecord(candidates[0]);
    return {
      profile: {
        accountId: optionalString(firstCandidate?.slug) ?? optionalString(firstCandidate?.id),
        displayName: firstString(firstCandidate, ["name", "full_name", "email"]) ?? "Recruit CRM API Token",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl,
        validationEndpoint: "/candidates?limit=1",
      },
    };
  },
};

async function listRecruitcrm(
  spec: ListSpec,
  input: Record<string, unknown>,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<Record<string, unknown>> {
  const raw = objectPayload(
    await recruitcrmRequest(spec.path, context, "execute", {
      page: optionalInteger(input.page),
      limit: optionalInteger(input.limit),
    }),
    spec.collectionKey,
  );
  return {
    [spec.collectionKey]: arrayPayload(raw[spec.collectionKey] ?? raw.data, spec.collectionKey),
    pagination: optionalRecord(raw.pagination) ?? {},
    raw,
  };
}

async function getRecruitcrm(
  spec: GetSpec,
  input: Record<string, unknown>,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<Record<string, unknown>> {
  const id = encodePathSegment(requiredString(input[spec.inputKey], spec.inputKey));
  const raw = objectPayload(await recruitcrmRequest(`${spec.path}/${id}`, context), spec.inputKey);
  return {
    [spec.inputKey]: objectPayload(raw[spec.inputKey] ?? raw.data, spec.inputKey),
    raw,
  };
}

function recruitcrmRequest(
  path: string,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: "validate" | "execute" = "execute",
  query: Record<string, number | undefined> = {},
): Promise<unknown> {
  return requestJson({
    providerName: "Recruit CRM",
    baseUrl: apiBaseUrl,
    path,
    fetcher: context.fetcher,
    signal: context.signal,
    query,
    phase,
    headers: {
      authorization: `Bearer ${context.apiKey}`,
    },
  });
}
