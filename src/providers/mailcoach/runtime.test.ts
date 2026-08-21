import { afterEach, describe, expect, it } from "vitest";
import { setPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { normalizeMailcoachBaseUrl } from "./runtime.ts";

afterEach(() => setPrivateNetworkAccessAllowed(false));

describe("normalizeMailcoachBaseUrl", () => {
  it("allows a public host and strips the /api suffix", () => {
    expect(normalizeMailcoachBaseUrl("https://mailcoach.example.com/api")).toBe("https://mailcoach.example.com");
  });

  it("allows private instances only with the deployment opt-in", () => {
    expect(() => normalizeMailcoachBaseUrl("https://10.0.0.5")).toThrow("private or reserved IP addresses");

    setPrivateNetworkAccessAllowed(true);

    expect(normalizeMailcoachBaseUrl("https://10.0.0.5")).toBe("https://10.0.0.5");
  });

  it("rejects reserved metadata and IPv6 targets even with the deployment opt-in", () => {
    setPrivateNetworkAccessAllowed(true);

    expect(() => normalizeMailcoachBaseUrl("https://169.254.169.254")).toThrow("private or reserved IP addresses");
    expect(() => normalizeMailcoachBaseUrl("http://[::ffff:169.254.169.254]/")).toThrow("IPv6");
    expect(() => normalizeMailcoachBaseUrl("https://metadata.google.internal")).toThrow("cloud metadata hosts");
  });
});
