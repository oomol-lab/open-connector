import { describe, expect, it } from "vitest";
import { ProviderRequestError } from "../provider-runtime.ts";
import { buildBreezeBaseUrl, normalizeBreezeBaseUrl, normalizeBreezeSubdomain } from "./runtime.ts";

describe("normalizeBreezeBaseUrl", () => {
  it("accepts an https Breeze subdomain URL and strips path, query, and port", () => {
    expect(normalizeBreezeBaseUrl("https://mychurch.breezechms.com")).toBe("https://mychurch.breezechms.com");
    expect(normalizeBreezeBaseUrl("https://mychurch.breezechms.com/api/people?x=1")).toBe(
      "https://mychurch.breezechms.com",
    );
    expect(normalizeBreezeBaseUrl("https://mychurch.breezechms.com:8443/path")).toBe("https://mychurch.breezechms.com");
  });

  it("normalizes hostnames the shared public-URL guard normalizes", () => {
    expect(normalizeBreezeBaseUrl("https://MyChurch.BreezeChms.com")).toBe("https://mychurch.breezechms.com");
    expect(normalizeBreezeBaseUrl("https://mychurch.breezechms.com.")).toBe("https://mychurch.breezechms.com");
  });

  it("rejects non-https and non-Breeze hosts", () => {
    expect(normalizeBreezeBaseUrl("http://mychurch.breezechms.com")).toBeUndefined();
    expect(normalizeBreezeBaseUrl("https://example.com")).toBeUndefined();
    expect(normalizeBreezeBaseUrl("https://evilbreezechms.com")).toBeUndefined();
    expect(normalizeBreezeBaseUrl("https://breezechms.com.attacker.example")).toBeUndefined();
  });

  it("rejects values the shared public-URL guard blocks", () => {
    expect(normalizeBreezeBaseUrl("ftp://mychurch.breezechms.com")).toBeUndefined();
    expect(normalizeBreezeBaseUrl("https://localhost")).toBeUndefined();
    expect(normalizeBreezeBaseUrl("https://169.254.169.254")).toBeUndefined();
    expect(normalizeBreezeBaseUrl("not a url")).toBeUndefined();
  });

  it("returns undefined for missing values", () => {
    expect(normalizeBreezeBaseUrl(undefined)).toBeUndefined();
    expect(normalizeBreezeBaseUrl("")).toBeUndefined();
    expect(normalizeBreezeBaseUrl(42)).toBeUndefined();
  });
});

describe("normalizeBreezeSubdomain", () => {
  it("accepts plain subdomains and lowercases them", () => {
    expect(normalizeBreezeSubdomain("MyChurch")).toBe("mychurch");
    expect(normalizeBreezeSubdomain("my-church2")).toBe("my-church2");
  });

  it("accepts full Breeze URLs and hostnames", () => {
    expect(normalizeBreezeSubdomain("https://mychurch.breezechms.com")).toBe("mychurch");
    expect(normalizeBreezeSubdomain("mychurch.breezechms.com")).toBe("mychurch");
  });

  it("rejects empty and malformed values", () => {
    expect(() => normalizeBreezeSubdomain(undefined)).toThrow(ProviderRequestError);
    expect(() => normalizeBreezeSubdomain("   ")).toThrow(ProviderRequestError);
    expect(() => normalizeBreezeSubdomain("bad subdomain!")).toThrow(ProviderRequestError);
    expect(() => normalizeBreezeSubdomain("https://")).toThrow(ProviderRequestError);
  });
});

describe("buildBreezeBaseUrl", () => {
  it("builds the canonical Breeze base URL", () => {
    expect(buildBreezeBaseUrl("mychurch")).toBe("https://mychurch.breezechms.com");
  });
});
