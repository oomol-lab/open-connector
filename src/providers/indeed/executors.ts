import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { OAuthProviderContext, ProviderActionHandlers } from "../provider-runtime.ts";

import {
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  optionalStringArray,
  requiredRecord,
  requiredString,
  requiredStringArray,
} from "../../core/cast.ts";
import { defineOAuthProviderExecutors, ProviderRequestError, readProviderJson } from "../provider-runtime.ts";

const service = "indeed";
const graphQlUrl = "https://apis.indeed.com/graphql";
const userInfoUrl = "https://secure.indeed.com/v2/api/userinfo";

type IndeedActionHandler = (input: Record<string, unknown>, context: OAuthProviderContext) => Promise<unknown>;

const jobSelection = `
  id
  jobData {
    title
    dateCreated
    company
    externalJobPageUrl
    datePostedOnIndeed
    salary { period maximumMinor minimumMinor currency maximumMajor minimumMajor basePaySpecified }
    jobLocation { countryCode city postalCode fullAddress }
    externalPostingMetadata { jobPostingId jobRequisitionId campaignCategories trackingUrls rawInputLocation isIntegratedJob }
  }
  roleData { title company description { text } metaData { dateCreated isExternalIntegratedJob } }
  managementUrls { viewJob }
`;

const actionHandlers: ProviderActionHandlers<"indeed", IndeedActionHandler> = {
  get_current_user(_input, context) {
    return requestUserInfo(context);
  },
  execute_graphql(input, context) {
    return requestGraphQl(
      {
        query: requiredString(input.query, "query", badInput),
        variables: optionalRecord(input.variables),
        operationName: optionalString(input.operationName),
      },
      context,
    );
  },
  async find_employer_jobs(input, context) {
    const filters = {
      legacySourceId: optionalString(input.legacySourceId),
      jobFeedType: optionalStringArray(input.jobFeedTypes),
      includeMultiLocationJobs: optionalBoolean(input.includeMultiLocationJobs),
      jobRequisitionId: optionalStringArray(input.jobRequisitionIds),
    };
    const payload = await requestGraphQl(
      {
        query: `query FindEmployerJobs($input: FindEmployerJobsPartnerInput, $first: Int!, $before: String, $after: String) {
          findEmployerJobsPartner(input: $input, first: $first, before: $before, after: $after) {
            employerJobs { ${jobSelection} }
            estimatedTotalResultsCount
            pageInfo { endCursor hasNextPage hasPreviousPage startCursor }
          }
        }`,
        variables: {
          input: { filters },
          first: optionalInteger(input.first) ?? 10,
          before: optionalString(input.before),
          after: optionalString(input.after),
        },
      },
      context,
    );
    return readGraphQlField(payload, "findEmployerJobsPartner");
  },
  async get_job(input, context) {
    const payload = await requestGraphQl(
      {
        query: `query GetEmployerJob($id: ID!) { node(id: $id) { ... on EmployerJob { ${jobSelection} } } }`,
        variables: { id: requiredString(input.id, "id", badInput) },
      },
      context,
    );
    return { job: readGraphQlData(payload).node ?? null };
  },
  async get_jobs(input, context) {
    const payload = await requestGraphQl(
      {
        query: `query GetEmployerJobs($ids: [ID!]!) { nodes(ids: $ids) { ... on EmployerJob { ${jobSelection} } } }`,
        variables: { ids: requiredStringArray(input.ids, "ids", badInput) },
      },
      context,
    );
    return { jobs: readGraphQlData(payload).nodes ?? [] };
  },
  update_sourced_job_postings(input, context) {
    const update = requiredRecord(input.update, "update", badInput);
    return requestGraphQl(
      {
        query: `mutation UpdateSourcedJobPostings($input: UpdateSourcedJobPostingsInput!) {
          jobsIngest { updateSourcedJobPostings(input: $input) { results { jobPosting { sourcedPostingId employerJobId } } } }
        }`,
        variables: { input: { updates: [update] } },
      },
      context,
    );
  },
  clear_sourced_job_posting_updates(input, context) {
    return requestGraphQl(
      {
        query: `mutation ClearSourcedJobPostingUpdates($input: ClearSourcedJobPostingUpdatesInput!) {
          jobsIngest { clearSourcedJobPostingUpdates(input: $input) { results { jobPosting { sourcedPostingId employerJobId } } } }
        }`,
        variables: {
          input: {
            updates: [{ sourcedPostingId: requiredString(input.sourcedPostingId, "sourcedPostingId", badInput) }],
          },
        },
      },
      context,
    );
  },
};

export const executors: ProviderExecutors = defineOAuthProviderExecutors(service, actionHandlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher, signal }) {
    const user = await requestUserInfo({ accessToken: input.accessToken, fetcher, signal });
    const accountId = optionalString(user.sub) ?? "indeed:user";
    const email = optionalString(user.email);
    return {
      profile: { accountId, displayName: email ?? `Indeed User ${accountId}` },
      metadata: { currentUser: user },
    };
  },
};

interface GraphQlRequest {
  query: string;
  variables?: Record<string, unknown>;
  operationName?: string;
}

async function requestGraphQl(input: GraphQlRequest, context: OAuthProviderContext): Promise<Record<string, unknown>> {
  const response = await context.fetcher(graphQlUrl, {
    method: "POST",
    headers: {
      authorization: `${context.tokenType ?? "Bearer"} ${context.accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
    signal: context.signal,
  });
  return readProviderJson<Record<string, unknown>>(response, "Indeed GraphQL");
}

async function requestUserInfo(
  context: Pick<OAuthProviderContext, "accessToken" | "fetcher" | "signal">,
): Promise<Record<string, unknown>> {
  const response = await context.fetcher(userInfoUrl, {
    headers: { authorization: `Bearer ${context.accessToken}` },
    signal: context.signal,
  });
  return readProviderJson<Record<string, unknown>>(response, "Indeed user info");
}

function readGraphQlData(payload: Record<string, unknown>): Record<string, unknown> {
  const data = optionalRecord(payload.data);
  if (data) return data;
  throw new ProviderRequestError(502, "Indeed GraphQL response did not contain data", payload.errors);
}

function readGraphQlField(payload: Record<string, unknown>, field: string): unknown {
  const value = readGraphQlData(payload)[field];
  if (value !== undefined) return value;
  throw new ProviderRequestError(502, `Indeed GraphQL response did not contain ${field}`, payload.errors);
}

function badInput(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
