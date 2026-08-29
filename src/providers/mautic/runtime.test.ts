import { afterEach, describe, expect, it } from "vitest";
import { setPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { createProviderFetch } from "../provider-runtime.ts";
import { credentialValidators } from "./executors.ts";
import { normalizeMauticBaseUrl } from "./runtime.ts";

afterEach(() => setPrivateNetworkAccessAllowed(false));

describe("normalizeMauticBaseUrl", () => {
  it("allows a public host and appends /api/", () => {
    expect(normalizeMauticBaseUrl("https://mautic.example.com")).toBe("https://mautic.example.com/api/");
  });

  it("allows private instances only with the deployment opt-in", () => {
    expect(() => normalizeMauticBaseUrl("https://10.0.0.5")).toThrow("private or reserved IP addresses");

    setPrivateNetworkAccessAllowed(true);

    expect(normalizeMauticBaseUrl("https://10.0.0.5")).toBe("https://10.0.0.5/api/");
  });

  it("rejects reserved metadata and IPv6 targets even with the deployment opt-in", () => {
    setPrivateNetworkAccessAllowed(true);

    expect(() => normalizeMauticBaseUrl("https://169.254.169.254")).toThrow("private or reserved IP addresses");
    expect(() => normalizeMauticBaseUrl("http://[::ffff:169.254.169.254]/")).toThrow("IPv6");
    expect(() => normalizeMauticBaseUrl("https://metadata.google.internal")).toThrow("cloud metadata hosts");
  });
});

it("validates credentials against an opted-in private instance", async () => {
  setPrivateNetworkAccessAllowed(true);

  const result = await credentialValidators.customCredential!(
    { values: { baseUrl: "https://10.0.0.5", username: "admin", password: "secret" } },
    {
      fetcher: createProviderFetch({
        fetch: async (url) => {
          expect(url.toString()).toBe("https://10.0.0.5/api/users/self");
          return Response.json({ user: { id: 1, username: "admin" } });
        },
      }),
    },
  );

  expect(result).toMatchObject({ profile: { accountId: "mautic:https://10.0.0.5/api/:1" } });
});
