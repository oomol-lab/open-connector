import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setDefaultGuardedFetchDnsLookup } from "../../core/guarded-fetch.ts";
import { executors } from "./executors.ts";

interface CapturedStsRequest {
  url: URL;
  method: string;
  headers: Headers;
  body: string;
}

const credential: Extract<ResolvedCredential, { authType: "custom_credential" }> = {
  authType: "custom_credential",
  values: {
    accessKeyId: "AKIATEST",
    secretAccessKey: "secret",
  },
  profile: { accountId: "AKIATEST", displayName: "AWS STS", grantedScopes: [] },
  metadata: {},
};

const context: ExecutionContext = {
  getCredential: async () => credential,
};

// Key material from the AWS SigV4 test suite. The Authorization values below
// were frozen from the signing path; they cover the fixed User-Agent
// (`oomol-connect/0.1`) and must stay byte-identical across refactors of the
// shared SigV4 helpers.
const goldenAccessKeyId = "AKIDEXAMPLE";
const goldenSecretAccessKey = "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY";
const goldenSessionToken = "AQoDYXdzEJr//////////wEaABC+de/f0g==";
const goldenSigningTime = new Date("2015-08-30T12:36:00.000Z");
const goldenRoleArn = "arn:aws:iam::123456789012:role/demo";
const goldenBody =
  "Action=AssumeRole&Version=2011-06-15&RoleArn=arn%3Aaws%3Aiam%3A%3A123456789012%3Arole%2Fdemo&RoleSessionName=oomol-connect";

const assumeRoleResponseXml = `<?xml version="1.0" encoding="UTF-8"?>
<AssumeRoleResponse xmlns="https://sts.amazonaws.com/doc/2011-06-15/">
  <AssumeRoleResult>
    <Credentials>
      <AccessKeyId>ASIAEXAMPLE</AccessKeyId>
      <SecretAccessKey>assumed-secret</SecretAccessKey>
      <SessionToken>assumed-token</SessionToken>
      <Expiration>2015-08-30T13:36:00Z</Expiration>
    </Credentials>
  </AssumeRoleResult>
  <ResponseMetadata>
    <RequestId>request-1</RequestId>
  </ResponseMetadata>
</AssumeRoleResponse>`;

beforeEach(() => {
  setDefaultGuardedFetchDnsLookup(null);
});

afterEach(() => {
  setDefaultGuardedFetchDnsLookup(undefined);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("AWS STS region resolver DNS", () => {
  it("rejects a region host that resolves to cloud metadata before any fetch", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    setDefaultGuardedFetchDnsLookup(async () => [{ address: "169.254.169.254", family: 4 }]);

    const result = await executors["aws_sts.assume_role"]!(
      { roleArn: "arn:aws:iam::123456789012:role/demo", region: "ap-southeast-1" },
      context,
    );

    expect(result).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("must not resolve to private or reserved IP addresses") },
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("AWS STS SigV4 golden vectors", () => {
  it("signs assume_role with the frozen Authorization header", async () => {
    vi.setSystemTime(goldenSigningTime);
    const requests = stubAssumeRoleResponse();

    const result = await executeAssumeRole({ roleArn: goldenRoleArn }, {});

    expect(result).toMatchObject({
      ok: true,
      output: {
        accessKeyId: "ASIAEXAMPLE",
        secretAccessKey: "assumed-secret",
        sessionToken: "assumed-token",
        expiration: "2015-08-30T13:36:00Z",
        requestId: "request-1",
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe("POST");
    expect(requests[0]?.url.href).toBe("https://sts.ap-southeast-1.amazonaws.com/");
    expect(requests[0]?.body).toBe(goldenBody);
    expect(requests[0]?.headers.get("x-amz-date")).toBe("20150830T123600Z");
    expect(requests[0]?.headers.has("x-amz-security-token")).toBe(false);
    expect(requests[0]?.headers.get("authorization")).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/ap-southeast-1/sts/aws4_request, SignedHeaders=accept;content-type;host;user-agent;x-amz-date, Signature=70ac4788e89158ec83bfea354cbf19a3a8895893bff3f8c57b027668a3ba6928",
    );
  });

  it("signs the session token as x-amz-security-token", async () => {
    vi.setSystemTime(goldenSigningTime);
    const requests = stubAssumeRoleResponse();

    const result = await executeAssumeRole({ roleArn: goldenRoleArn }, { sessionToken: goldenSessionToken });

    expect(result).toMatchObject({ ok: true });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.body).toBe(goldenBody);
    expect(requests[0]?.headers.get("x-amz-security-token")).toBe(goldenSessionToken);
    expect(requests[0]?.headers.get("authorization")).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/ap-southeast-1/sts/aws4_request, SignedHeaders=accept;content-type;host;user-agent;x-amz-date;x-amz-security-token, Signature=c09ce94c7b086c98337b1f6ea786ef6dcf18cb99fddf21f7eea491c0f9be0ad1",
    );
  });
});

function stubAssumeRoleResponse(): CapturedStsRequest[] {
  const requests: CapturedStsRequest[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    requests.push({
      url: new URL(request.url),
      method: request.method,
      headers: request.headers,
      body: await request.text(),
    });
    return new Response(assumeRoleResponseXml, {
      headers: { "content-type": "text/xml" },
    });
  });
  return requests;
}

async function executeAssumeRole(input: Record<string, unknown>, values: { sessionToken?: string }) {
  const goldenContext: ExecutionContext = {
    getCredential: async () => ({
      ...credential,
      values: {
        accessKeyId: goldenAccessKeyId,
        secretAccessKey: goldenSecretAccessKey,
        ...(values.sessionToken ? { sessionToken: values.sessionToken } : {}),
      },
    }),
  };
  return executors["aws_sts.assume_role"]!(input, goldenContext);
}
