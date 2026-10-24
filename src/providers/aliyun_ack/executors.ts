import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-executors.ts";

import { optionalBoolean, optionalNumber, optionalString } from "../../core/cast.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import { getTemporaryKubeconfig } from "./runtime.ts";

const service = "aliyun_ack";

interface AliyunAckContext {
  accessKeyId: string;
  accessKeySecret: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

const handlers: ProviderActionHandlers<"aliyun_ack", ProviderRuntimeHandler<AliyunAckContext>> = {
  get_temporary_kubeconfig(input, context) {
    const clusterId = requireCredentialField(input.clusterId, "clusterId");
    const regionId = requireCredentialField(input.regionId, "regionId");
    const temporaryDurationMinutes = optionalNumber(input.temporaryDurationMinutes);
    if (!Number.isInteger(temporaryDurationMinutes)) {
      throw new ProviderRequestError(400, "temporaryDurationMinutes must be an integer");
    }
    return getTemporaryKubeconfig(
      {
        clusterId,
        regionId,
        temporaryDurationMinutes: temporaryDurationMinutes!,
        privateIpAddress: optionalBoolean(input.privateIpAddress),
      },
      { accessKeyId: context.accessKeyId, accessKeySecret: context.accessKeySecret },
      { fetcher: context.fetcher, signal: context.signal },
    );
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<AliyunAckContext>({
  service,
  handlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<AliyunAckContext> {
    const credential = await context.getCredential(service);
    if (credential?.authType !== "custom_credential") {
      throw new ProviderRequestError(401, "Configure aliyun_ack custom credentials first.");
    }
    return {
      accessKeyId: requireCredentialField(credential.values.accessKeyId, "accessKeyId"),
      accessKeySecret: requireCredentialField(credential.values.accessKeySecret, "accessKeySecret"),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async customCredential(input) {
    const accessKeyId = requireCredentialField(input.values.accessKeyId, "accessKeyId");
    requireCredentialField(input.values.accessKeySecret, "accessKeySecret");
    return {
      profile: { accountId: accessKeyId, displayName: `Alibaba Cloud ACK - ${accessKeyId}` },
      grantedScopes: [],
      metadata: { credentialKind: "ram_access_key" },
    };
  },
};

function requireCredentialField(value: unknown, fieldName: string): string {
  const resolved = optionalString(value);
  if (!resolved) throw new ProviderRequestError(400, `${fieldName} is required`);
  return resolved;
}
