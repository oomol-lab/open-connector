import { afterEach, describe, expect, it } from "vitest";
import { setPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { normalizeBtcpayBaseUrl } from "./runtime.ts";

afterEach(() => setPrivateNetworkAccessAllowed(false));

describe("normalizeBtcpayBaseUrl", () => {
  it("allows a public host and strips the Greenfield API suffix", () => {
    expect(normalizeBtcpayBaseUrl("https://btcpay.example.com/api/v1")).toBe("https://btcpay.example.com");
  });

  it("allows private instances only with the deployment opt-in", () => {
    expect(() => normalizeBtcpayBaseUrl("https://10.0.0.5")).toThrow("private or reserved IP addresses");

    setPrivateNetworkAccessAllowed(true);

    expect(normalizeBtcpayBaseUrl("https://10.0.0.5")).toBe("https://10.0.0.5");
  });

  it("rejects reserved metadata and IPv6 targets even with the deployment opt-in", () => {
    setPrivateNetworkAccessAllowed(true);

    expect(() => normalizeBtcpayBaseUrl("https://169.254.169.254")).toThrow("private or reserved IP addresses");
    expect(() => normalizeBtcpayBaseUrl("http://[::ffff:169.254.169.254]/")).toThrow("IPv6");
    expect(() => normalizeBtcpayBaseUrl("https://metadata.google.internal")).toThrow("cloud metadata hosts");
  });
});
