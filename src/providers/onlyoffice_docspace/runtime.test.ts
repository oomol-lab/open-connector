import { afterEach, describe, expect, it } from "vitest";
import { setPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { normalizePortalUrl } from "./runtime.ts";

afterEach(() => setPrivateNetworkAccessAllowed(false));

describe("normalizePortalUrl", () => {
  it("allows a public host and returns the origin", () => {
    expect(normalizePortalUrl("https://docspace.example.com/welcome")).toBe("https://docspace.example.com");
  });

  it("allows private instances only with the deployment opt-in", () => {
    expect(() => normalizePortalUrl("https://10.0.0.5")).toThrow("private or reserved IP addresses");

    setPrivateNetworkAccessAllowed(true);

    expect(normalizePortalUrl("https://10.0.0.5")).toBe("https://10.0.0.5");
  });

  it("rejects reserved metadata and IPv6 targets even with the deployment opt-in", () => {
    setPrivateNetworkAccessAllowed(true);

    expect(() => normalizePortalUrl("https://169.254.169.254")).toThrow("private or reserved IP addresses");
    expect(() => normalizePortalUrl("http://[::ffff:169.254.169.254]/")).toThrow("IPv6");
    expect(() => normalizePortalUrl("https://metadata.google.internal")).toThrow("cloud metadata hosts");
  });
});
