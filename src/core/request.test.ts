import { afterEach, describe, expect, it } from "vitest";
import {
  assertPublicHttpUrl,
  isAlwaysBlockedIpAddress,
  isBlockedIpAddress,
  isEgressIpCheckSkippedForHost,
  isIpAddress,
  isIpv4Address,
  isPrivateNetworkAccessAllowed,
  parseEgressIpCheckSkipHosts,
  parsePrivateNetworkAccessFlag,
  setEgressIpCheckSkipHosts,
  setPrivateNetworkAccessAllowed,
} from "./request.ts";

describe("assertPublicHttpUrl", () => {
  it("canonicalizes public hostnames with trailing dots", () => {
    expect(readPublicUrl("https://example.com./path").host).toBe("example.com");
  });

  it("rejects local hostnames with trailing dots", () => {
    expect(() => readPublicUrl("https://localhost./")).toThrow("target local hosts");
  });

  it("rejects local and private IPv4 address forms normalized by URL parsing", () => {
    for (const value of ["https://127.1/", "https://0177.0.0.1/", "https://2130706433/", "https://10.0.0.1/"]) {
      expect(() => readPublicUrl(value)).toThrow("private or reserved IP addresses");
    }
  });

  it("rejects internal hostname suffixes", () => {
    for (const value of [
      "https://router.local/",
      "https://service.internal/",
      "https://nas.lan/",
      "https://box.home/",
    ]) {
      expect(() => readPublicUrl(value)).toThrow("target local hosts");
    }
  });

  it("rejects known cloud metadata hostnames even when private networks are allowed", () => {
    for (const value of [
      "http://instance-data.ec2.internal/",
      "http://metadata.google.internal/",
      "http://metadata.google.internal./",
      "http://metadata.goog/",
    ]) {
      expect(() => readPublicUrl(value, true)).toThrow("cloud metadata hosts");
    }
  });

  it("rejects IPv6 targets", () => {
    expect(() => readPublicUrl("https://[::1]/")).toThrow("target IPv6 addresses");
  });

  it("allows explicitly trusted private and overlay network targets", () => {
    for (const value of [
      "http://10.0.0.1:3000/",
      "http://100.64.0.1:3000/",
      "http://172.16.0.1:3000/",
      "http://192.168.0.1:3000/",
      "https://192.168.0.1:3000/",
      "http://dokploy.internal:3000/",
      "http://router.local:3000/",
      "http://box.home:3000/",
      "http://nas.lan:3000/",
    ]) {
      expect(readPublicUrl(value, true).toString()).toBe(value);
    }
  });

  it("keeps unsafe targets blocked when private networks are allowed", () => {
    for (const value of [
      "http://localhost:3000/",
      "http://service.localhost:3000/",
      "http://127.0.0.1:3000/",
      "http://100.100.100.200/",
      "http://169.254.169.254/",
      "http://224.0.0.1/",
      "http://[fd7a:115c:a1e0::1]/",
    ]) {
      expect(() => readPublicUrl(value, true)).toThrow();
    }
  });
});

