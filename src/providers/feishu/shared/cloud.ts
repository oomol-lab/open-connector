/**
 * One Feishu Open Platform deployment.
 *
 * Feishu (China) and Lark (international) serve the same Open Platform API
 * from different hosts with separate app registries, so a credential minted
 * by one is only valid against that deployment's API base. Every Feishu
 * request builder takes `openBaseUrl` explicitly (no default) so a provider
 * cannot authenticate against one deployment and then read from the other.
 */
export interface FeishuCloud {
  /** Open Platform API base, without a trailing slash. */
  readonly openBaseUrl: string;
}

export const feishuCloud: FeishuCloud = {
  openBaseUrl: "https://open.feishu.cn/open-apis",
};

export const larkCloud: FeishuCloud = {
  openBaseUrl: "https://open.larksuite.com/open-apis",
};
