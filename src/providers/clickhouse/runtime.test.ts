import { afterEach, describe, expect, it } from "vitest";
import { setPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { normalizeClickhouseBaseUrl } from "./runtime.ts";

afterEach(() => setPrivateNetworkAccessAllowed(false));

describe("normalizeClickhouseBaseUrl", () => {
  it("allows a public host", () => {
    expect(normalizeClickhouseBaseUrl("https://clickhouse.example.com:8443")).toBe(
      "https://clickhouse.example.com:8443/",
    );
  });

  it("allows private instances only with the deployment opt-in", () => {
    expect(() => normalizeClickhouseBaseUrl("https://10.0.0.5:8443")).toThrow("private or reserved IP addresses");

    setPrivateNetworkAccessAllowed(true);

    expect(normalizeClickhouseBaseUrl("https://10.0.0.5:8443")).toBe("https://10.0.0.5:8443/");
  });

  it("rejects reserved metadata and IPv6 targets even with the deployment opt-in", () => {
    setPrivateNetworkAccessAllowed(true);

    expect(() => normalizeClickhouseBaseUrl("https://169.254.169.254")).toThrow("private or reserved IP addresses");
    expect(() => normalizeClickhouseBaseUrl("http://[::ffff:169.254.169.254]/")).toThrow("IPv6");
    expect(() => normalizeClickhouseBaseUrl("https://metadata.google.internal")).toThrow("cloud metadata hosts");
  });
});
