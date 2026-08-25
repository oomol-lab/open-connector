import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { BlazeMeterActionHandler, BlazeMeterContext } from "./shared-runtime.ts";

import { optionalString } from "../../core/cast.ts";
import {
  blazeMeterValidationPath,
  buildBlazeMeterPaginationQuery,
  buildBlazeMeterQuery,
  requestBlazeMeterJsonOrText,
  requireStoredBlazeMeterApiKeyId,
  validateBlazeMeterCredentialOrText,
} from "./shared-runtime.ts";

export const blazeMeterPerformanceActionHandlers: ProviderActionHandlers<
  "blaze_meter_performance",
  BlazeMeterActionHandler
> = {
  get_user(_input, context) {
    return requestBlazeMeterJsonOrText(context, {
      path: blazeMeterValidationPath,
      phase: "execute",
    });
  },
  list_accounts(input, context) {
    return requestBlazeMeterJsonOrText(context, {
      path: "/accounts",
      query: buildBlazeMeterPaginationQuery(input),
      phase: "execute",
    });
  },
  list_workspaces(input, context) {
    return requestBlazeMeterJsonOrText(context, {
      path: "/workspaces",
      query: buildBlazeMeterQuery({
        accountId: input.accountId,
        enabled: input.enabled,
        textFilter: optionalString(input.textFilter),
      }),
      phase: "execute",
    });
  },
  list_projects(input, context) {
    return requestBlazeMeterJsonOrText(context, {
      path: "/projects",
      query: buildBlazeMeterQuery({
        workspaceId: input.workspaceId,
        ...buildBlazeMeterPaginationQuery(input),
      }),
      phase: "execute",
    });
  },
  list_tests(input, context) {
    return requestBlazeMeterJsonOrText(context, {
      path: "/tests",
      query: buildBlazeMeterQuery({
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        ...buildBlazeMeterPaginationQuery(input),
      }),
      phase: "execute",
    });
  },
  get_test(input, context) {
    return requestBlazeMeterJsonOrText(context, {
      path: `/tests/${input.testId}`,
      phase: "execute",
    });
  },
};

export type { BlazeMeterContext as BlazeMeterPerformanceContext };
export {
  requireStoredBlazeMeterApiKeyId as requireBlazeMeterPerformanceApiKeyId,
  validateBlazeMeterCredentialOrText as validateBlazeMeterPerformanceCredential,
};
