import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
} from "../../core/types.ts";

import { compactObject, optionalNumber, optionalString } from "../../core/cast.ts";
import { defineProviderExecutors, ProviderRequestError } from "../provider-runtime.ts";
import { assumeAliyunRole } from "./runtime.ts";

const service = "aliyun_sts";

interface AliyunStsContext {
  values: Record<string, string>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export const executors: ProviderExecutors = defineProviderExecutors<AliyunStsContext>({
  service,
  handlers: {
    assume_role(input, context) {
      const accessKeyId = requireCredentialField(context.values.accessKeyId, "accessKeyId");
      const accessKeySecret = requireCredentialField(context.values.accessKeySecret, "accessKeySecret");
      const roleArn = optionalString(input.roleArn) ?? optionalString(context.values.defaultRoleArn);
      if (!roleArn) {
        throw new ProviderRequestError(400, "roleArn is required when the connection has no defaultRoleArn");
      }

      return assumeAliyunRole(
        {
          accessKeyId,
          accessKeySecret,
          roleArn,
          roleSessionName: optionalString(input.roleSessionName),
          durationSeconds: optionalNumber(input.durationSeconds),
          policy: optionalString(input.policy),
        },
        {
          fetcher: context.fetcher,
          signal: context.signal,
        },
      );
    },
  },
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<AliyunStsContext> {
    const credential = await context.getCredential(service);
    if (credential?.authType !== "custom_credential") {
      throw new ProviderRequestError(401, "Configure aliyun_sts custom credentials first.");
    }
    return {
      values: credential.values,
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async customCredential(input): Promise<CredentialValidationResult> {
    const accessKeyId = requireCredentialField(input.values.accessKeyId, "accessKeyId");
    requireCredentialField(input.values.accessKeySecret, "accessKeySecret");
    const defaultRoleArn = optionalString(input.values.defaultRoleArn);

    return {
      profile: {
        accountId: accessKeyId,
        displayName: defaultRoleArn ? `Alibaba Cloud STS - ${defaultRoleArn}` : `Alibaba Cloud STS - ${accessKeyId}`,
      },
      grantedScopes: [],
      metadata: compactObject({
        credentialKind: "ram_access_key",
        defaultRoleArn,
      }),
    };
  },
};

function requireCredentialField(value: unknown, fieldName: string): string {
  const resolved = optionalString(value);
  if (!resolved) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return resolved;
}
