import { afterEach, describe, expect, it } from "vitest";
import {
  assertPublicHttpUrl,
  isPrivateNetworkAccessAllowed,
  parsePrivateNetworkAccessFlag,
  setPrivateNetworkAccessAllowed,
} from "./request.ts";

describe("assertPublicHttpUrl", () => {
  it("canonicalizes public hostnames with trailing dots", () => {
    expect(readPublicUrl("https://example.com./path").host).toBe("example.com");
  });

  it("rejects local hostnames with trailing dots", () => {
    expect(() => readPublicUrl("https://localhost./")).toThrow("target local hosts");
  });

  it("rejects local and private IPv4 address forms normalized by URL parsing", () => {
    for (const value of ["https://127.1/", "https://0177.0.0.1/", "https://2130706433/", "https://10.0.0.1/"]) {
      expect(() => readPublicUrl(value)).toThrow("private or reserved IP addresses");
    }
  });

  it("rejects internal hostname suffixes", () => {
    for (const value of [
      "https://router.local/",
      "https://service.internal/",
      "https://nas.lan/",
      "https://box.home/",
    ]) {
      expect(() => readPublicUrl(value)).toThrow("target local hosts");
    }
  });

  it("rejects known cloud metadata hostnames even when private networks are allowed", () => {
    for (const value of [
      "http://instance-data.ec2.internal/",
      "http://metadata.google.internal/",
      "http://metadata.google.internal./",
      "http://metadata.goog/",
    ]) {
      expect(() => readPublicUrl(value, true)).toThrow("cloud metadata hosts");
    }
  });

  it("rejects IPv6 targets", () => {
    expect(() => readPublicUrl("https://[::1]/")).toThrow("target IPv6 addresses");
  });

  it("allows explicitly trusted private and overlay network targets", () => {
    for (const value of [
      "http://10.0.0.1:3000/",
      "http://100.64.0.1:3000/",
      "http://172.16.0.1:3000/",
      "http://192.168.0.1:3000/",
      "https://192.168.0.1:3000/",
      "http://dokploy.internal:3000/",
      "http://router.local:3000/",
      "http://box.home:3000/",
      "http://nas.lan:3000/",
    ]) {
      expect(readPublicUrl(value, true).toString()).toBe(value);
    }
  });

  it("keeps unsafe targets blocked when private networks are allowed", () => {
    for (const value of [
      "http://localhost:3000/",
      "http://service.localhost:3000/",
      "http://127.0.0.1:3000/",
      "http://100.100.100.200/",
      "http://169.254.169.254/",
      "http://224.0.0.1/",
      "http://[fd7a:115c:a1e0::1]/",
    ]) {
      expect(() => readPublicUrl(value, true)).toThrow();
    }
  });
});

describe("private network access deployment flag", () => {
  afterEach(() => setPrivateNetworkAccessAllowed(false));

  it("is disabled by default", () => {
    expect(isPrivateNetworkAccessAllowed()).toBe(false);
  });

  it("reflects the configured value", () => {
    setPrivateNetworkAccessAllowed(true);
    expect(isPrivateNetworkAccessAllowed()).toBe(true);
    setPrivateNetworkAccessAllowed(false);
    expect(isPrivateNetworkAccessAllowed()).toBe(false);
  });

  it("parses only explicit truthy env values", () => {
    for (const value of ["1", "true", "TRUE", "yes", "on", " True "]) {
      expect(parsePrivateNetworkAccessFlag(value)).toBe(true);
    }
    for (const value of [undefined, "", "0", "false", "no", "off", "disabled"]) {
      expect(parsePrivateNetworkAccessFlag(value)).toBe(false);
    }
  });
});

function readPublicUrl(value: string, allowPrivateNetwork = false): URL {
  return assertPublicHttpUrl(value, {
    fieldName: "url",
    createError: (message) => new Error(message),
    allowPrivateNetwork,
  });
}
