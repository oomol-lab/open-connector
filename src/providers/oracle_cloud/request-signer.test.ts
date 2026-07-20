import { Buffer } from "node:buffer";
import { createHash, createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildOracleApiSigningString, parseOracleApiPrivateKey, signOracleApiRequest } from "./request-signer.ts";

const keyPair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKeyPem = keyPair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const identity = {
  tenancyId: "ocid1.tenancy.oc1..tenancy",
  userId: "ocid1.user.oc1..user",
  fingerprint: "00:11:22:33:44:55:66:77:88:99:aa:bb:cc:dd:ee:ff",
  privateKey: parseOracleApiPrivateKey(privateKeyPem),
};

describe("OCI API request signing", () => {
  it("signs a GET request target, host, and date with RSA-SHA256", () => {
    const url = new URL(
      "https://iaas.us-ashburn-1.oraclecloud.com/20160918/instances?compartmentId=ocid1.compartment.oc1..demo&limit=1",
    );
    const headers = signOracleApiRequest(identity, {
      method: "GET",
      url,
      now: new Date("2026-07-18T12:00:00Z"),
    });

    expect(headers.get("x-date")).toBe("Sat, 18 Jul 2026 12:00:00 GMT");
    expect(headers.get("authorization")).toContain(
      'keyId="ocid1.tenancy.oc1..tenancy/ocid1.user.oc1..user/00:11:22:33:44:55:66:77:88:99:aa:bb:cc:dd:ee:ff"',
    );
    expect(headers.get("authorization")).toContain('headers="(request-target) host x-date"');
    expect(buildOracleApiSigningString("GET", url, headers, ["(request-target)"]).split("\n")[0]).toBe(
      "(request-target): get /20160918/instances?compartmentId=ocid1.compartment.oc1..demo&limit=1",
    );
    expectSignatureToVerify(url, "GET", headers);
  });

  it.each(["POST", "PUT"])("adds and signs the required body headers for %s requests", (method) => {
    const url = new URL(
      "https://iaas.us-ashburn-1.oraclecloud.com/20160918/instances/ocid1.instance.oc1..demo?action=SOFTRESET",
    );
    const body = "{}";
    const headers = signOracleApiRequest(identity, {
      method,
      url,
      body,
      now: new Date("2026-07-18T12:00:00Z"),
    });

    expect(headers.get("content-length")).toBe("2");
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("x-content-sha256")).toBe(createHash("sha256").update(body).digest("base64"));
    expect(headers.get("authorization")).toContain(
      'headers="(request-target) host x-date content-type content-length x-content-sha256"',
    );
    expectSignatureToVerify(url, method, headers);
  });

  it("signs DELETE requests without body headers", () => {
    const url = new URL("https://iaas.us-ashburn-1.oraclecloud.com/20160918/instances/ocid1.instance.oc1..demo");
    const headers = signOracleApiRequest(identity, {
      method: "DELETE",
      url,
      now: new Date("2026-07-18T12:00:00Z"),
    });

    expect(headers.get("x-content-sha256")).toBeNull();
    expect(headers.get("authorization")).toContain('headers="(request-target) host x-date"');
    expectSignatureToVerify(url, "DELETE", headers);
  });

  it("rejects a non-RSA private key", () => {
    const ecKey = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey;
    const pem = ecKey.export({ type: "pkcs8", format: "pem" }).toString();
    expect(() => parseOracleApiPrivateKey(pem)).toThrow("privateKey must be a valid RSA private key");
  });
});

function expectSignatureToVerify(url: URL, method: string, headers: Headers): void {
  const authorization = headers.get("authorization") ?? "";
  const signedNames = /headers="([^"]+)"/u.exec(authorization)?.[1]?.split(" ") ?? [];
  const signature = /signature="([^"]+)"/u.exec(authorization)?.[1] ?? "";
  const verifier = createVerify("RSA-SHA256");
  verifier.update(buildOracleApiSigningString(method, url, headers, signedNames));
  verifier.end();
  expect(verifier.verify(keyPair.publicKey, Buffer.from(signature, "base64"))).toBe(true);
}
