import type { ExecutionContext, ResolvedCredential } from "../src/core/types.ts";

import { Buffer } from "node:buffer";
import { optionalRecord } from "../src/core/cast.ts";
import { parseEgressTrustedHosts, setEgressTrustedHosts } from "../src/core/request.ts";
import { executors } from "../src/providers/cloudflare_r2/executors.ts";
import {
  createCloudflareR2PresignedUrl,
  deriveCloudflareR2S3SecretAccessKey,
} from "../src/providers/cloudflare_r2/s3-presign.ts";
import { providerFetch } from "../src/providers/provider-runtime.ts";

const requiredEnvironment = ["R2_ACCOUNT_ID", "R2_BUCKET"] as const;

async function main(): Promise<void> {
  // Examples call providerFetch directly, so they must apply the same VPN/split-DNS
  // host exception the server process loads from this env var at startup.
  setEgressTrustedHosts(parseEgressTrustedHosts(process.env.OOMOL_CONNECT_EGRESS_TRUSTED_HOSTS));

  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const bucketName = process.env.R2_BUCKET?.trim();
  const apiToken = process.env.R2_API_TOKEN?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const missing: string[] = requiredEnvironment.filter((name) => !process.env[name]?.trim());
  if (!apiToken && !(accessKeyId && secretAccessKey)) {
    missing.push("R2_API_TOKEN or R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY");
  }
  if (missing.length > 0) {
    console.log(
      `Skip Cloudflare R2 presigned URL example: missing ${missing.join(", ")}. ` +
        "The current custom-credential path needs R2_API_TOKEN, R2_ACCOUNT_ID, and R2_BUCKET.",
    );
    return;
  }

  const objectKey = process.env.R2_OBJECT_KEY?.trim() || `oomol-connect/presign-live/${Date.now()}.txt`;
  const jurisdiction = process.env.R2_JURISDICTION?.trim();
  const body = `oomol-connect r2 presign live test ${new Date().toISOString()}\n`;
  const contentType = "text/plain";
  const expiresSeconds = 300;
  const path = apiToken ? "generate_presigned_url" : "s3-presign-helper";
  let signedUrl: string | undefined;

  if (!apiToken) {
    console.log(
      "Using R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY. This signs with the helper only and does not exercise cloudflare_r2.generate_presigned_url.",
    );
  }

  const shared = {
    accountId: accountId!,
    bucketName: bucketName!,
    objectKey,
    expiresSeconds,
    jurisdiction,
    apiToken,
    accessKeyId,
    secretAccessKey,
  };

  try {
    const put = await createSignedRequest({ ...shared, method: "PUT", contentType });
    signedUrl = put.url;
    const putResponse = await providerFetch(put.url, {
      method: "PUT",
      headers: put.requiredHeaders,
      body,
    });
    await assertOk("PUT", putResponse, put.url);

    const head = await createSignedRequest({ ...shared, method: "HEAD" });
    const headResponse = await providerFetch(head.url, { method: "HEAD" });
    await assertOk("HEAD", headResponse, head.url);
    const contentLength = headResponse.headers.get("content-length");
    if (contentLength == null) {
      // Node's fetch often omits content-length on HEAD even when the object exists.
      // GET below still verifies the uploaded body.
      console.log("HEAD omitted content-length; GET will verify the object body.");
    } else if (contentLength !== String(Buffer.byteLength(body))) {
      throw new Error(`HEAD content-length mismatch: expected ${Buffer.byteLength(body)}, received ${contentLength}`);
    }

    const get = await createSignedRequest({ ...shared, method: "GET" });
    const getResponse = await providerFetch(get.url);
    await assertOk("GET", getResponse, get.url);
    const downloaded = await getResponse.text();
    if (downloaded !== body) {
      throw new Error("GET body did not match the uploaded object");
    }

    console.log("Cloudflare R2 presigned GET/PUT/HEAD live test passed.");
    console.log(
      JSON.stringify(
        {
          bucketName,
          objectKey,
          putStatus: putResponse.status,
          headStatus: headResponse.status,
          getStatus: getResponse.status,
          expiresAt: get.expiresAt,
          path,
        },
        null,
        2,
      ),
    );
  } finally {
    if (signedUrl) {
      try {
        await deleteObject({ ...shared, signedUrl });
        console.log(`Deleted live-test object ${objectKey}.`);
      } catch (error) {
        console.error("Failed to delete the live-test object.", error);
      }
    }
  }
}

