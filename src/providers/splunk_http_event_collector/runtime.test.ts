import { afterEach, describe, expect, it } from "vitest";
import { setPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { normalizeSplunkHecBaseUrl } from "./runtime.ts";

afterEach(() => setPrivateNetworkAccessAllowed(false));

describe("normalizeSplunkHecBaseUrl", () => {
  it("allows a public host and strips collector paths", () => {
    expect(normalizeSplunkHecBaseUrl("https://hec.example.com:8088/services/collector")).toBe(
      "https://hec.example.com:8088",
    );
  });

  it("allows private instances only with the deployment opt-in", () => {
    expect(() => normalizeSplunkHecBaseUrl("https://10.0.0.5")).toThrow("private or reserved IP addresses");

    setPrivateNetworkAccessAllowed(true);

    expect(normalizeSplunkHecBaseUrl("https://10.0.0.5")).toBe("https://10.0.0.5");
  });

  it("rejects reserved metadata and IPv6 targets even with the deployment opt-in", () => {
    setPrivateNetworkAccessAllowed(true);

    expect(() => normalizeSplunkHecBaseUrl("https://169.254.169.254")).toThrow("private or reserved IP addresses");
    expect(() => normalizeSplunkHecBaseUrl("http://[::ffff:169.254.169.254]/")).toThrow("IPv6");
    expect(() => normalizeSplunkHecBaseUrl("https://metadata.google.internal")).toThrow("cloud metadata hosts");
  });
});
