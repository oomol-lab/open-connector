import type { CredentialValidators, ProviderExecutors, TransitFileWriter } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { optionalString, requiredString } from "../../core/cast.ts";
import { defineProviderExecutors, mapProviderActionHandlers, requireOAuthCredential } from "../provider-runtime.ts";
import { baiduNetdiskActions } from "./actions.ts";
import { executeBaiduNetdiskMcpAction, verifyBaiduNetdiskMcpConnection } from "./runtime-mcp.ts";
import {
  createBaiduNetdiskFolder,
  downloadBaiduNetdiskFile,
  fetchBaiduNetdiskAccount,
  getBaiduNetdiskQuota,
} from "./runtime.ts";

interface BaiduNetdiskContext {
  accessToken: string;
  fetcher: typeof fetch;
  transitFiles?: TransitFileWriter;
  signal?: AbortSignal;
}

type BaiduNetdiskHandler = (input: Record<string, unknown>, context: BaiduNetdiskContext) => Promise<unknown>;

const handlers: ProviderActionHandlers<"baidu_netdisk", BaiduNetdiskHandler> = mapProviderActionHandlers(
  "baidu_netdisk",
  baiduNetdiskActions,
  (_action, name): BaiduNetdiskHandler => {
    switch (name) {
      case "get_current_account":
        return async (_input, context) => {
          const account = await fetchBaiduNetdiskAccount(context.accessToken, context.fetcher);
          return {
            accountId: account.accountId,
            accountLabel: account.accountLabel,
            avatarUrl: account.avatarUrl,
            membership: account.membership,
          };
        };
      case "get_quota":
        return (_input, context) => getBaiduNetdiskQuota(context);
      case "download_file":
        return downloadBaiduNetdiskFile;
      case "create_folder":
        return createBaiduNetdiskFolder;
      default:
        return (input, context) => executeBaiduNetdiskMcpAction(name, input, context);
    }
  },
);

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
