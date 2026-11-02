import { describe, expect, it } from "vitest";
import { grafanaCloudActionHandlers, validateGrafanaCloudCredential } from "./runtime.ts";

// Grafana answers 409 "Unexpected parameter" for any query parameter this endpoint does not define.
function instancesFetcher(requests: string[]): typeof fetch {
  return async (url) => {
    requests.push(String(url));
    if (new URL(String(url)).search)
      return Response.json({ code: "InvalidArgument", message: "Unexpected parameter" }, { status: 409 });
    return Response.json({
      items: [
        { id: 7, slug: "acme", name: "Acme", orgSlug: "acme-org", orgName: "Acme Inc" },
        { id: 8, slug: "beta", name: "Beta", orgSlug: "acme-org", orgName: "Acme Inc" },
      ],
      orderBy: "name",
      direction: "asc",
      total: 2,
      pages: 1,
      pageSize: 1000000,
      page: 1,
    });
  };
}

describe("Grafana Cloud organization instances", () => {
  it("validates a credential with the instances endpoint and no query parameters", async () => {
    const requests: string[] = [];
    const result = await validateGrafanaCloudCredential(
      "glc_token",
      { orgSlug: "acme-org" },
      instancesFetcher(requests),
    );

    expect(requests).toEqual(["https://grafana.com/api/orgs/acme-org/instances"]);
    expect(result).toMatchObject({
      profile: { accountId: "grafana_cloud:acme-org", displayName: "Acme Inc" },
      metadata: { stackCount: 2, firstStackSlug: "acme" },
    });
  });

  it("lists every stack in one request", async () => {
    const requests: string[] = [];
    const result = await grafanaCloudActionHandlers.list_stacks(
      {},
      { apiKey: "glc_token", orgSlug: "acme-org", fetcher: instancesFetcher(requests) },
    );

    expect(requests).toEqual(["https://grafana.com/api/orgs/acme-org/instances"]);
    expect(result).toMatchObject({
      stacks: [
        { id: 7, slug: "acme", name: "Acme" },
        { id: 8, slug: "beta", name: "Beta" },
      ],
      raw: { total: 2 },
    });
    // The endpoint has no pagination, so the response carries no cursor fields.
    expect(Object.keys(result as object)).toEqual(["stacks", "raw"]);
  });
});
