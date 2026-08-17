import type { CredentialValidators, ProviderExecutors, TransitFileWriter } from "../../core/types.ts";

import { optionalString, requiredString } from "../../core/cast.ts";
import { defineProviderExecutors, requireOAuthCredential } from "../provider-runtime.ts";
import { executeBaiduNetdiskMcpAction, verifyBaiduNetdiskMcpConnection } from "./runtime-mcp.ts";
import { downloadBaiduNetdiskFile, fetchBaiduNetdiskAccount, getBaiduNetdiskQuota } from "./runtime.ts";

interface BaiduNetdiskContext {
  accessToken: string;
  fetcher: typeof fetch;
  transitFiles?: TransitFileWriter;
  signal?: AbortSignal;
}

const handlers: Record<string, (input: Record<string, unknown>, context: BaiduNetdiskContext) => Promise<unknown>> = {
  async get_current_account(_input, context) {
    const account = await fetchBaiduNetdiskAccount(context.accessToken, context.fetcher);
    return {
      accountId: account.accountId,
      accountLabel: account.accountLabel,
      avatarUrl: account.avatarUrl,
      membership: account.membership,
    };
  },
  get_quota(_input, context) {
    return getBaiduNetdiskQuota(context);
  },
  download_file(input, context) {
    return downloadBaiduNetdiskFile(input, context);
  },
};

for (const actionName of [
  "list_files",
  "search_files",
  "semantic_search_files",
  "upload_file_from_url",
  "create_text_file",
  "create_folder",
  "copy",
  "move",
  "rename",
]) {
  handlers[actionName] = (input, context) => executeBaiduNetdiskMcpAction(actionName, input, context);
}

export const executors: ProviderExecutors = defineProviderExecutors({
  service: "baidu_netdisk",
  handlers,
  async createContext(context, fetcher) {
    const credential = await requireOAuthCredential(context, "baidu_netdisk");
    return {
      accessToken: credential.accessToken,
      fetcher,
      transitFiles: context.transitFiles,
      signal: context.signal,
    };
  },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher }) {
    const [account] = await Promise.all([
      fetchBaiduNetdiskAccount(input.accessToken, fetcher),
      verifyBaiduNetdiskMcpConnection(input.accessToken, fetcher),
    ]);
    return {
      profile: {
        accountId: requiredString(account.accountId, "baidu_netdisk account id"),
        displayName: optionalString(account.accountLabel) ?? account.accountId,
      },
      metadata: account.providerMetadata,
    };
  },
};
