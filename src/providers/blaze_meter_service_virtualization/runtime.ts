import type {
  BlazeMeterActionHandler,
  BlazeMeterContext,
  BlazeMeterRequestInput,
} from "../blaze_meter_performance/shared-runtime.ts";
import type { BlazeMeterServiceVirtualizationActionName } from "./actions.ts";

import { compactObject, optionalString } from "../../core/cast.ts";
import {
  requestBlazeMeterJson,
  requireStoredBlazeMeterApiKeyId,
  validateBlazeMeterCredential,
} from "../blaze_meter_performance/shared-runtime.ts";
import { ProviderRequestError } from "../provider-runtime.ts";

const blazeMeterJsonHeaders = { "content-type": "application/json" };

export const blazeMeterServiceVirtualizationActionHandlers: Record<
  BlazeMeterServiceVirtualizationActionName,
  BlazeMeterActionHandler
> = {
  list_service_mock_templates(input, context) {
    return requestBlazeMeterServiceVirtualizationJson(context, {
      path: `/workspaces/${input.workspaceId}/service-mock-templates`,
      phase: "execute",
    });
  },
  get_service_mock_template(input, context) {
    return requestBlazeMeterServiceVirtualizationJson(context, {
      path: `/workspaces/${input.workspaceId}/service-mock-templates/${input.templateId}`,
      phase: "execute",
    });
  },
  update_service_mock_template(input, context) {
    return requestBlazeMeterServiceVirtualizationJson(context, {
      path: `/workspaces/${input.workspaceId}/service-mock-templates/${input.templateId}`,
      method: "PUT",
      body: buildUpdateServiceMockTemplateBody(input),
      phase: "execute",
    });
  },
};

export type { BlazeMeterContext as BlazeMeterServiceVirtualizationContext };
export {
  requireStoredBlazeMeterApiKeyId as requireBlazeMeterServiceVirtualizationApiKeyId,
  validateBlazeMeterCredential as validateBlazeMeterServiceVirtualizationCredential,
};

function requestBlazeMeterServiceVirtualizationJson(
  context: BlazeMeterContext,
  input: BlazeMeterRequestInput,
): Promise<Record<string, unknown>> {
  return requestBlazeMeterJson(context, {
    ...input,
    headers: blazeMeterJsonHeaders,
  });
}

function buildUpdateServiceMockTemplateBody(input: Record<string, unknown>): Record<string, unknown> {
  const liveSystemHost = optionalString(input.liveSystemHost);
  if (liveSystemHost && !liveSystemHost.startsWith("http://") && !liveSystemHost.startsWith("https://")) {
    throw new ProviderRequestError(400, "liveSystemHost must start with http:// or https://.");
  }

  const body = compactObject({
    name: optionalString(input.name),
    description: optionalString(input.description),
    thinkTime: input.thinkTime,
    liveSystemHost,
    liveSystemPort: input.liveSystemPort,
    endpointPreference: input.endpointPreference,
    noMatchingRequestPreference: input.noMatchingRequestPreference,
  });
  if (Object.keys(body).length === 0) {
    throw new ProviderRequestError(400, "At least one service mock template field is required.");
  }

  return body;
}
