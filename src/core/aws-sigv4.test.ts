import { describe, expect, it } from "vitest";
import {
  buildCanonicalHeaders,
  canonicalizeSearchParams,
  createAwsSigV4PresignedUrl,
  encodeRfc3986,
  sha256Hex,
} from "./aws-sigv4.ts";

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

  it("collapses tabs and repeated spaces in header values", () => {
    const headers = new Headers({
      "content-type": "text/plain; \t charset=utf-8",
      "x-amz-meta-note": "  leading and\ttrailing  ",
    });

    expect(buildCanonicalHeaders(headers)).toEqual({
      "content-type": "text/plain; charset=utf-8",
      "x-amz-meta-note": "leading and trailing",
    });
  });

  it("signs collapsible header whitespace the same as the single-space form", () => {
    const presign = (contentType: string): string =>
      createAwsSigV4PresignedUrl({
        credential: {
          accessKeyId: "AKIAIOSFODNN7EXAMPLE",
          secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        },
        method: "PUT",
        url: new URL("https://examplebucket.s3.us-east-1.amazonaws.com/test.txt"),
        region: "us-east-1",
        expiresSeconds: 3600,
        headers: { "content-type": contentType },
        now: new Date("2013-05-24T00:00:00Z"),
      });
    const expected = presign("text/plain; charset=utf-8");

    expect(presign("text/plain;\tcharset=utf-8")).toBe(expected);
    expect(presign("text/plain;  charset=utf-8")).toBe(expected);
    expect(presign("  text/plain; \t \t charset=utf-8  ")).toBe(expected);
  });

  it("sorts canonical headers and query parameters by code point", () => {
    const headers = new Headers({
      content_type: "underscore",
      "content-type": "hyphen",
      host: "example.com",
    });

    // Code point order puts "-" (0x2D) before "_" (0x5F); `localeCompare` reverses them.
    expect(Object.keys(buildCanonicalHeaders(headers))).toEqual(["content-type", "content_type", "host"]);

    const query = new URLSearchParams([
      ["content_type", "1"],
      ["content-type", "2"],
      ["a", "3"],
      ["Z", "4"],
    ]);

    // "Z" (0x5A) sorts before "a" (0x61) in code point order; `localeCompare` reverses that too.
    expect(canonicalizeSearchParams(query)).toBe("Z=4&a=3&content-type=2&content_type=1");
  });

  it("emits the signed canonical query verbatim", () => {
    const signed = createAwsSigV4PresignedUrl({
      credential: {
        accessKeyId: "AK~IAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        sessionToken: "AQoDYXdzEJr//////////wEaABC+de/f0g==",
      },
      method: "GET",
      url: new URL("https://examplebucket.s3.us-east-1.amazonaws.com/test.txt"),
      region: "us-east-1",
      expiresSeconds: 3600,
      now: new Date("2013-05-24T00:00:00Z"),
    });
    const search = new URL(signed).search;
    const parameters = search.slice(1).split("&");
    const signature = parameters.at(-1) ?? "";
    const canonicalQuery = canonicalizeSearchParams(
      new URLSearchParams([
        ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
        ["X-Amz-Credential", "AK~IAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request"],
        ["X-Amz-Date", "20130524T000000Z"],
        ["X-Amz-Expires", "3600"],
        ["X-Amz-SignedHeaders", "host"],
        ["X-Amz-Security-Token", "AQoDYXdzEJr//////////wEaABC+de/f0g=="],
      ]),
    );

    expect(parameters.slice(0, -1).join("&")).toBe(canonicalQuery);
    expect(signature).toMatch(/^X-Amz-Signature=[0-9a-f]{64}$/);
    // `~` is unreserved in RFC 3986, so it must stay literal rather than become %7E.
    expect(search).toContain("AK~IAIOSFODNN7EXAMPLE");
    expect(search).not.toContain("%7E");
    // `+`, `/`, and `=` in the session token stay percent-encoded, not form-urlencoded.
    expect(search).toContain("X-Amz-Security-Token=AQoDYXdzEJr%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaABC%2Bde%2Ff0g%3D%3D");
  });
});
