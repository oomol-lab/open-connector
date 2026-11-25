import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderRuntimeHandler } from "../provider-executors.ts";
import type { ShowdocContext } from "./runtime.ts";

import { optionalRecord } from "../../core/cast.ts";
import { requireApiKeyCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { providerInputError, requiredInputString } from "../provider-runtime.ts";
import { requestShowdoc, pageRequest, uploadAttachment, showdocApiBaseUrl } from "./runtime.ts";

const handlers: Record<string, ProviderRuntimeHandler<ShowdocContext>> = {
  update_page: (input, context) => pageRequest("updatePage", input, context),
  get_page: (input, context) => pageRequest("getPage", input, context),
  delete_page: (input, context) => requestShowdoc("deletePage", input, context),
  get_catalog_tree: (input, context) => requestShowdoc("getCatalogTree", input, context),
  create_catalog: (input, context) => requestShowdoc("createCatalog", input, context),
  update_catalog: (input, context) => requestShowdoc("updateCatalog", input, context),
  delete_catalog: (input, context) => requestShowdoc("deleteCatalog", input, context),
  upload_attachment: uploadAttachment,
  delete_attachment: (input, context) => requestShowdoc("deleteAttachment", input, context),
};

export const executors: ProviderExecutors = defineProviderExecutors({
  service: "showdoc",
  handlers,
  skipDnsValidation: true,
  async createContext(context, fetcher) {
    const credential = await requireApiKeyCredential(context, "showdoc");
    return {
      apiKey: credential.apiKey,
      apiToken: requiredInputString(credential.values.apiToken, "apiToken"),
      fetcher,
      signal: context.signal,
      transitFiles: context.transitFiles,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, context) {
    await requestShowdoc(
      "getCatalogTree",
      {},
      { ...context, apiKey: input.apiKey, apiToken: requiredInputString(input.values.apiToken, "apiToken") },
    );
    return { profile: { displayName: "ShowDoc Project" }, metadata: {} };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "showdoc",
  baseUrl: showdocApiBaseUrl,
  // Credentials in the body cannot be forwarded to a redirect destination.
  redirect: "manual",
  auth: { type: "none" },
  skipDnsValidation: true,
  defaultHeaders: { "accept": "application/json", "content-type": "application/json" },
  async customizeRequest(input) {
    const body = input.body == null ? {} : optionalRecord(input.body);
    if (
      input.method.toUpperCase() !== "POST" ||
      !body ||
      !(input.url.pathname === "/server/api/open" || input.url.pathname.startsWith("/server/api/open/"))
    )
      throw providerInputError("ShowDoc proxy requires POST with a JSON object body under the Open API prefix");
    const credential = await requireApiKeyCredential(input.context, "showdoc");
    input.url.searchParams.delete("api_key");
    input.url.searchParams.delete("api_token");
    input.setBody({
      ...body,
      api_key: credential.apiKey,
      api_token: requiredInputString(credential.values.apiToken, "apiToken"),
    });
  },
});
