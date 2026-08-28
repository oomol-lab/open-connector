import { createAwsSigV4PresignedUrl, encodeRfc3986, encodeS3ObjectKey, sha256Hex } from "../../core/aws-sigv4.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import { cloudflareR2Jurisdictions } from "./actions.ts";

const r2S3Region = "auto";
const r2S3Service = "s3";

export type CloudflareR2PresignedMethod = "GET" | "PUT" | "HEAD" | "DELETE";

export interface CloudflareR2PresignedUrlInput {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  objectKey: string;
  method: CloudflareR2PresignedMethod;
  expiresSeconds: number;
  contentType?: string;
  jurisdiction?: string;
  now?: Date;
}

export interface CloudflareR2PresignedUrl {
  url: string;
  method: CloudflareR2PresignedMethod;
  expiresSeconds: number;
  expiresAt: string;
  requiredHeaders: Record<string, string>;
}

/**
 * Derive the R2 S3 Secret Access Key from a Cloudflare API token value.
 * Cloudflare documents this as the SHA-256 hex digest of the token secret.
 * https://developers.cloudflare.com/r2/api/tokens/#get-s3-api-credentials-from-an-api-token
 */
export function deriveCloudflareR2S3SecretAccessKey(apiToken: string): string {
  return sha256Hex(apiToken);
}

/**
 * Generate an R2 S3 presigned URL locally with AWS SigV4. This does not send a
 * network request.
 */
export function createCloudflareR2PresignedUrl(input: CloudflareR2PresignedUrlInput): CloudflareR2PresignedUrl {
  const now = new Date(Math.floor((input.now ?? new Date()).getTime() / 1000) * 1000);
  const requiredHeaders: Record<string, string> = {};
  if (input.contentType) {
    requiredHeaders["content-type"] = input.contentType;
  }
  const url = createAwsSigV4PresignedUrl({
    credential: {
      accessKeyId: input.accessKeyId,
      secretAccessKey: input.secretAccessKey,
    },
    method: input.method,
    url: createCloudflareR2S3ObjectUrl(input),
    region: r2S3Region,
    service: r2S3Service,
    expiresSeconds: input.expiresSeconds,
    headers: requiredHeaders,
    now,
  });
  return {
    url,
    method: input.method,
    expiresSeconds: input.expiresSeconds,
    expiresAt: new Date(now.getTime() + input.expiresSeconds * 1000).toISOString(),
    requiredHeaders,
  };
}

export function createCloudflareR2S3ObjectUrl(input: {
  accountId: string;
  bucketName: string;
  objectKey: string;
  jurisdiction?: string;
}): URL {
  if (!input.bucketName.isWellFormed()) {
    throw new ProviderRequestError(400, "bucketName must contain valid Unicode");
  }
  if (!input.objectKey.isWellFormed()) {
    throw new ProviderRequestError(400, "objectKey must contain valid Unicode");
  }
  const expectedHost = buildCloudflareR2S3Host(input.accountId, input.jurisdiction);
  const url = assertPublicHttpUrl(`https://${expectedHost}`, {
    fieldName: "accountId",
    createError: (message) => new ProviderRequestError(400, message),
  });
  if (
    url.host !== expectedHost.toLowerCase() ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw invalidR2S3Endpoint();
  }
  const pathname = `/${encodeRfc3986(input.bucketName)}/${encodeS3ObjectKey(input.objectKey)}`;
  url.pathname = pathname;
  // The WHATWG parser resolves `.` and `..` segments, so a normalized pathname
  // would sign a URL for a different bucket or key than the caller asked for.
  if (url.pathname !== pathname) {
    throw new ProviderRequestError(400, "bucketName and objectKey must not contain . or .. path segments");
  }
  return url;
}

function buildCloudflareR2S3Host(accountId: string, jurisdiction: string | undefined): string {
  if (!jurisdiction || jurisdiction === "default") {
    return `${accountId}.r2.cloudflarestorage.com`;
  }
  const allowedJurisdictions = cloudflareR2Jurisdictions as readonly string[];
  if (!allowedJurisdictions.includes(jurisdiction)) {
    throw new ProviderRequestError(400, `jurisdiction must be one of ${allowedJurisdictions.join(", ")}`);
  }
  return `${accountId}.${jurisdiction}.r2.cloudflarestorage.com`;
}

function invalidR2S3Endpoint(): ProviderRequestError {
  return new ProviderRequestError(400, "accountId and jurisdiction must form a valid R2 S3 endpoint");
}
