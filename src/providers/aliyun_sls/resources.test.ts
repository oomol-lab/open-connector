import { describe, expect, it } from "vitest";
import { ProviderRequestError } from "../provider-runtime.ts";
import {
  normalizeAliyunSlsEndpoint,
  parseAliyunSlsCredential,
  parseAliyunSlsResourceScope,
  resolveAliyunSlsLogstoreTarget,
  resolveAliyunSlsProjectTarget,
} from "./resources.ts";

const endpoint = "cn-hangzhou.log.aliyuncs.com";

describe("Alibaba Cloud SLS resourceScope", () => {
  it("leaves a blank resourceScope unrestricted", () => {
    expect(parseAliyunSlsResourceScope(undefined, endpoint)).toBeUndefined();
    expect(parseAliyunSlsResourceScope("  ", endpoint)).toBeUndefined();
  });

  it("normalizes default and per-entry endpoints and preserves all-Logstore entries", () => {
    expect(
      parseAliyunSlsResourceScope(
        JSON.stringify([
          { project: "project-a", logstores: ["application", "nginx"] },
          {
            endpoint: "https://cn-shanghai.log.aliyuncs.com",
            project: "project-b",
          },
        ]),
        endpoint,
      ),
    ).toEqual([
      {
        endpoint,
        project: "project-a",
        logstores: ["application", "nginx"],
      },
      {
        endpoint: "cn-shanghai.log.aliyuncs.com",
        project: "project-b",
      },
    ]);
  });

  it.each([
    ["invalid JSON", "{", "valid JSON"],
    ["non-array JSON", "{}", "JSON array"],
    ["empty array", "[]", "must not be an empty array"],
    ["empty Project", '[{"project":""}]', "project is required"],
    ["empty endpoint", '[{"endpoint":"","project":"project-a"}]', "endpoint is required"],
    ["duplicate Project", '[{"project":"project-a"},{"project":"project-a"}]', "duplicate Project"],
    ["empty Logstore list", '[{"project":"project-a","logstores":[]}]', "non-empty array"],
    ["empty Logstore name", '[{"project":"project-a","logstores":[""]}]', "is required"],
    ["duplicate Logstore", '[{"project":"project-a","logstores":["app","app"]}]', "duplicate Logstore"],
  ])("rejects %s", (_name, value, message) => {
    expect(() => parseAliyunSlsResourceScope(value, endpoint)).toThrow(message);
  });

  it.each([
    "http://cn-hangzhou.log.aliyuncs.com",
    "https://user:pass@cn-hangzhou.log.aliyuncs.com",
    "https://cn-hangzhou.log.aliyuncs.com/path",
    "https://cn-hangzhou.log.aliyuncs.com?query=1",
    "https://cn-hangzhou.log.aliyuncs.com#hash",
    "https://127.0.0.1",
    "https://localhost",
    "https://example.com",
    "https://cn-hangzhou.log.aliyuncs.com.example.com",
  ])("rejects unsafe endpoint %s", (value) => {
    expect(() => normalizeAliyunSlsEndpoint(value)).toThrow(ProviderRequestError);
  });

  it.each(["cn-hangzhou-intranet.log.aliyuncs.com", "cn-shanghai-finance-1.log.aliyuncs.com"])(
    "accepts official SLS endpoint variant %s",
    (value) => {
      expect(normalizeAliyunSlsEndpoint(value)).toBe(value);
    },
  );

  it("infers only unique scoped Projects and Logstores", () => {
    const credential = parseAliyunSlsCredential({
      accessKeyId: "id",
      accessKeySecret: "secret",
      endpoint,
      resourceScope: '[{"project":"project-a","logstores":["application"]}]',
    });
    expect(resolveAliyunSlsProjectTarget(credential, undefined, undefined)).toMatchObject({
      endpoint,
      project: "project-a",
    });
    expect(resolveAliyunSlsLogstoreTarget(credential, undefined, undefined, undefined)).toMatchObject({
      endpoint,
      project: "project-a",
      logstore: "application",
    });
  });

  it("requires explicit resources when the candidates are ambiguous or unrestricted", () => {
    const unrestricted = parseAliyunSlsCredential({
      accessKeyId: "id",
      accessKeySecret: "secret",
      endpoint,
    });
    expect(() => resolveAliyunSlsProjectTarget(unrestricted, undefined, undefined)).toThrow("project is required");

    const multipleProjects = parseAliyunSlsCredential({
      accessKeyId: "id",
      accessKeySecret: "secret",
      endpoint,
      resourceScope: '[{"project":"project-a"},{"project":"project-b"}]',
    });
    expect(() => resolveAliyunSlsProjectTarget(multipleProjects, undefined, undefined)).toThrow(
      "multiple candidate Projects",
    );

    const allLogstores = parseAliyunSlsCredential({
      accessKeyId: "id",
      accessKeySecret: "secret",
      endpoint,
      resourceScope: '[{"project":"project-a"}]',
    });
    expect(() => resolveAliyunSlsLogstoreTarget(allLogstores, undefined, undefined, undefined)).toThrow(
      "logstore is required",
    );
  });

  it("returns explicit 403 errors for resources outside the allowlist", () => {
    const credential = parseAliyunSlsCredential({
      accessKeyId: "id",
      accessKeySecret: "secret",
      endpoint,
      resourceScope: '[{"project":"project-a","logstores":["application"]}]',
    });

    for (const run of [
      () => resolveAliyunSlsProjectTarget(credential, undefined, "project-b"),
      () => resolveAliyunSlsProjectTarget(credential, "cn-shanghai.log.aliyuncs.com", "project-a"),
      () => resolveAliyunSlsLogstoreTarget(credential, undefined, "project-a", "audit"),
    ]) {
      try {
        run();
        throw new Error("expected a resourceScope denial");
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderRequestError);
        expect((error as ProviderRequestError).status).toBe(403);
        expect((error as Error).message).toContain("resourceScope allowlist");
      }
    }
  });
});