describe("isBlockedIpAddress", () => {
  it("blocks loopback, link-local, metadata, and other reserved IPv4 addresses", () => {
    for (const address of [
      "127.0.0.1",
      "169.254.169.254",
      "0.0.0.0",
      "100.100.100.200",
      "224.0.0.1",
      "255.255.255.255",
    ]) {
      expect(isBlockedIpAddress(address)).toBe(true);
      expect(isBlockedIpAddress(address, true)).toBe(true);
    }
  });

  it("blocks private IPv4 addresses unless private networks are allowed", () => {
    for (const address of ["10.0.0.5", "172.16.0.2", "192.168.1.1", "100.64.0.1"]) {
      expect(isBlockedIpAddress(address)).toBe(true);
      expect(isBlockedIpAddress(address, true)).toBe(false);
    }
  });

  it("allows public IPv4 addresses", () => {
    for (const address of ["1.1.1.1", "8.8.8.8", "93.184.216.34"]) {
      expect(isBlockedIpAddress(address)).toBe(false);
    }
  });

  it("blocks reserved IPv6 addresses regardless of the private-network flag", () => {
    for (const address of ["::", "::1", "fe80::1", "ff02::1", "2001:db8::1", "100::1"]) {
      expect(isBlockedIpAddress(address)).toBe(true);
      expect(isBlockedIpAddress(address, true)).toBe(true);
    }
  });

  it("blocks unique-local and site-local IPv6 unless private networks are allowed", () => {
    for (const address of ["fd00::1", "fc00::1", "fec0::1", "fd7a:115c:a1e0::1"]) {
      expect(isBlockedIpAddress(address)).toBe(true);
      expect(isBlockedIpAddress(address, true)).toBe(false);
    }
  });

  it("blocks IANA special-purpose non-global IPv6 ranges regardless of the private-network flag", () => {
    for (const address of [
      "100::1", // discard-only (RFC 6666)
      "100:0:0:1::1", // discard-only extension
      "64:ff9b:1::1", // local-use IPv4/IPv6 translation (RFC 8215)
      "2001:2::1", // benchmarking (RFC 5180)
      "3fff::1", // documentation (RFC 9637)
      "5f00::1", // SRv6 SIDs (RFC 9602)
    ]) {
      expect(isBlockedIpAddress(address)).toBe(true);
      expect(isBlockedIpAddress(address, true)).toBe(true);
    }
  });

  it("applies the IPv4 policy to v4-mapped, NAT64, and 6to4 IPv6 addresses", () => {
    expect(isBlockedIpAddress("::ffff:169.254.169.254")).toBe(true);
    expect(isBlockedIpAddress("::ffff:169.254.169.254", true)).toBe(true);
    expect(isBlockedIpAddress("::ffff:10.0.0.5")).toBe(true);
    expect(isBlockedIpAddress("::ffff:10.0.0.5", true)).toBe(false);
    expect(isBlockedIpAddress("::ffff:8.8.8.8")).toBe(false);
    // NAT64 well-known prefix embedding 127.0.0.1 (7f00:1).
    expect(isBlockedIpAddress("64:ff9b::7f00:1")).toBe(true);
    // 6to4 embedding 192.168.1.1 (c0a8:0101).
    expect(isBlockedIpAddress("2002:c0a8:101::1")).toBe(true);
    expect(isBlockedIpAddress("2002:c0a8:101::1", true)).toBe(false);
  });

  it("allows public IPv6 addresses and ignores zone suffixes", () => {
    expect(isBlockedIpAddress("2606:4700:4700::1111")).toBe(false);
    expect(isBlockedIpAddress("fe80::1%en0")).toBe(true);
  });

  it("treats unparseable addresses as blocked", () => {
    for (const address of ["", "not-an-ip", "10.0.0", "1.2.3.4.5", ":::1", "fe80::1::2"]) {
      expect(isBlockedIpAddress(address)).toBe(true);
    }
  });
});

describe("isIpv4Address", () => {
  it("accepts canonical dotted-decimal IPv4 literals", () => {
    for (const value of ["127.0.0.1", "10.0.0.5", "169.254.169.254", "0.0.0.0", "255.255.255.255"]) {
      expect(isIpv4Address(value)).toBe(true);
    }
  });

  it("rejects looser numeric forms that a resolver could still treat as an address", () => {
    // Out-of-range or non-4-group numeric hosts must not be mistaken for a
    // validated literal — they have to go through DNS resolved-address checks.
    for (const value of ["0251.0376.0251.0376", "1.2.3.999", "300.1.1.1", "2130706433", "10.0.0", "1.2.3.4.5", ""]) {
      expect(isIpv4Address(value)).toBe(false);
    }
  });

  it("rejects hostnames and IPv6 literals", () => {
    for (const value of ["example.com", "metadata.attacker.com", "::1", "fe80::1"]) {
      expect(isIpv4Address(value)).toBe(false);
    }
  });
});

describe("isIpAddress", () => {
  it("accepts IPv4 and IPv6 literals", () => {
    for (const value of ["127.0.0.1", "8.219.95.213", "::1", "fe80::1", "2606:b740:49::115", "::ffff:10.0.0.1"]) {
      expect(isIpAddress(value)).toBe(true);
    }
  });

  it("rejects the CNAME hostnames workerd reports in a lookup entry's address field", () => {
    // workerd's node:dns maps every DoH answer record into an entry without
    // filtering by type, so CNAME targets arrive where an address is expected.
    for (const value of [
      "controlplane.tailscale.com.",
      "alb-2ez87aepnoql6znr3g.ap-southeast-1.alb.aliyuncsslbintl.com.",
      "ags.privatelink.msidentity.com.",
      "example.com",
      "",
    ]) {
      expect(isIpAddress(value)).toBe(false);
    }
  });
});

