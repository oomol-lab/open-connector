import type { AliyunSlsActionContext } from "./runtime.ts";

import { describe, expect, it, vi } from "vitest";
import { parseAliyunSlsCredential } from "./resources.ts";
import { aliyunSlsActionHandlers, requestAliyunSlsJson, validateAliyunSlsCredential } from "./runtime.ts";
import { aliyunSlsUtf8Bytes } from "./signing.ts";

const defaultEndpoint = "cn-hangzhou.log.aliyuncs.com";
const fixedDate = new Date("2024-02-03T04:05:06Z");

describe("Alibaba Cloud SLS runtime", () => {
  it("lists Projects through the bare regional host with signed official pagination", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({
        count: 1,
        total: 1,
        projects: [project("project-a", "cn-hangzhou")],
      }),
    );
    const output = await aliyunSlsActionHandlers.list_projects(
      {
        offset: 0,
        size: 10,
        projectName: "project",
        resourceGroupId: "rg-1",
      },
      context(fetchMock),
    );

    const [requestUrl, requestInit] = fetchMock.mock.calls[0]!;
    expect(requestUrl).toBe(
      "https://cn-hangzhou.log.aliyuncs.com/?offset=0&projectName=project&resourceGroupId=rg-1&size=10",
    );
    const headers = new Headers(requestInit?.headers);
    expect(headers.get("date")).toBe("Sat, 03 Feb 2024 04:05:06 GMT");
    expect(headers.get("x-log-bodyrawsize")).toBe("0");
    expect(headers.get("authorization")).toMatch(/^LOG access-key:/);
    expect(output).toMatchObject({
      endpoint: defaultEndpoint,
      count: 1,
      total: 1,
      projects: [
        {
          endpoint: defaultEndpoint,
          projectName: "project-a",
          region: "cn-hangzhou",
          recycleBinEnabled: false,
        },
      ],
    });
  });

  it("filters scoped Projects and Logstores and uses the Project host", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/") {
        return jsonResponse({
          count: 2,
          total: 2,
          projects: [project("project-a", "cn-hangzhou"), project("project-b", "cn-hangzhou")],
        });
      }
      return jsonResponse({ count: 3, total: 3, logstores: ["application", "audit", "other"] });
    });
    const scopedContext = context(fetchMock, {
      resourceScope: '[{"project":"project-a","logstores":["application","audit"]}]',
    });

    const projects = await aliyunSlsActionHandlers.list_projects({}, scopedContext);
    expect(projects).toMatchObject({ count: 1, total: 1 });
    expect((projects as { projects: unknown[] }).projects).toHaveLength(1);

    const logstores = await aliyunSlsActionHandlers.list_logstores(
      { logstoreName: "a", offset: 0, size: 20 },
      scopedContext,
    );
    expect(fetchMock.mock.calls[1]![0]).toBe(
      "https://project-a.cn-hangzhou.log.aliyuncs.com/logstores?logstoreName=a&offset=0&size=500",
    );
    expect(logstores).toEqual({
      endpoint: defaultEndpoint,
      project: "project-a",
      count: 2,
      total: 2,
      logstores: ["application", "audit"],
    });
  });

  it("filters scoped Projects and Logstores before applying caller pagination", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const offset = url.searchParams.get("offset");
      if (url.pathname === "/") {
        return offset === "0"
          ? jsonResponse({ count: 1, total: 2, projects: [project("project-b", "cn-hangzhou")] })
          : jsonResponse({ count: 1, total: 2, projects: [project("project-a", "cn-hangzhou")] });
      }
      return offset === "0"
        ? jsonResponse({ count: 1, total: 2, logstores: ["other"] })
        : jsonResponse({ count: 1, total: 2, logstores: ["audit"] });
    });
    const scopedContext = context(fetchMock, {
      resourceScope: '[{"project":"project-a","logstores":["audit"]}]',
    });

    const projects = await aliyunSlsActionHandlers.list_projects({ offset: 0, size: 1 }, scopedContext);
    expect(projects).toMatchObject({ count: 1, total: 1 });
    expect((projects as { projects: Array<{ projectName: string }> }).projects[0]?.projectName).toBe("project-a");

    const logstores = await aliyunSlsActionHandlers.list_logstores({ offset: 0, size: 1 }, scopedContext);
    expect(logstores).toEqual({
      endpoint: defaultEndpoint,
      project: "project-a",
      count: 1,
      total: 1,
      logstores: ["audit"],
    });
    expect(fetchMock.mock.calls.map(([input]) => new URL(String(input)).searchParams.get("offset"))).toEqual([
      "0",
      "1",
      "0",
      "1",
    ]);
  });

  it("queries logs with inferred scope, official defaults, and stable response fields", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse([{ __time__: "1700000000", level: "error" }], 200, {
        "x-log-progress": "Complete",
        "x-log-processed-rows": "17",
        "x-log-elapsed-millisecond": "25",
        "x-log-has-sql": "false",
      }),
    );
    const scopedContext = context(fetchMock, {
      resourceScope: '[{"project":"project-a","logstores":["application"]}]',
      securityToken: "temporary-token",
    });
    const output = await aliyunSlsActionHandlers.query_logs(
      {
        from: 1_700_000_000,
        to: 1_700_000_900,
        query: "status:500",
        reverse: true,
        powerSql: true,
      },
      scopedContext,
    );

    expect(fetchMock.mock.calls[0]![0]).toBe(
      "https://project-a.cn-hangzhou.log.aliyuncs.com/logstores/application?from=1700000000&line=100&offset=0&powerSql=true&query=status%3A500&reverse=true&to=1700000900&type=log",
    );
    const headers = new Headers(fetchMock.mock.calls[0]![1]?.headers);
    expect(headers.get("x-acs-security-token")).toBe("temporary-token");
    expect(output).toEqual({
      endpoint: defaultEndpoint,
      project: "project-a",
      logstore: "application",
      progress: "Complete",
      count: 1,
      processedRows: 17,
      elapsedMilliseconds: 25,
      hasSql: false,
      logs: [{ __time__: "1700000000", level: "error" }],
    });
  });

  it("normalizes histogram intervals and totals", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(
        [
          { from: 100, to: 150, count: 2, progress: "Complete" },
          { from: 150, to: 200, count: 3, progress: "Complete" },
        ],
        200,
        { "x-log-progress": "Complete" },
      ),
    );
    const output = await aliyunSlsActionHandlers.get_histograms(
      {
        project: "project-a",
        logstore: "application",
        from: 100,
        to: 200,
        query: "level:error",
      },
      context(fetchMock),
    );

    expect(fetchMock.mock.calls[0]![0]).toBe(
      "https://project-a.cn-hangzhou.log.aliyuncs.com/logstores/application?from=100&query=level%3Aerror&to=200&type=histogram",
    );
    expect(output).toMatchObject({
      progress: "Complete",
      count: 5,
      histograms: [
        { from: 100, to: 150, count: 2, progress: "Complete" },
        { from: 150, to: 200, count: 3, progress: "Complete" },
      ],
    });
  });

  it("sends the same final POST bytes used by signing", async () => {
    const bodyBytes = aliyunSlsUtf8Bytes('{"query":"状态"}');
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse({ ok: true }));
    await requestAliyunSlsJson(context(fetchMock), {
      operation: "test POST",
      endpoint: defaultEndpoint,
      project: "project-a",
      method: "POST",
      path: "/logstores/application/logs",
      headers: { "content-type": "application/json" },
      bodyBytes,
    });

    const init = fetchMock.mock.calls[0]![1]!;
    expect(init.redirect).toBe("error");
    expect(new Uint8Array(await new Response(init.body).arrayBuffer())).toEqual(bodyBytes);
    const headers = new Headers(init.headers);
    expect(headers.get("content-md5")).toBe("EF2643B9A23580637AD32EAE4284DD9C");
    expect(headers.get("x-log-bodyrawsize")).toBe("18");
  });

  it("rejects non-SLS request targets before credentials can be sent", async () => {
    const fetchMock = vi.fn();
    await expect(
      requestAliyunSlsJson(context(fetchMock), {
        operation: "unsafe request",
        endpoint: "example.com",
        method: "GET",
        path: "/",
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an unsafe Project authority before credentials can be sent", async () => {
    const fetchMock = vi.fn();
    await expect(
      requestAliyunSlsJson(context(fetchMock), {
        operation: "unsafe request",
        endpoint: defaultEndpoint,
        project: "example.com@attacker.example/path",
        method: "GET",
        path: "/",
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("paginates every supplied region and deduplicates by region and Project name", async () => {
    const seenOffsets: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const offset = url.searchParams.get("offset")!;
      seenOffsets.push(`${url.hostname}:${offset}`);
      if (url.hostname === "cn-a.log.aliyuncs.com" && offset === "0") {
        return jsonResponse({
          count: 1,
          total: 2,
          projects: [project("shared-project", "region-a")],
        });
      }
      if (url.hostname === "cn-a.log.aliyuncs.com") {
        return jsonResponse({
          count: 1,
          total: 2,
          projects: [project("last-project", "region-a")],
        });
      }
      return jsonResponse({
        count: 1,
        total: 1,
        projects: [project("shared-project", "region-a")],
      });
    });
    const output = await aliyunSlsActionHandlers.list_projects_across_regions(
      { endpoints: ["cn-a.log.aliyuncs.com", "cn-b.log.aliyuncs.com"] },
      context(fetchMock, {
        resourceScope: JSON.stringify([
          { endpoint: "cn-a.log.aliyuncs.com", project: "shared-project" },
          { endpoint: "cn-a.log.aliyuncs.com", project: "last-project" },
          { endpoint: "cn-b.log.aliyuncs.com", project: "shared-project" },
        ]),
      }),
    );

    expect(seenOffsets).toContain("cn-a.log.aliyuncs.com:1");
    expect(output).toMatchObject({
      total: 2,
      complete: true,
      failures: [],
      regions: [
        { endpoint: "cn-a.log.aliyuncs.com", count: 2 },
        { endpoint: "cn-b.log.aliyuncs.com", count: 1 },
      ],
    });
  });

  it("limits regional concurrency", async () => {
    let active = 0;
    let maximumActive = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      const hostname = new URL(String(input)).hostname;
      return jsonResponse({ count: 1, total: 1, projects: [project(hostname.split(".")[0]!, hostname)] });
    });
    const endpoints = Array.from({ length: 8 }, (_, index) => `cn-${index + 1}.log.aliyuncs.com`);
    await aliyunSlsActionHandlers.list_projects_across_regions({ endpoints }, context(fetchMock));

    expect(maximumActive).toBeGreaterThan(1);
    expect(maximumActive).toBeLessThanOrEqual(5);
  });

  it("fails all regions by default and reports failures when allowPartial is true", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const hostname = new URL(String(input)).hostname;
      if (hostname.startsWith("cn-fail")) {
        return jsonResponse({ errorCode: "Unauthorized", errorMessage: "RAM denied" }, 403);
      }
      return jsonResponse({ count: 1, total: 1, projects: [project("project-a", "region-a")] });
    });
    const input = { endpoints: ["cn-ok.log.aliyuncs.com", "cn-fail.log.aliyuncs.com"] };
    await expect(aliyunSlsActionHandlers.list_projects_across_regions(input, context(fetchMock))).rejects.toMatchObject(
      { status: 403 },
    );

    const partial = await aliyunSlsActionHandlers.list_projects_across_regions(
      { ...input, allowPartial: true },
      context(fetchMock),
    );
    expect(partial).toMatchObject({
      total: 1,
      complete: false,
      regions: [{ endpoint: "cn-ok.log.aliyuncs.com", count: 1 }],
      failures: [{ endpoint: "cn-fail.log.aliyuncs.com", status: 403 }],
    });
  });

  it.each([
    [400, "InvalidAccessKeyId", 401],
    [403, "Unauthorized", 403],
    [400, "Throttling", 429],
  ])("maps SLS %s %s errors to status %s", async (httpStatus, errorCode, expectedStatus) => {
    const fetchMock = vi.fn(async () => jsonResponse({ errorCode, errorMessage: "provider message" }, httpStatus));
    await expect(aliyunSlsActionHandlers.list_projects({}, context(fetchMock))).rejects.toMatchObject({
      status: expectedStatus,
      message: expect.stringContaining(errorCode),
    });
  });

  it("rejects invalid JSON from a successful provider response", async () => {
    const fetchMock = vi.fn(async () => new Response("not-json", { status: 200 }));
    await expect(aliyunSlsActionHandlers.list_projects({}, context(fetchMock))).rejects.toMatchObject({
      status: 502,
      message: expect.stringContaining("invalid JSON"),
    });
  });

  it.each([
    [
      "a count greater than the requested size",
      { count: 501, total: 501, projects: [project("project-a", "region-a")] },
      "exceeds requested size",
    ],
    [
      "a count that does not match the returned array",
      { count: 2, total: 2, projects: [project("project-a", "region-a")] },
      "does not match",
    ],
    ["an empty page before total completion", { count: 0, total: 1, projects: [] }, "empty page"],
    [
      "a total above the collection item ceiling",
      { count: 1, total: 10_001, projects: [project("project-a", "region-a")] },
      "item limit",
    ],
  ])("rejects regional pagination with %s", async (_name, response, message) => {
    const fetchMock = vi.fn(async () => jsonResponse(response));
    await expect(
      aliyunSlsActionHandlers.list_projects_across_regions(
        { endpoints: ["cn-hangzhou.log.aliyuncs.com"] },
        context(fetchMock),
      ),
    ).rejects.toMatchObject({ status: 502, message: expect.stringContaining(message) });
  });

  it("rejects regional pagination when total changes between pages", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const offset = new URL(String(input)).searchParams.get("offset");
      return offset === "0"
        ? jsonResponse({ count: 1, total: 2, projects: [project("project-a", "region-a")] })
        : jsonResponse({ count: 1, total: 3, projects: [project("project-b", "region-a")] });
    });
    await expect(
      aliyunSlsActionHandlers.list_projects_across_regions(
        { endpoints: ["cn-hangzhou.log.aliyuncs.com"] },
        context(fetchMock),
      ),
    ).rejects.toMatchObject({ status: 502, message: expect.stringContaining("total changed") });
  });

  it("rejects regional pagination that exceeds the page ceiling", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const offset = Number(new URL(String(input)).searchParams.get("offset"));
      return jsonResponse({
        count: 1,
        total: 21,
        projects: [project(`project-${offset}`, "region-a")],
      });
    });
    await expect(
      aliyunSlsActionHandlers.list_projects_across_regions(
        { endpoints: ["cn-hangzhou.log.aliyuncs.com"] },
        context(fetchMock),
      ),
    ).rejects.toMatchObject({ status: 502, message: expect.stringContaining("page pagination limit") });
    expect(fetchMock).toHaveBeenCalledTimes(20);
  });

  it("validates credential structure without requiring ListProject permission", () => {
    const result = validateAliyunSlsCredential({
      accessKeyId: "access-key",
      accessKeySecret: "secret-key",
      endpoint: defaultEndpoint,
      resourceScope: '[{"endpoint":"cn-shanghai.log.aliyuncs.com","project":"project-a","logstores":["application"]}]',
    });

    expect(result).toEqual({
      profile: {
        accountId: "access-key",
        displayName: "access-key@cn-hangzhou.log.aliyuncs.com",
      },
      grantedScopes: [],
    });
  });
});

function context(
  fetchMock: ReturnType<typeof vi.fn>,
  values: { resourceScope?: string; securityToken?: string } = {},
): AliyunSlsActionContext {
  return {
    credential: parseAliyunSlsCredential({
      accessKeyId: "access-key",
      accessKeySecret: "secret-key",
      endpoint: defaultEndpoint,
      ...values,
    }),
    fetcher: fetchMock as unknown as typeof fetch,
    now: () => fixedDate,
  };
}

function jsonResponse(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      ...Object.fromEntries(new Headers(headers).entries()),
    },
  });
}

function project(projectName: string, region: string): Record<string, unknown> {
  return {
    projectName,
    region,
    description: `${projectName} description`,
    status: "Normal",
    createTime: "2024-01-01 00:00:00",
    lastModifyTime: "2024-01-02 00:00:00",
    resourceGroupId: "rg-1",
    dataRedundancyType: "LRS",
    recycleBinEnabled: false,
    internetEndpoint: "",
    internalEndpoint: "",
  };
}
