import { afterEach, expect, it } from "vitest";
import { setPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { createProviderFetch } from "../provider-runtime.ts";
import { credentialValidators } from "./executors.ts";

afterEach(() => setPrivateNetworkAccessAllowed(false));

it("validates credentials against an opted-in private instance", async () => {
  setPrivateNetworkAccessAllowed(true);

  const result = await credentialValidators.apiKey!(
    { apiKey: "kobo-token", values: { baseUrl: "https://10.0.0.5" } },
    {
      fetcher: createProviderFetch({
        fetch: async (url) => {
          expect(url.toString()).toBe("https://10.0.0.5/me/");
          return Response.json({ username: "alice" });
        },
      }),
    },
  );

  expect(result).toMatchObject({ profile: { accountId: "kobotoolbox:10.0.0.5:alice" } });
});
