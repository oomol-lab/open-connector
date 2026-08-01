import { afterEach, describe, expect, it } from "vitest";
import { setPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { genericImapRuntimeConfig } from "./config.ts";

// Tests mutate the deployment-level private-network flag; reset it to the secure
// default after each case so state never leaks between tests.
afterEach(() => setPrivateNetworkAccessAllowed(false));

function readCredential(imapHost: string, smtpHost?: string) {
  const values: Record<string, string> = {
    email: "user@example.com",
    password: "application-password",
    imapHost,
  };
  if (smtpHost !== undefined) {
    values.smtpHost = smtpHost;
  }
  return genericImapRuntimeConfig.readCredential(values);
}

describe("generic IMAP host access", () => {
  it("rejects private and reserved IP literals by default (public-only guard)", () => {
    for (const host of [
      "127.0.0.1",
      "169.254.169.254",
      "10.0.0.1",
      "172.16.0.1",
      "192.168.1.1",
      "100.64.0.1",
      "100.100.100.200",
      "0.0.0.0",
    ]) {
      expect(() => readCredential(host)).toThrow();
    }
  });

  it("accepts public mailbox hosts", () => {
    for (const host of ["imap.gmail.com", "ssl0.ovh.net", "outlook.office365.com", "imap.mail.yahoo.com"]) {
      expect(readCredential(host).imapHost).toBe(host);
    }
  });

  it("keeps loopback, link-local, and metadata targets blocked even when private networks are enabled", () => {
    setPrivateNetworkAccessAllowed(true);
    for (const host of ["127.0.0.1", "169.254.169.254", "100.100.100.200", "0.0.0.0", "localhost", "foo.localhost"]) {
      expect(() => readCredential(host)).toThrow();
    }
  });

  it("allows RFC 1918, CGNAT, and private hostname mailboxes when the deployment enables private networks", () => {
    setPrivateNetworkAccessAllowed(true);
    for (const host of ["10.0.0.1", "172.16.0.1", "192.168.1.1", "100.64.0.1", "mail.internal", "imap.home"]) {
      expect(readCredential(host).imapHost).toBe(host);
    }
  });

  it("rejects values that are not bare hostnames", () => {
    for (const host of [
      "",
      "https://imap.example.com",
      "imap.example.com:993",
      "user@imap.example.com",
      "imap.example.com/path",
      "imap.example.com.",
      "::1",
      "[::1]",
      "imap example com",
    ]) {
      expect(() => readCredential(host)).toThrow();
    }
  });

  it("applies the guard to the SMTP host as well as the IMAP host", () => {
    expect(() => readCredential("imap.gmail.com", "169.254.169.254")).toThrow();
    expect(() => readCredential("imap.gmail.com", "127.0.0.1")).toThrow();
    expect(() => readCredential("imap.gmail.com", "192.168.1.1")).toThrow();
  });

  it("guards the SMTP host derived from the IMAP host", () => {
    setPrivateNetworkAccessAllowed(true);
    // The derived host follows the IMAP host, so both stay inside the policy.
    expect(readCredential("imap.internal").smtpHost).toBe("smtp.internal");
  });

  it("normalizes the accepted host and derives the SMTP host from the normalized value", () => {
    const credential = readCredential("IMAP.Gmail.COM");
    expect(credential.imapHost).toBe("imap.gmail.com");
    expect(credential.smtpHost).toBe("smtp.gmail.com");
  });

  it("derives the SMTP host from an imap-prefixed label, and leaves other names alone", () => {
    expect(readCredential("imap.gmail.com").smtpHost).toBe("smtp.gmail.com");
    expect(readCredential("imap-mail.outlook.com").smtpHost).toBe("smtp-mail.outlook.com");
    expect(readCredential("imaps.example.com").smtpHost).toBe("imaps.example.com");
    expect(readCredential("ssl0.ovh.net").smtpHost).toBe("ssl0.ovh.net");
  });

  it("accepts a single-label host so private-network deployments can reach a LAN mailbox", () => {
    setPrivateNetworkAccessAllowed(true);
    expect(readCredential("mailserver").imapHost).toBe("mailserver");
    // The shared guard still owns the decision, so loopback names stay blocked.
    expect(() => readCredential("localhost")).toThrow();
  });

  it("reads the optional submission port and rejects values that are not ports", () => {
    const values = {
      email: "user@example.com",
      password: "application-password",
      imapHost: "imap.mail.me.com",
    };

    expect(genericImapRuntimeConfig.readCredential(values).smtpPort).toBeUndefined();
    expect(genericImapRuntimeConfig.readCredential({ ...values, smtpPort: "587" }).smtpPort).toBe(587);
    for (const smtpPort of ["0", "65536", "-1", "587a", "58 7", "465.0"]) {
      expect(() => genericImapRuntimeConfig.readCredential({ ...values, smtpPort })).toThrow(/SMTP port/);
    }
  });

  it("preserves the application password exactly", () => {
    const credential = genericImapRuntimeConfig.readCredential({
      email: "user@example.com",
      password: "  application password  ",
      imapHost: "imap.example.com",
    });

    expect(credential.authorizationCode).toBe("  application password  ");
  });

  it("reports the offending field in the rejection message", () => {
    expect(() => readCredential("169.254.169.254")).toThrow(/IMAP host/);
    expect(() => readCredential("imap.gmail.com", "169.254.169.254")).toThrow(/SMTP host/);
  });
});
