import { afterEach, describe, expect, it } from "vitest";
import { setPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { normalizeBaseUrl } from "./executors.ts";

afterEach(() => setPrivateNetworkAccessAllowed(false));

describe("normalizeBaseUrl", () => {
  it("allows private instances only with the deployment opt-in", () => {
    expect(() => normalizeBaseUrl("https://10.0.0.5")).toThrow("private or reserved IP addresses");

    setPrivateNetworkAccessAllowed(true);

    expect(normalizeBaseUrl("https://10.0.0.5")).toBe("https://10.0.0.5");
  });

  it("rejects reserved metadata targets even with the deployment opt-in", () => {
    setPrivateNetworkAccessAllowed(true);

    expect(() => normalizeBaseUrl("https://169.254.169.254")).toThrow("private or reserved IP addresses");
  });

  it("rejects embedded credentials", () => {
    expect(() => normalizeBaseUrl("https://api-key@example.easy8.com")).toThrow("must not include credentials");
  });
});
