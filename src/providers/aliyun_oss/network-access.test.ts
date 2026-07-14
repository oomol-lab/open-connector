import { afterEach, describe, expect, it } from "vitest";
import { setPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { credentialValidators } from "./executors.ts";

// Endpoint SSRF validation runs before any network call, so blocked endpoints
// reject synchronously without reaching the ali-oss SDK. Reset the deployment
// flag after each case so state never leaks.
afterEach(() => setPrivateNetworkAccessAllowed(false));

function validateEndpoint(endpoint: string): Promise<unknown> {
  return credentialValidators.customCredential!(
    { values: { accessKeyId: "id", accessKeySecret: "secret", endpoint } },
    { fetcher: fetch },
  );
}

describe("aliyun_oss endpoint SSRF guard", () => {
  it("blocks private endpoints by default", async () => {
    await expect(validateEndpoint("https://10.0.0.5")).rejects.toThrow(/private or reserved/u);
  });

  it("keeps cloud-metadata hostnames blocked even when private networks are allowed", async () => {
    setPrivateNetworkAccessAllowed(true);
    for (const endpoint of ["https://metadata.google.internal", "https://instance-data.ec2.internal"]) {
      await expect(validateEndpoint(endpoint)).rejects.toThrow(/cloud metadata/u);
    }
  });

  it("keeps IPv6 loopback and link-local endpoints blocked even when private networks are allowed", async () => {
    setPrivateNetworkAccessAllowed(true);
    for (const endpoint of ["https://[::1]", "https://[fe80::1]"]) {
      await expect(validateEndpoint(endpoint)).rejects.toThrow(/IPv6/u);
    }
  });
});
