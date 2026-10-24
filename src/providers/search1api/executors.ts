import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { BearerProviderContext } from "../provider-executors.ts";

import { optionalString } from "../../core/cast.ts";
import { storeResponseInTransit } from "../../core/request.ts";
import { defineBearerProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { runProviderRequest, ProviderRequestError, providerResponseError } from "../provider-runtime.ts";
import { search1apiActions } from "./actions.ts";
import { readSearch1apiJson, requestSearch1api, search1apiBaseUrl } from "./runtime.ts";
async function execute(
  actionName: string,
  values: Record<string, unknown>,
  context: BearerProviderContext,
): Promise<unknown> {
  const { accessToken: token, fetcher, transitFiles } = context;
  const data = values;
  if (actionName === "screenshot") {
    if (!transitFiles)
      throw new ProviderRequestError(
        503,
        "Search1API screenshots require configured file transit and execution identity",
        undefined,
        "provider_error",
      );
    return runProviderRequest(
      { label: "Search1API screenshot", signal: context.signal, timeoutMs: 60000 },
      async (signal) => {
        const response = await fetcher(`${search1apiBaseUrl}/screenshot`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
            accept: "image/png, image/jpeg, image/webp",
          },
          body: JSON.stringify(data),
          signal,
        });
        if (!response.ok) await readSearch1apiJson(response);
        const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim();
        if (!mimeType || !["image/png", "image/jpeg", "image/webp"].includes(mimeType) || !response.body) {
          await response.body?.cancel();
          throw providerResponseError("Search1API returned an invalid screenshot response");
        }
        const extension = mimeType.slice("image/".length);
        const result = await storeResponseInTransit(response, transitFiles, {
          name: `search1api-screenshot.${extension}`,
          mimeType,
          fieldName: "Search1API screenshot",
          createError: providerResponseError,
          signal,
        });
        return {
          url: result.downloadUrl,
          mimeType,
          requestId: response.headers.get("x-request-id"),
        };
      },
    );
  }
  const body = await requestSearch1api(token, actionName, data, fetcher, context.signal);
  if (actionName === "deepcrawl")
    if (!optionalString(body.taskId)) throw providerResponseError("Search1API task ID is missing");
  if (actionName === "get_deepcrawl")
    if (!optionalString(body.status)) throw providerResponseError("Search1API task status is missing");
  return body;
}
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await requestSearch1api(input.apiKey, "usage", {}, fetcher, signal);
    return {
      profile: { displayName: "Search1API API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl: search1apiBaseUrl },
    };
  },
};
export const executors: ProviderExecutors = defineBearerProviderExecutors(
  "search1api",
  Object.fromEntries(
    search1apiActions.map((action) => [action.name, (values, context) => execute(action.name, values, context)]),
  ),
);
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "search1api",
  baseUrl: search1apiBaseUrl,
  auth: { type: "bearer" },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});
