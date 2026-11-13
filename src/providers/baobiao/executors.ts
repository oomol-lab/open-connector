import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionSources } from "../provider-executors.ts";

import { sha256Hex } from "../../core/aws-sigv4.ts";
import { looseArray, optionalIntegerOrNull, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, mapProviderActionSources } from "../provider-executors.ts";
import { defineProviderProxy, providerProxyEndpointPrefixes } from "../provider-proxy.ts";
import { ProviderRequestError, requiredInputString } from "../provider-runtime.ts";
import { baobiaoBaseUrl, isBaobiaoInvalidKeyError, pollBaobiaoSearchQuery, requestBaobiao } from "./runtime.ts";

const service = "baobiao";

interface BaobiaoEndpoint {
  path: string;
  form?: boolean;
  /** Resubmit the query until the gateway finishes rewriting it. */
  poll?: boolean;
  /** Map action input to the gateway body; defaults to the input itself. */
  body?: (input: Record<string, unknown>) => Record<string, unknown>;
  /** Map the gateway envelope to the action output; defaults to the `data` object. */
  output?: (envelope: Record<string, unknown>) => unknown;
}

const projectDetail = (input: Record<string, unknown>) => ({ id: input.id, publishTime: input.publishTime });
const listOf = (field: string) => (envelope: Record<string, unknown>) => ({ [field]: looseArray(envelope.data) });
const nullableCompany = (envelope: Record<string, unknown>) => ({ company: optionalRecord(envelope.data) ?? null });

const endpoints: ProviderActionSources<typeof service, BaobiaoEndpoint> = {
  search_projects_simple: { path: "/bid/SearchProjectForAI" },
  search_projects: { path: "/bid/searchProjectApi" },
  search_projects_by_number: {
    path: "/bid/getProjectByProjectNumber",
    // This endpoint returns IDs as strings while the detail actions take integers.
    output: (envelope) => ({
      projects: looseArray(envelope.data).map((item) => ({
        ...optionalRecord(item),
        id: optionalIntegerOrNull(optionalRecord(item)?.id),
      })),
    }),
  },
  search_projects_by_source_url: { path: "/bid/searchProjectByCollectUrl" },
  search_contracts: { path: "/bid/searchProjectContactApi" },
  get_project_content: { path: "/bid/getZTBProjectDetail", form: true, body: projectDetail },
  get_project_text: { path: "/bid/getZTBProjectDetailForAI", form: true, body: projectDetail },
  get_project_structure: { path: "/bid/getZTBStructreDetail", form: true, body: projectDetail },
  get_project_requirements: { path: "/bid/getZTBStructreStep2DetailForCommon", body: projectDetail },
  list_project_files: {
    path: "/bid/getZTBProjectFiles",
    form: true,
    body: (input) => ({ projectId: input.id, publishTime: input.publishTime }),
    output: listOf("files"),
  },
  get_project_source_url: {
    path: "/bid/getCollectUrl",
    form: true,
    body: projectDetail,
    output: (envelope) => ({ url: optionalString(envelope.returnValue) ?? null }),
  },
  build_search_query: { path: "/bid/aiSearchSubmitPolling", poll: true },
  infer_industry_codes: { path: "/bid/industryReasoning", output: listOf("industries") },
  search_planned_projects: { path: "/bid/searchNZJProjectApi" },
  get_planned_project: {
    path: "/bid/getNZJProjectDetail",
    body: (input) => ({ id: input.id, publishtime: input.publishTime }),
  },
  list_planned_project_files: {
    path: "/bid/getNZJProjectFileList",
    // projectTypeID 2 is the gateway's fixed type for planned projects.
    body: (input) => ({ projectId: input.id, projectTypeID: 2, publishTime: input.publishTime }),
    output: listOf("files"),
  },
  get_account_resources: { path: "/bid/account/resources" },
  search_companies: { path: "/bid/company/profile/fuzzy-search" },
  get_company_registration: {
    path: "/bid/company/profile/registration-info",
    body: (input) => ({ key: input.query, keyType: input.keyType }),
    output: nullableCompany,
  },
  get_company_business_info: { path: "/bid/company/profile/business-info", output: nullableCompany },
  get_company_summary: { path: "/bid/companyProfileSummary" },
  get_company_statistics: { path: "/bid/company/profile/statistics" },
  list_company_contacts: { path: "/bid/companyProfileContacts" },
  list_company_customers: { path: "/bid/companyProfileCustomers" },
  list_company_suppliers: { path: "/bid/companyProfileSuppliers" },
  search_purchasing_units: { path: "/bid/purchasing-unit-search" },
  search_winning_suppliers: { path: "/bid/supplier-search" },
  search_company_projects: { path: "/bid/CompanySearchProject" },
};

const handlers = mapProviderActionSources(
  service,
  endpoints,
  (_name, endpoint) =>
    async (input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> => {
      if (endpoint.poll) {
        return pollBaobiaoSearchQuery(context, endpoint.path, requiredInputString(input.userQuery, "userQuery"));
      }
      const envelope = await requestBaobiao(context, {
        path: endpoint.path,
        form: endpoint.form,
        body: endpoint.body ? endpoint.body(input) : input,
      });
      return endpoint.output ? endpoint.output(envelope) : dataRecord(envelope);
    },
);

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: baobiaoBaseUrl,
  auth: { type: "api_key_query", name: "key" },
  allowedEndpoint: providerProxyEndpointPrefixes("/bid"),
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    // The balance endpoint reads only account data but must be enabled per account, so a business rejection other than a key rejection still proves the key.
    let accountResourcesAvailable = true;
    try {
      await requestBaobiao(
        { apiKey: input.apiKey, fetcher, signal },
        { path: endpoints.get_account_resources.path, body: {} },
      );
    } catch (error) {
      if (isBaobiaoInvalidKeyError(error)) throw new ProviderRequestError(400, "Baobiao API key is invalid", error);
      // Only a business envelope proves the gateway recognized the key; a raw HTTP 4xx carries no details.
      const businessRejection =
        error instanceof ProviderRequestError &&
        (error.status === 400 || error.status === 403) &&
        optionalRecord(error.details) !== undefined;
      if (!businessRejection) throw error;
      accountResourcesAvailable = false;
    }
    const hash = sha256Hex(input.apiKey);
    return {
      profile: { accountId: `baobiao:${hash}`, displayName: `Baobiao · ${hash.slice(-6)}` },
      metadata: { apiBaseUrl: baobiaoBaseUrl, accountResourcesAvailable },
    };
  },
};

function dataRecord(envelope: Record<string, unknown>): Record<string, unknown> {
  const data = optionalRecord(envelope.data);
  if (!data) throw new ProviderRequestError(404, "Baobiao returned no data for this request", envelope);
  return data;
}
