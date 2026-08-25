import { describe, expect, it } from "vitest";
import { ProviderRequestError } from "../provider-runtime.ts";
import {
  createCloudflareR2PresignedUrl,
  createCloudflareR2S3ObjectUrl,
  deriveCloudflareR2S3SecretAccessKey,
} from "./s3-presign.ts";

describe("Cloudflare R2 S3 presign helper", () => {
  it("signs a path-style R2 URL with region auto", () => {
    const result = createCloudflareR2PresignedUrl({
      accountId: "023e105f4ecef8ad9ca31a8372d0c353",
      accessKeyId: "token-id-1",
      secretAccessKey: "secret",
      bucketName: "documents",
      objectKey: "reports/annual report #1.txt",
      method: "PUT",
      expiresSeconds: 120,
      contentType: "text/plain",
      now: new Date("2026-08-22T00:00:00Z"),
    });

    const url = new URL(result.url);
    expect(url.protocol).toBe("https:");
    expect(url.hostname).toBe("023e105f4ecef8ad9ca31a8372d0c353.r2.cloudflarestorage.com");
    expect(url.pathname).toBe("/documents/reports/annual%20report%20%231.txt");
    expect(url.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(url.searchParams.get("X-Amz-Credential")).toBe("token-id-1/20260822/auto/s3/aws4_request");
    expect(url.searchParams.get("X-Amz-Date")).toBe("20260822T000000Z");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("120");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("content-type;host");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(result.expiresAt).toBe("2026-08-22T00:02:00.000Z");
    expect(result.requiredHeaders).toEqual({ "content-type": "text/plain" });
  });

  it("uses the jurisdiction-specific S3 host", () => {
    const result = createCloudflareR2PresignedUrl({
      accountId: "023e105f4ecef8ad9ca31a8372d0c353",
      accessKeyId: "token-id-1",
      secretAccessKey: "secret",
      bucketName: "documents",
      objectKey: "file.txt",
      method: "GET",
      expiresSeconds: 60,
      jurisdiction: "eu",
      now: new Date("2026-08-22T00:00:00Z"),
    });

    expect(new URL(result.url).hostname).toBe("023e105f4ecef8ad9ca31a8372d0c353.eu.r2.cloudflarestorage.com");
    expect(result.requiredHeaders).toEqual({});
  });

  it("derives the S3 secret as the SHA-256 hex digest of the API token", () => {
    expect(deriveCloudflareR2S3SecretAccessKey("cf-api-token-secret")).toBe(
      "c954a48febbdcd595a54a6d658b123e08a05bbb9d97b7a733a7d928b31c47a81",
    );
  });

  it("rejects account IDs that would change the R2 S3 origin", () => {
    expect(() =>
      createCloudflareR2S3ObjectUrl({
        accountId: "evil.example#",
        bucketName: "documents",
        objectKey: "file.txt",
      }),
    ).toThrow(ProviderRequestError);
    expect(() =>
      createCloudflareR2S3ObjectUrl({
        accountId: "user@evil.example",
        bucketName: "documents",
        objectKey: "file.txt",
      }),
    ).toThrow(ProviderRequestError);
  });
});
