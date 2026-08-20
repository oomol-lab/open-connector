import { afterEach, describe, expect, it } from "vitest";
import { setPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { resolveHomeAssistantBaseUrl } from "./runtime.ts";

afterEach(() => setPrivateNetworkAccessAllowed(false));

describe("resolveHomeAssistantBaseUrl", () => {
  it("allows a public host", () => {
    expect(resolveHomeAssistantBaseUrl({ values: { baseUrl: "https://ha.example.com" } })).toBe(
      "https://ha.example.com",
    );
  });

  it("allows private instances only with the deployment opt-in", () => {
    expect(() => resolveHomeAssistantBaseUrl({ values: { baseUrl: "https://10.0.0.5:8123" } })).toThrow(
      "private or reserved IP addresses",
    );

    setPrivateNetworkAccessAllowed(true);

    expect(resolveHomeAssistantBaseUrl({ values: { baseUrl: "https://10.0.0.5:8123" } })).toBe("https://10.0.0.5:8123");
  });

  it("rejects reserved metadata and IPv6 targets even with the deployment opt-in", () => {
    setPrivateNetworkAccessAllowed(true);

    expect(() => resolveHomeAssistantBaseUrl({ values: { baseUrl: "https://169.254.169.254" } })).toThrow(
      "private or reserved IP addresses",
    );
    expect(() => resolveHomeAssistantBaseUrl({ values: { baseUrl: "http://[::ffff:169.254.169.254]/" } })).toThrow(
      "IPv6",
    );
    expect(() => resolveHomeAssistantBaseUrl({ values: { baseUrl: "https://metadata.google.internal" } })).toThrow(
      "cloud metadata hosts",
    );
  });
});
