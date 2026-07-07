import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import {
  compactObject,
  optionalNumber,
  optionalRecord,
  optionalScalarString,
  optionalString,
} from "../../core/cast.ts";
import {
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  toProviderProxyError,
} from "../provider-runtime.ts";
import {
  aliyunStsApiVersion,
  aliyunStsEndpoint,
  assumeAliyunRole,
  buildAliyunStsSignedRpcBody,
  createAliyunStsSignatureNonce,
  formatAliyunStsRpcTimestamp,
} from "./runtime.ts";

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

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    if (input.method !== "POST") {
      throw new ProviderRequestError(400, "aliyun_sts proxy only supports POST requests.");
    }

    const credential = await context.getCredential(service);
    if (credential?.authType !== "custom_credential") {
      throw new ProviderRequestError(401, "Configure aliyun_sts custom credentials first.");
    }

    const accessKeyId = requireCredentialField(credential.values.accessKeyId, "accessKeyId");
    const accessKeySecret = requireCredentialField(credential.values.accessKeySecret, "accessKeySecret");
    const url = createProviderProxyUrl(aliyunStsEndpoint, input.endpoint);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("accept", "application/json");
    headers.set("content-type", "application/x-www-form-urlencoded");
    headers.set("user-agent", providerUserAgent);

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: buildAliyunStsSignedRpcBody(buildAliyunStsProxyParams(input, accessKeyId), accessKeySecret),
      signal: context.signal,
    });
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(
        response.status,
        text || `Alibaba Cloud STS request failed with HTTP ${response.status}`,
      );
    }

    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "Alibaba Cloud STS request failed");
  }
};

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

function buildAliyunStsProxyParams(
  input: { body?: unknown; query?: unknown },
  accessKeyId: string,
): Record<string, string> {
  return {
    Action: "AssumeRole",
    Format: "JSON",
    Version: aliyunStsApiVersion,
    ...readAliyunStsProxyParams(input.query),
    ...readAliyunStsProxyParams(input.body),
    AccessKeyId: accessKeyId,
    SignatureMethod: "HMAC-SHA1",
    SignatureNonce: createAliyunStsSignatureNonce(),
    SignatureVersion: "1.0",
    Timestamp: formatAliyunStsRpcTimestamp(new Date()),
  };
}

function readAliyunStsProxyParams(input: unknown): Record<string, string> {
  const record = optionalRecord(input);
  if (!record) {
    return {};
  }

  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    const resolved = optionalScalarString(value);
    if (resolved !== undefined) {
      output[key] = resolved;
    }
  }
  return output;
}

function requireCredentialField(value: unknown, fieldName: string): string {
  const resolved = optionalString(value);
  if (!resolved) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return resolved;
}
