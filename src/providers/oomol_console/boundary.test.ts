import { expect, it } from "vitest";
import { createOomolConsoleMemberDirectory } from "./member-directory.ts";
import { defaultEndpoints } from "./request.ts";
import { executeOomolConsoleAction } from "./runtime.ts";
const deps = { endpoints: defaultEndpoints, memberDirectory: createOomolConsoleMemberDirectory(defaultEndpoints) };
it("uses the caller API key for registry bindings without private identity headers", async () => {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json({ ok: true });
  };
  const context = { apiKey: "public-api-key", teamId: "team/one", fetcher };
  for (const name of ["add_skill_package_to_team", "remove_skill_package_from_team"] as const)
    await expect(
      executeOomolConsoleAction(name, { packageName: "@org/skill" }, context, fetcher, deps),
    ).resolves.toMatchObject({ success: true, teamId: "team/one" });
  expect(calls.map((c) => c.init?.method)).toEqual(["PUT", "DELETE"]);
  for (const c of calls) {
    expect(c.url).toBe("https://registry.oomol.com/-/oomol/packages/@org/skill/orgs/team%2Fone");
    const headers = new Headers(c.init?.headers);
    expect(headers.get("authorization")).toBe("Bearer public-api-key");
    expect(headers.has("x-oomol-user-id")).toBe(false);
  }
});
it("reads execution records through the public apps route with the selected team", async () => {
  const fetcher: typeof fetch = async (url, init) => {
    expect(String(url)).toBe("https://connector.oomol.com/v1/apps/by-id/app%2Fone/executions");
    expect(new Headers(init?.headers).get("x-oo-team-id")).toBe("team-one");
    return Response.json({ items: [] });
  };
  await expect(
    executeOomolConsoleAction(
      "list_connection_executions",
      { appId: "app/one" },
      { apiKey: "key", teamId: "team-one", fetcher },
      fetcher,
      deps,
    ),
  ).resolves.toEqual({ items: [] });
});

it("rejects billing requests without a team before making any network request", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls++;
    return Response.json({});
  };
  for (const name of ["get_billing_summary", "get_usage_breakdown"] as const) {
    await expect(executeOomolConsoleAction(name, {}, { apiKey: "key", fetcher }, fetcher, deps)).rejects.toThrow();
  }
  expect(calls).toBe(0);
});
