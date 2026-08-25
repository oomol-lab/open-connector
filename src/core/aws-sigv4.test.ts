import { describe, expect, it } from "vitest";
import { createAwsSigV4PresignedUrl, encodeRfc3986, sha256Hex } from "./aws-sigv4.ts";

describe("AWS SigV4 presign helper", () => {
  it("matches the AWS GET query-string auth example", () => {
    const source = new URL("https://examplebucket.s3.amazonaws.com/test.txt");
    const signed = createAwsSigV4PresignedUrl({
      credential: {
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      },
      method: "GET",
      url: source,
      region: "us-east-1",
      expiresSeconds: 86400,
      now: new Date("2013-05-24T00:00:00Z"),
    });

    expect(source.search).toBe("");
    expect(signed).toBe(
      "https://examplebucket.s3.amazonaws.com/test.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404",
    );
  });

  it("produces a deterministic query-string signature", () => {
    const url = new URL("https://examplebucket.s3.us-east-1.amazonaws.com/test.txt");
    const first = createAwsSigV4PresignedUrl({
      credential: {
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      },
      method: "GET",
      url,
      region: "us-east-1",
      expiresSeconds: 86400,
      now: new Date("2013-05-24T00:00:00Z"),
    });
    const parsed = new URL(first);

    expect(parsed.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(parsed.searchParams.get("X-Amz-Credential")).toBe("AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request");
    expect(parsed.searchParams.get("X-Amz-Date")).toBe("20130524T000000Z");
    expect(parsed.searchParams.get("X-Amz-Expires")).toBe("86400");
    expect(parsed.searchParams.get("X-Amz-SignedHeaders")).toBe("host");
    expect(parsed.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);

    const second = createAwsSigV4PresignedUrl({
      credential: {
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      },
      method: "GET",
      url: new URL("https://examplebucket.s3.us-east-1.amazonaws.com/test.txt"),
      region: "us-east-1",
      expiresSeconds: 86400,
      now: new Date("2013-05-24T00:00:00Z"),
    });
    expect(second).toBe(first);
  });

  it("encodes reserved characters with RFC 3986 rules", () => {
    expect(encodeRfc3986("file!'()*")).toBe("file%21%27%28%29%2A");
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
});
