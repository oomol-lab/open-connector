import type { ExecutionContext } from "../../core/types.ts";

import { afterEach, expect, test, vi } from "vitest";
import { credentialValidators, executors } from "./executors.ts";
import { pollBaobiaoSearchQuery, requestBaobiao } from "./runtime.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonFetcher(...payloads: unknown[]) {
  const fetcher = vi.fn<typeof fetch>();
  for (const payload of payloads) fetcher.mockResolvedValueOnce(Response.json(payload));
  return fetcher;
}

test("requestBaobiao sends the key as a query parameter and accepts code and state envelopes", async () => {
  const fetcher = jsonFetcher({ code: 200, data: { total: 1 } }, { state: 1, data: { projectID: 7 } });
  const context = { apiKey: "secret", fetcher };

  await expect(requestBaobiao(context, { path: "/bid/searchProjectApi", body: { pageId: 1 } })).resolves.toMatchObject({
    data: { total: 1 },
  });
  await expect(
    requestBaobiao(context, { path: "/bid/getZTBProjectFiles", body: { projectId: 7, publishTime: "x" }, form: true }),
  ).resolves.toMatchObject({ data: { projectID: 7 } });

  const [jsonUrl, jsonInit] = fetcher.mock.calls[0]!;
  expect(String(jsonUrl)).toBe("https://gate.gov-bid.com/outer-gateway/bid/searchProjectApi?key=secret");
  expect(jsonInit?.body).toBe('{"pageId":1}');
  const formInit = fetcher.mock.calls[1]![1];
  expect(new Headers(formInit?.headers).get("content-type")).toBeNull();
  expect(Object.fromEntries(formInit?.body as FormData)).toEqual({ projectId: "7", publishTime: "x" });
});

test("requestBaobiao maps gateway business failures to stable statuses", async () => {
  const fetcher = jsonFetcher(
    { code: 403, subCode: "0100590001", subMsg: "未提供有效网关 Key 或 Key 无效" },
    { code: 403, subCode: "0100000001", msg: "无权调用该接口!" },
    {
      code: -1,
      subCode: "0100590005",
      msg: "无权限调用该接口!",
      subMsg: "帐号接口未授权或额度、余额不足，请联系客服！",
    },
    { state: 0, msg: "maintenance" },
    { code: 200, subCode: "0100000002", subMsg: "业务处理失败", data: null },
  );
  const context = { apiKey: "secret", fetcher };
  const request = { path: "/bid/account/resources", body: {} };

  await expect(requestBaobiao(context, request)).rejects.toMatchObject({ status: 401 });
  await expect(requestBaobiao(context, request)).rejects.toMatchObject({ status: 403, message: "无权调用该接口!" });
  await expect(requestBaobiao(context, request)).rejects.toMatchObject({
    status: 403,
    message: "帐号接口未授权或额度、余额不足，请联系客服！",
  });
  await expect(requestBaobiao(context, request)).rejects.toMatchObject({ status: 502, message: "maintenance" });
  await expect(requestBaobiao(context, request)).rejects.toMatchObject({ status: 502, message: "业务处理失败" });
});

test("pollBaobiaoSearchQuery resubmits the query until the rewrite completes", async () => {
  const fetcher = jsonFetcher(
    { code: 200, data: { requestKey: "k", status: "processing" } },
    { code: 200, data: { requestKey: "k", status: "completed", searchCondition: { keyword: "物业服务" } } },
  );

  await expect(
    pollBaobiaoSearchQuery({ apiKey: "secret", fetcher }, "/bid/aiSearchSubmitPolling", "湖北物业服务"),
  ).resolves.toMatchObject({
    status: "completed",
    searchCondition: { keyword: "物业服务" },
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[1]![1]?.body).toBe('{"userQuery":"湖北物业服务"}');
});

test("pollBaobiaoSearchQuery reports a failed rewrite as an upstream error", async () => {
  const fetcher = jsonFetcher(
    { code: 200, data: { requestKey: "k", status: "failed", errorMsg: "rewrite failed" } },
    { code: 200, data: null },
  );
  const context = { apiKey: "secret", fetcher };

  await expect(pollBaobiaoSearchQuery(context, "/bid/aiSearchSubmitPolling", "q")).rejects.toMatchObject({
    status: 502,
    message: "rewrite failed",
  });
  await expect(pollBaobiaoSearchQuery(context, "/bid/aiSearchSubmitPolling", "q")).rejects.toMatchObject({
    status: 502,
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
});

test("executors rename action fields to the gateway's per-endpoint field names", async () => {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json({ code: 200, data: [] }));
  vi.stubGlobal("fetch", fetcher);
  const context: ExecutionContext = {
    getCredential: async () => ({
      authType: "api_key",
      apiKey: "secret",
      values: { apiKey: "secret" },
      profile: { accountId: "baobiao:test", displayName: "Baobiao test", grantedScopes: [] },
      metadata: {},
    }),
  };
  const publishTime = "2026-06-08 14:30:30";

  await executors["baobiao.get_planned_project"]!({ id: 5, publishTime }, context);
  await executors["baobiao.list_planned_project_files"]!({ id: 5, publishTime }, context);
  await executors["baobiao.get_company_registration"]!({ query: "91100000000013477B", keyType: "2" }, context);
  await executors["baobiao.list_project_files"]!({ id: 7, publishTime }, context);

  const bodies = fetcher.mock.calls.map(([, init]) => init?.body);
  expect(JSON.parse(String(bodies[0]))).toEqual({ id: 5, publishtime: publishTime });
  expect(JSON.parse(String(bodies[1]))).toEqual({ projectId: 5, projectTypeID: 2, publishTime });
  expect(JSON.parse(String(bodies[2]))).toEqual({ key: "91100000000013477B", keyType: "2" });
  expect(Object.fromEntries(bodies[3] as FormData)).toEqual({ projectId: "7", publishTime });
});

test("credential validation rejects only a key the gateway does not recognize", async () => {
  const validate = credentialValidators.apiKey!;

  await expect(
    validate(
      { apiKey: "secret", values: {} },
      {
        fetcher: jsonFetcher({
          code: -1,
          subCode: "0100590005",
          subMsg: "帐号接口未授权或额度、余额不足，请联系客服！",
        }),
      },
    ),
  ).resolves.toMatchObject({
    profile: { accountId: expect.stringMatching(/^baobiao:[0-9a-f]{64}$/u) },
    metadata: { accountResourcesAvailable: false },
  });
  await expect(
    validate(
      { apiKey: "bad", values: {} },
      { fetcher: jsonFetcher({ code: 403, subCode: "0100590001", subMsg: "invalid" }) },
    ),
  ).rejects.toMatchObject({ status: 400, message: "Baobiao API key is invalid" });
});
