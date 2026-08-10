import type { BlazeMeterActionHandler, BlazeMeterContext } from "../blaze_meter_performance/shared-runtime.ts";
import type { BlazeMeterFunctionalActionName } from "./actions.ts";

import {
  buildBlazeMeterPaginationQuery,
  buildBlazeMeterQuery,
  requestBlazeMeterJson,
  requireStoredBlazeMeterApiKeyId,
  validateBlazeMeterCredential,
} from "../blaze_meter_performance/shared-runtime.ts";

export const blazeMeterFunctionalActionHandlers: Record<BlazeMeterFunctionalActionName, BlazeMeterActionHandler> = {
  list_multi_tests(input, context) {
    return requestBlazeMeterJson(context, {
      path: "/multi-tests",
      query: buildBlazeMeterQuery({
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        ...buildBlazeMeterPaginationQuery(input),
      }),
      phase: "execute",
    });
  },
  get_multi_test(input, context) {
    return requestBlazeMeterJson(context, {
      path: `/multi-tests/${input.collectionId}`,
      query: buildBlazeMeterQuery({
        populateTests: input.populateTests,
      }),
      phase: "execute",
    });
  },
  get_active_sessions(_input, context) {
    return requestBlazeMeterJson(context, {
      path: "/user/active-sessions",
      phase: "execute",
    });
  },
};

export type { BlazeMeterContext as BlazeMeterFunctionalContext };
export {
  requireStoredBlazeMeterApiKeyId as requireBlazeMeterFunctionalApiKeyId,
  validateBlazeMeterCredential as validateBlazeMeterFunctionalCredential,
};
