import { afterEach, describe, expect, it } from "vitest";
import { setPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { normalizeGongApiBaseUrl } from "./runtime.ts";

afterEach(() => setPrivateNetworkAccessAllowed(false));

describe("normalizeGongApiBaseUrl", () => {
  it("rejects private tenant URLs even when private-network access is enabled", () => {
    setPrivateNetworkAccessAllowed(true);

    expect(() => normalizeGongApiBaseUrl("https://10.0.0.5")).toThrow("private or reserved IP addresses");
  });

  it("rejects cloud metadata hosts even when private-network access is enabled", () => {
    setPrivateNetworkAccessAllowed(true);

    expect(() => normalizeGongApiBaseUrl("https://metadata")).toThrow("cloud metadata hosts");
  });
});
