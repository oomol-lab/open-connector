import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { SansanContext } from "./request.ts";

import { optionalString, recordOrEmpty } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, mapProviderActionHandlers } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { providerResponseError, requiredInputString } from "../provider-runtime.ts";
import { sansanActions } from "./actions.ts";
import { sansanAdminHandlers } from "./admin.ts";
import { sansanBusinessHandlers } from "./business.ts";
import { sansanOrganizationHandlers } from "./organization.ts";
import { executeSansanRead } from "./read.ts";
import { readSansanError, requestSansanJson, sansanApiBaseUrl } from "./request.ts";

const mutations = { ...sansanAdminHandlers, ...sansanBusinessHandlers, ...sansanOrganizationHandlers };
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "sansan",
  mapProviderActionHandlers(
    "sansan",
    sansanActions,
    (action) => (input: Record<string, unknown>, context: SansanContext) => {
      input = { ...input };
      for (const field of [
        "ownerUserId",
        "businessCardId",
        "personId",
        "nextPageToken",
        "departmentId",
        "aclPatternId",
        "aclPatternName",
        "patternId",
        "importId",
      ]) {
        if (input[field] !== undefined) input[field] = requiredInputString(input[field], field);
      }
      for (const field of ["tagIds", "internalAttendeeUserIds"]) {
        if (Array.isArray(input[field])) input[field] = input[field].map((value) => requiredInputString(value, field));
      }
      if (Array.isArray(input.details))
        input.details = input.details.map((value) => {
          const detail = recordOrEmpty(value);
          return {
            ...detail,
            objectDepartmentId: requiredInputString(detail.objectDepartmentId, "objectDepartmentId"),
            accessibleFieldsSettingsName: requiredInputString(
              detail.accessibleFieldsSettingsName,
              "accessibleFieldsSettingsName",
            ),
          };
        });
      const handler = mutations[action.name];
      return handler ? handler(input, context) : executeSansanRead(action.name, input, context);
    },
  ),
);
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const user = await requestSansanJson("/me", {}, { apiKey: input.apiKey, fetcher, signal, phase: "validate" });
    const accountId = optionalString(user.id);
    if (!accountId) throw providerResponseError("Sansan user response is missing id");
    return { profile: { accountId, displayName: optionalString(user.name) ?? accountId }, grantedScopes: [] };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "sansan",
  baseUrl: sansanApiBaseUrl,
  auth: { type: "api_key_header", name: "X-Sansan-Api-Key" },
  readError: (response) => readSansanError(response),
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});
