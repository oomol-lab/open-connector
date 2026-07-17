import type { ExecutionContext, ResolvedCredential } from "../src/core/types.ts";

import { executors } from "../src/providers/aliyun_sls/executors.ts";
import { parseAliyunSlsCredential, resolveAliyunSlsLogstoreTarget } from "../src/providers/aliyun_sls/resources.ts";

const requiredEnvironment = [
  "ALIYUN_SLS_ACCESS_KEY_ID",
  "ALIYUN_SLS_ACCESS_KEY_SECRET",
  "ALIYUN_SLS_ENDPOINT",
] as const;

async function main(): Promise<void> {
  const missing = requiredEnvironment.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    console.log(`Skip Alibaba Cloud SLS example: missing ${missing.join(", ")}.`);
    return;
  }

  const values: Record<string, string> = {
    accessKeyId: process.env.ALIYUN_SLS_ACCESS_KEY_ID!,
    accessKeySecret: process.env.ALIYUN_SLS_ACCESS_KEY_SECRET!,
    endpoint: process.env.ALIYUN_SLS_ENDPOINT!,
  };
  if (process.env.ALIYUN_SLS_SECURITY_TOKEN?.trim()) {
    values.securityToken = process.env.ALIYUN_SLS_SECURITY_TOKEN;
  }
  if (process.env.ALIYUN_SLS_RESOURCE_SCOPE?.trim()) {
    values.resourceScope = process.env.ALIYUN_SLS_RESOURCE_SCOPE;
  }

  const credential = parseAliyunSlsCredential(values);
  let target;
  try {
    target = resolveAliyunSlsLogstoreTarget(
      credential,
      undefined,
      process.env.ALIYUN_SLS_PROJECT,
      process.env.ALIYUN_SLS_LOGSTORE,
    );
  } catch {
    console.log(
      "Skip Alibaba Cloud SLS example: set ALIYUN_SLS_PROJECT and ALIYUN_SLS_LOGSTORE, or configure resourceScope with exactly one candidate Project and Logstore.",
    );
    return;
  }

  const resolvedCredential: ResolvedCredential = {
    authType: "custom_credential",
    values,
    profile: {
      accountId: credential.accessKeyId,
      displayName: `${credential.accessKeyId}@${credential.endpoint}`,
      grantedScopes: [],
    },
    metadata: {},
  };
  const context: ExecutionContext = {
    async getCredential(service) {
      return service === "aliyun_sls" ? resolvedCredential : undefined;
    },
  };

  const to = Math.floor(Date.now() / 1000);
  const result = await executors["aliyun_sls.query_logs"]!(
    {
      endpoint: target.endpoint,
      project: target.project,
      logstore: target.logstore,
      from: to - 900,
      to,
      query: process.env.ALIYUN_SLS_QUERY ?? "*",
      line: 100,
      reverse: true,
    },
    context,
  );
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

await main();