describe("isAlwaysBlockedIpAddress", () => {
  it("keeps local, metadata, and unsafe special-use targets closed", () => {
    for (const value of ["127.0.0.1", "169.254.169.254", "100.100.100.200", "::1", "fe80::1", "ff02::1"]) {
      expect(isAlwaysBlockedIpAddress(value)).toBe(true);
    }
  });

  it("leaves private and VPN-mapped targets to the caller policy", () => {
    for (const value of ["10.0.0.5", "100.64.0.1", "198.18.0.196", "fd00::1", "93.184.216.34"]) {
      expect(isAlwaysBlockedIpAddress(value)).toBe(false);
    }
  });
});

describe("private network access deployment flag", () => {
  afterEach(() => setPrivateNetworkAccessAllowed(false));

  it("is disabled by default", () => {
    expect(isPrivateNetworkAccessAllowed()).toBe(false);
  });

  it("reflects the configured value", () => {
    setPrivateNetworkAccessAllowed(true);
    expect(isPrivateNetworkAccessAllowed()).toBe(true);
    setPrivateNetworkAccessAllowed(false);
    expect(isPrivateNetworkAccessAllowed()).toBe(false);
  });

  it("parses only explicit truthy env values", () => {
    for (const value of ["1", "true", "TRUE", "yes", "on", " True "]) {
      expect(parsePrivateNetworkAccessFlag(value)).toBe(true);
    }
    for (const value of [undefined, "", "0", "false", "no", "off", "disabled"]) {
      expect(parsePrivateNetworkAccessFlag(value)).toBe(false);
    }
  });
});

function readPublicUrl(value: string, allowPrivateNetwork = false): URL {
  return assertPublicHttpUrl(value, {
    fieldName: "url",
    createError: (message) => new Error(message),
    allowPrivateNetwork,
  });
}

describe("egress IP-check host allowlist", () => {
  afterEach(() => setEgressIpCheckSkipHosts([]));

  it("parses a comma-separated list and drops entries that would match nothing", () => {
    expect(parseEgressIpCheckSkipHosts(" .feishu.cn , API.Example.com ,, . ,")).toEqual([
      ".feishu.cn",
      "api.example.com",
    ]);
    expect(parseEgressIpCheckSkipHosts(undefined)).toEqual([]);
    expect(parseEgressIpCheckSkipHosts("")).toEqual([]);
  });

  it("matches a dot-prefixed entry against the domain and its subdomains only", () => {
    setEgressIpCheckSkipHosts([".feishu.cn"]);
    expect(isEgressIpCheckSkippedForHost("feishu.cn")).toBe(true);
    expect(isEgressIpCheckSkippedForHost("open.feishu.cn")).toBe(true);
    expect(isEgressIpCheckSkippedForHost("OPEN.FEISHU.CN")).toBe(true);
    expect(isEgressIpCheckSkippedForHost("open.feishu.cn.")).toBe(true);
    // A look-alike registration must not inherit the allowlist.
    expect(isEgressIpCheckSkippedForHost("evilfeishu.cn")).toBe(false);
    expect(isEgressIpCheckSkippedForHost("feishu.cn.attacker.example")).toBe(false);
  });

  it("requires an exact match for an entry without a leading dot", () => {
    setEgressIpCheckSkipHosts(["api.example.com"]);
    expect(isEgressIpCheckSkippedForHost("api.example.com")).toBe(true);
    expect(isEgressIpCheckSkippedForHost("sub.api.example.com")).toBe(false);
    expect(isEgressIpCheckSkippedForHost("example.com")).toBe(false);
  });

  it("skips nothing by default", () => {
    expect(isEgressIpCheckSkippedForHost("open.feishu.cn")).toBe(false);
    expect(isEgressIpCheckSkippedForHost("")).toBe(false);
  });
});
