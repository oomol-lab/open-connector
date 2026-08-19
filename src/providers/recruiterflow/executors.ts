import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { optionalBoolean, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { arrayPayload, firstString, objectPayload, requestJson } from "../http-json-runtime.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError } from "../provider-runtime.ts";

const service = "recruiterflow";
const apiBaseUrl = "https://api.recruiterflow.com";
const validationPath = "/api/external/user/list";

type Handler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const recruiterflowActionHandlers: ProviderActionHandlers<"recruiterflow", Handler> = {
  async list_jobs(input, context) {
    const raw = objectPayload(
      await recruiterflowRequest("/api/external/job/list", context, {
        items_per_page: optionalInteger(input.itemsPerPage),
        current_page: optionalInteger(input.currentPage),
        include_count: optionalBoolean(input.includeCount),
        include_notes: optionalBoolean(input.includeNotes),
        include_description: optionalBoolean(input.includeDescription),
        only_open: optionalBoolean(input.onlyOpen) === undefined ? undefined : input.onlyOpen ? 1 : 0,
      }),
      "Recruiterflow jobs",
    );
    const jobs = arrayPayload(raw.data, "data");
    return {
      jobs,
      totalItems: readTotalItems(raw),
      totalCurrentOpenings: optionalInteger(raw.total_current_openings) ?? null,
      raw,
    };
  },
  async get_job(input, context) {
    const raw = objectPayload(
      await recruiterflowRequest("/api/external/job", context, {
        job_id: requiredString(input.jobId, "jobId"),
        include_stages: optionalBoolean(input.includeStages) === undefined ? undefined : input.includeStages ? 1 : 0,
      }),
      "Recruiterflow job",
    );
    return { job: raw, raw };
  },
  async list_candidates(input, context) {
    const raw = objectPayload(
      await recruiterflowRequest("/api/external/candidate/list", context, {
        items_per_page: optionalInteger(input.itemsPerPage),
        current_page: optionalInteger(input.currentPage),
        include_files: optionalBoolean(input.includeFiles) === undefined ? undefined : input.includeFiles ? 1 : 0,
        include_notes: optionalBoolean(input.includeNotes) === undefined ? undefined : input.includeNotes ? 1 : 0,
        include_count: optionalBoolean(input.includeCount),
      }),
      "Recruiterflow candidates",
    );
    return {
      candidates: arrayPayload(raw.data, "data"),
      totalItems: readTotalItems(raw),
      rank: optionalRecord(raw.rank) ?? null,
      raw,
    };
  },
  async get_candidate(input, context) {
    const raw = objectPayload(
      await recruiterflowRequest("/api/external/candidate/get", context, {
        id: requiredString(input.candidateId, "candidateId"),
      }),
      "Recruiterflow candidate",
    );
    return { candidate: optionalRecord(raw.data) ?? raw, raw };
  },
  async list_users(input, context) {
    const raw = objectPayload(
      await recruiterflowRequest(validationPath, context, {
        include_count: optionalBoolean(input.includeCount),
      }),
      "Recruiterflow users",
    );
    return { users: arrayPayload(raw.data, "data"), totalItems: readTotalItems(raw), raw };
  },
  async get_user(input, context) {
    const userId = optionalInteger(input.userId);
    const email = optionalString(input.email);
    if (userId === undefined && !email) {
      throw new ProviderRequestError(400, "userId or email is required");
    }
    const raw = objectPayload(
      await recruiterflowRequest("/api/external/user/get", context, {
        id: userId,
        email,
      }),
      "Recruiterflow user",
    );
    return { user: raw, raw };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, recruiterflowActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const raw = objectPayload(
      await recruiterflowRequest(
        validationPath,
        { apiKey: input.apiKey, fetcher, signal },
        { include_count: true },
        "validate",
      ),
      "Recruiterflow users",
    );
    const firstUser = optionalRecord(arrayPayload(raw.data, "data")[0]);
    return {
      profile: {
        accountId: optionalString(firstUser?.email) ?? optionalString(firstUser?.id),
        displayName: firstString(firstUser, ["name", "email"]) ?? "Recruiterflow API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl,
        validationEndpoint: validationPath,
        totalItems: readTotalItems(raw),
      },
    };
  },
};

function recruiterflowRequest(
  path: string,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  query: Record<string, string | number | boolean | undefined> = {},
  phase: "validate" | "execute" = "execute",
): Promise<unknown> {
  return requestJson({
    providerName: "Recruiterflow",
    baseUrl: apiBaseUrl,
    path,
    fetcher: context.fetcher,
    signal: context.signal,
    query,
    phase,
    headers: {
      "RF-Api-Key": context.apiKey,
    },
  });
}

function readTotalItems(raw: Record<string, unknown>): number | null {
  return optionalInteger(raw.total_items) ?? optionalInteger(raw.totalItems) ?? null;
}