interface SignedRequestInput {
  accountId: string;
  bucketName: string;
  objectKey: string;
  method: "GET" | "PUT" | "HEAD";
  expiresSeconds: number;
  contentType?: string;
  jurisdiction?: string;
  apiToken?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

async function createSignedRequest(input: SignedRequestInput) {
  if (input.apiToken) {
    const result = await executors["cloudflare_r2.generate_presigned_url"]!(
      {
        accountId: input.accountId,
        bucketName: input.bucketName,
        objectKey: input.objectKey,
        method: input.method,
        expiresSeconds: input.expiresSeconds,
        contentType: input.contentType,
        jurisdiction: input.jurisdiction,
      },
      createActionContext(input.apiToken, input.accountId),
    );
    if (!result.ok) {
      throw new Error(`${input.method} generate_presigned_url failed: ${result.error?.message ?? "unknown error"}`);
    }
    const output = optionalRecord(result.output);
    if (!output) {
      throw new Error(`${input.method} generate_presigned_url returned no output`);
    }
    return {
      url: String(output.url),
      expiresAt: String(output.expiresAt),
      requiredHeaders: (optionalRecord(output.requiredHeaders) ?? {}) as Record<string, string>,
    };
  }

  const signed = createCloudflareR2PresignedUrl({
    accountId: input.accountId,
    accessKeyId: input.accessKeyId!,
    secretAccessKey: input.secretAccessKey!,
    bucketName: input.bucketName,
    objectKey: input.objectKey,
    method: input.method,
    expiresSeconds: input.expiresSeconds,
    contentType: input.contentType,
    jurisdiction: input.jurisdiction,
  });
  return {
    url: signed.url,
    expiresAt: signed.expiresAt,
    requiredHeaders: signed.requiredHeaders,
  };
}

async function deleteObject(input: {
  accountId: string;
  bucketName: string;
  objectKey: string;
  jurisdiction?: string;
  apiToken?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  signedUrl: string;
}): Promise<void> {
  const accessKeyId = input.accessKeyId ?? new URL(input.signedUrl).searchParams.get("X-Amz-Credential")?.split("/")[0];
  const secretAccessKey =
    input.secretAccessKey ?? (input.apiToken ? deriveCloudflareR2S3SecretAccessKey(input.apiToken) : undefined);
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("Unable to derive S3 credentials for live-test cleanup");
  }

  const signed = createCloudflareR2PresignedUrl({
    accountId: input.accountId,
    accessKeyId,
    secretAccessKey,
    bucketName: input.bucketName,
    objectKey: input.objectKey,
    method: "DELETE",
    expiresSeconds: 60,
    jurisdiction: input.jurisdiction,
  });
  const response = await providerFetch(signed.url, { method: "DELETE" });
  if (!response.ok && response.status !== 404) {
    const details = await response.text().catch(() => "");
    throw new Error(`DELETE cleanup failed with HTTP ${response.status}${details ? `: ${details.slice(0, 300)}` : ""}`);
  }
}

function createActionContext(apiToken: string, accountId: string): ExecutionContext {
  const credential: ResolvedCredential = {
    authType: "custom_credential",
    values: {
      apiKey: apiToken,
      accountId,
    },
    profile: {
      accountId,
      displayName: "Cloudflare R2 live example",
      grantedScopes: [],
    },
    metadata: { accountId },
  };
  return {
    async getCredential(service) {
      return service === "cloudflare_r2" ? credential : undefined;
    },
  };
}

async function assertOk(method: string, response: Response, url: string): Promise<void> {
  if (response.ok) {
    console.log(`${method} ${safeUrl(url)} -> ${response.status}`);
    return;
  }
  const details = await response.text().catch(() => "");
  throw new Error(
    `${method} ${safeUrl(url)} failed with HTTP ${response.status}${details ? `: ${details.slice(0, 500)}` : ""}`,
  );
}

function safeUrl(value: string): string {
  const url = new URL(value);
  return `${url.origin}${url.pathname}`;
}

await main();
