import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderFetch } from "../provider-runtime.ts";
import type { HuggingfaceActionContext, HuggingfaceCurrentUser } from "./runtime.shared.ts";

import { compactObject } from "../../core/cast.ts";
import { defineProviderExecutors, defineProviderProxy, ProviderRequestError } from "../provider-runtime.ts";
import {
  getHuggingfaceDatasetFirstRows,
  getHuggingfaceDatasetInfo,
  getHuggingfaceDatasetStatistics,
  listHuggingfaceDatasets,
} from "./runtime.datasets.ts";
import { getHuggingfaceTrending, listHuggingfaceEndpoints } from "./runtime.discovery.ts";
import {
  generateHuggingfaceChatCompletion,
  generateHuggingfaceEmbeddings,
  listHuggingfaceModels,
  getHuggingfaceModelInfo,
  readHuggingfaceCurrentUser,
} from "./runtime.shared.ts";
import { getHuggingfaceSpaceInfo, listHuggingfaceRepoFiles, listHuggingfaceSpaces } from "./runtime.spaces.ts";

const service = "huggingface";

type HuggingfaceActionHandler = (input: Record<string, unknown>, context: HuggingfaceActionContext) => Promise<unknown>;

export const huggingfaceActionHandlers: ProviderActionHandlers<"huggingface", HuggingfaceActionHandler> = {
  get_current_user(_input, context) {
    return readHuggingfaceCurrentUser(context);
  },
  list_models(input, context) {
    return listHuggingfaceModels(input, context);
  },
  get_model_info(input, context) {
    return getHuggingfaceModelInfo(input, context);
  },
  list_datasets(input, context) {
    return listHuggingfaceDatasets(input, context);
  },
  get_dataset_info(input, context) {
    return getHuggingfaceDatasetInfo(input, context);
  },
  get_dataset_first_rows(input, context) {
    return getHuggingfaceDatasetFirstRows(input, context);
  },
  get_dataset_statistics(input, context) {
    return getHuggingfaceDatasetStatistics(input, context);
  },
  list_spaces(input, context) {
    return listHuggingfaceSpaces(input, context);
  },
  get_space_info(input, context) {
    return getHuggingfaceSpaceInfo(input, context);
  },
  list_repo_files(input, context) {
    return listHuggingfaceRepoFiles(input, context);
  },
  get_trending(input, context) {
    return getHuggingfaceTrending(input, context);
  },
  list_endpoints(input, context) {
    return listHuggingfaceEndpoints(input, context);
  },
  generate_chat_completion(input, context) {
    return generateHuggingfaceChatCompletion(input, context);
  },
  generate_embeddings(input, context) {
    return generateHuggingfaceEmbeddings(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<HuggingfaceActionContext>({
  service,
  handlers: huggingfaceActionHandlers,
  async createContext(context: ExecutionContext, fetcher: ProviderFetch): Promise<HuggingfaceActionContext> {
    const credential = await context.getCredential(service);
    if (credential?.authType === "oauth2") {
      return {
        authType: "oauth2",
        accessToken: credential.accessToken,
        tokenType: credential.tokenType,
        fetcher,
        signal: context.signal,
        transitFiles: context.transitFiles,
      };
    }
    if (credential?.authType === "api_key") {
      return {
        authType: "api_key",
        accessToken: credential.apiKey,
        tokenType: "Bearer",
        fetcher,
        signal: context.signal,
        transitFiles: context.transitFiles,
      };
    }
    throw new ProviderRequestError(
      401,
      "Connect huggingface with OAuth or configure Hugging Face API key credentials first.",
    );
  },
});

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher, signal }) {
    const user = await readHuggingfaceCurrentUser({
      authType: "oauth2",
      accessToken: input.accessToken,
      tokenType: input.tokenType,
      fetcher,
      signal,
    });

    return credentialValidationResult(user);
  },

  async apiKey(input, { fetcher, signal }) {
    const user = await readHuggingfaceCurrentUser({
      authType: "api_key",
      accessToken: input.apiKey,
      tokenType: "Bearer",
      fetcher,
      signal,
    });

    return credentialValidationResult(user);
  },
};

function credentialValidationResult(user: HuggingfaceCurrentUser): CredentialValidationResult {
  return {
    profile: {
      accountId: user.id,
      displayName: user.name ?? user.preferredUsername ?? user.email ?? user.id,
    },
    metadata: {
      currentAccount: compactObject({
        sub: user.id,
        preferredUsername: user.preferredUsername,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        profileUrl: user.profileUrl,
        organizations: user.organizations,
      }),
    },
  };
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://datasets-server.huggingface.co",
  auth: { type: "bearer" },
});
