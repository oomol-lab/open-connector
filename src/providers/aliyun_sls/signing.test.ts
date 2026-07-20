import { describe, expect, it } from "vitest";
import { aliyunSlsUtf8Bytes, buildAliyunSlsCanonicalResource, signAliyunSlsRequest } from "./signing.ts";

describe("Alibaba Cloud SLS request signing", () => {
  it("signs a GET request with sorted query parameters and canonical headers", () => {
    const signed = signAliyunSlsRequest({
      method: "GET",
      path: "/logstores/example",
      query: {
        size: "100",
        logstoreName: "",
        offset: "0",
      },
      headers: {
        "x-log-date": "stale-proxy-date",
        "x-log-zeta": "z",
      },
      credential: {
        accessKeyId: "testAccessKeyId",
        accessKeySecret: "testAccessKeySecret",
      },
      date: new Date("2022-01-03T04:05:06Z"),
    });

    expect(signed.canonicalString).toBe(
      [
        "GET",
        "",
        "",
        "Mon, 03 Jan 2022 04:05:06 GMT",
        "x-log-apiversion:0.6.0",
        "x-log-bodyrawsize:0",
        "x-log-signaturemethod:hmac-sha1",
        "x-log-zeta:z",
        "/logstores/example?logstoreName=&offset=0&size=100",
      ].join("\n"),
    );
    expect(signed.contentMd5).toBeUndefined();
    expect(signed.signature).toBe("nuyu9oBaK4Q7R7/zSDoCjKepUok=");
    expect(signed.headers.get("authorization")).toBe("LOG testAccessKeyId:nuyu9oBaK4Q7R7/zSDoCjKepUok=");
    expect(signed.headers.get("x-log-date")).toBe("Mon, 03 Jan 2022 04:05:06 GMT");
    expect(signed.headers.get("content-md5")).toBeNull();
  });

  it("signs a POST from the final UTF-8 body bytes and includes an STS token", () => {
    const bodyBytes = aliyunSlsUtf8Bytes('{"query":"状态"}');
    const signed = signAliyunSlsRequest({
      method: "POST",
      path: "/logstores/example/logs",
      query: { z: "last", a: "first" },
      headers: {
        "content-type": "application/json",
        "x-log-alpha": "a",
      },
      bodyBytes,
      credential: {
        accessKeyId: "temporaryAccessKey",
        accessKeySecret: "temporarySecret",
        securityToken: "token-value",
      },
      date: new Date("2022-01-04T05:06:07Z"),
    });

    expect(signed.contentMd5).toBe("EF2643B9A23580637AD32EAE4284DD9C");
    expect(signed.headers.get("x-log-bodyrawsize")).toBe("18");
    expect(signed.headers.get("x-acs-security-token")).toBe("token-value");
    expect(signed.canonicalString).toBe(
      [
        "POST",
        "EF2643B9A23580637AD32EAE4284DD9C",
        "application/json",
        "Tue, 04 Jan 2022 05:06:07 GMT",
        "x-acs-security-token:token-value",
        "x-log-alpha:a",
        "x-log-apiversion:0.6.0",
        "x-log-bodyrawsize:18",
        "x-log-signaturemethod:hmac-sha1",
        "/logstores/example/logs?a=first&z=last",
      ].join("\n"),
    );
    expect(signed.signature).toBe("qW8T7QYAGXU2xqy+puNpJs18sj4=");
  });

  it("sorts canonical query keys without URL-encoding their values", () => {
    expect(buildAliyunSlsCanonicalResource("/", { z: "a b", a: "x/y" })).toBe("/?a=x/y&z=a b");
  });
});
