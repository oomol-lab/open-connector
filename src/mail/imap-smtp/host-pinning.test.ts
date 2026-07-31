import type { MailCredential } from "./protocol.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { isPrivateNetworkAccessAllowed, setPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { genericImapRuntimeConfig } from "../../providers/generic_imap/config.ts";
import { createMailProtocol } from "./protocol.ts";

const credential: MailCredential = {
  email: "user@example.com",
  authorizationCode: "app-password",
  imapHost: "imap.example.com",
  smtpHost: "smtp.example.com",
};

// Taken from the provider rather than restated, so dropping the opt-in in
// generic_imap's config fails this suite instead of silently disarming the guard.
const guardedConfig = {
  displayName: genericImapRuntimeConfig.displayName,
  attachmentFallbackPrefix: genericImapRuntimeConfig.attachmentFallbackPrefix,
  enforceHostNetworkPolicy: genericImapRuntimeConfig.enforceHostNetworkPolicy,
};

const unguardedConfig = {
  displayName: "Mail Test",
  attachmentFallbackPrefix: "mail-test",
};

const initialPrivateNetworkAccess = isPrivateNetworkAccessAllowed();

afterEach(() => {
  setPrivateNetworkAccessAllowed(initialPrivateNetworkAccess);
});

function imapClientFactory() {
  return vi.fn((_config: Record<string, unknown>) => ({
    connect: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
    list: vi.fn(async () => []),
  }));
}

function smtpTransportFactory() {
  return vi.fn((_config: Record<string, unknown>) => ({
    verify: vi.fn(async () => undefined),
    sendMail: vi.fn(async () => ({})),
    close: vi.fn(() => undefined),
  }));
}

function configPassedTo(factory: ReturnType<typeof imapClientFactory> | ReturnType<typeof smtpTransportFactory>) {
  const call = factory.mock.calls[0];
  expect(call).toBeDefined();
  return call![0];
}

describe("mail host pinning", () => {
  it("rejects a hostname that resolves to loopback at connect time", async () => {
    const createImapClient = imapClientFactory();
    const protocol = createMailProtocol(guardedConfig, {
      createImapClient,
      resolveHostAddresses: async () => ["127.0.0.1"],
    });

    await expect(protocol.validateImapCredential(credential)).rejects.toThrow(/imap\.example\.com/);
    expect(createImapClient).not.toHaveBeenCalled();
  });

  it("rejects a hostname that resolves to the cloud metadata address", async () => {
    const createImapClient = imapClientFactory();
    const protocol = createMailProtocol(guardedConfig, {
      createImapClient,
      resolveHostAddresses: async () => ["169.254.169.254"],
    });

    await expect(protocol.validateImapCredential(credential)).rejects.toThrow(/imap\.example\.com/);
    expect(createImapClient).not.toHaveBeenCalled();
  });

  it("rejects the whole host when any resolved address is blocked", async () => {
    const createImapClient = imapClientFactory();
    const protocol = createMailProtocol(guardedConfig, {
      createImapClient,
      // A public answer paired with a private one must not let the host through:
      // the connection library is free to pick either address.
      resolveHostAddresses: async () => ["93.184.216.34", "10.0.0.5"],
    });

    await expect(protocol.validateImapCredential(credential)).rejects.toThrow(/imap\.example\.com/);
    expect(createImapClient).not.toHaveBeenCalled();
  });

  it("pins the resolved address and keeps the hostname for TLS verification", async () => {
    const createImapClient = imapClientFactory();
    const protocol = createMailProtocol(guardedConfig, {
      createImapClient,
      resolveHostAddresses: async () => ["93.184.216.34"],
    });

    await protocol.validateImapCredential(credential);

    const config = configPassedTo(createImapClient);
    expect(config.host).toBe("93.184.216.34");
    expect(config.servername).toBe("imap.example.com");
  });

  it("pins the SMTP host too", async () => {
    const createSmtpTransport = smtpTransportFactory();
    const protocol = createMailProtocol(guardedConfig, {
      createSmtpTransport,
      resolveHostAddresses: async () => ["93.184.216.34"],
    });

    await protocol.validateSmtpCredential(credential);

    const config = configPassedTo(createSmtpTransport);
    expect(config.host).toBe("93.184.216.34");
    expect(config.servername).toBe("smtp.example.com");
  });

  it("leaves providers without the policy untouched", async () => {
    const createImapClient = imapClientFactory();
    const resolveHostAddresses = vi.fn(async () => ["127.0.0.1"]);
    const protocol = createMailProtocol(unguardedConfig, {
      createImapClient,
      resolveHostAddresses,
    });

    await protocol.validateImapCredential(credential);

    const config = configPassedTo(createImapClient);
    expect(config.host).toBe("imap.example.com");
    expect(config.servername).toBeUndefined();
    expect(resolveHostAddresses).not.toHaveBeenCalled();
  });

  it("accepts a private address when the deployment opted in", async () => {
    setPrivateNetworkAccessAllowed(true);
    const createImapClient = imapClientFactory();
    const protocol = createMailProtocol(guardedConfig, {
      createImapClient,
      resolveHostAddresses: async () => ["10.0.0.5"],
    });

    await protocol.validateImapCredential(credential);

    expect(configPassedTo(createImapClient).host).toBe("10.0.0.5");
  });

  it("still blocks loopback when the deployment opted in to private networks", async () => {
    setPrivateNetworkAccessAllowed(true);
    const createImapClient = imapClientFactory();
    const protocol = createMailProtocol(guardedConfig, {
      createImapClient,
      resolveHostAddresses: async () => ["127.0.0.1"],
    });

    await expect(protocol.validateImapCredential(credential)).rejects.toThrow(/imap\.example\.com/);
    expect(createImapClient).not.toHaveBeenCalled();
  });

  it("screens an IP literal host without resolving it", async () => {
    const createImapClient = imapClientFactory();
    const resolveHostAddresses = vi.fn(async () => ["93.184.216.34"]);
    const protocol = createMailProtocol(guardedConfig, {
      createImapClient,
      resolveHostAddresses,
    });

    await expect(protocol.validateImapCredential({ ...credential, imapHost: "127.0.0.1" })).rejects.toThrow(
      /127\.0\.0\.1/,
    );
    expect(resolveHostAddresses).not.toHaveBeenCalled();
  });

  it("does not disclose the resolved address it rejected", async () => {
    const protocol = createMailProtocol(guardedConfig, {
      createImapClient: imapClientFactory(),
      resolveHostAddresses: async () => ["10.11.12.13"],
    });

    // Echoing the address back would turn a rejected host into an internal
    // name-to-address oracle, which is what the guard exists to prevent.
    await expect(protocol.validateImapCredential(credential)).rejects.toThrow(
      /imap\.example\.com resolves to a private or reserved address/,
    );
    await expect(protocol.validateImapCredential(credential)).rejects.not.toThrow(/10\.11\.12\.13/);
  });

  it("pins the IPv4 answer when a host resolves to both families", async () => {
    const createImapClient = imapClientFactory();
    const protocol = createMailProtocol(guardedConfig, {
      createImapClient,
      // AAAA first, as a dual-stack resolver commonly answers. Pinning the IPv6
      // address would strand an IPv4-only deployment with ENETUNREACH, because
      // pinning removes the transport's own family fallback.
      resolveHostAddresses: async () => ["2606:2800:220:1:248:1893:25c8:1946", "93.184.216.34"],
    });

    await protocol.validateImapCredential(credential);

    const config = configPassedTo(createImapClient);
    expect(config.host).toBe("93.184.216.34");
    expect(config.servername).toBe("imap.example.com");
  });

  it("keeps implicit TLS on the default submission port", async () => {
    const createSmtpTransport = smtpTransportFactory();
    const protocol = createMailProtocol(guardedConfig, {
      createSmtpTransport,
      resolveHostAddresses: async () => ["93.184.216.34"],
    });

    await protocol.validateSmtpCredential(credential);

    expect(configPassedTo(createSmtpTransport)).toMatchObject({ port: 465, secure: true, requireTLS: false });
  });

  it("switches to required STARTTLS on a submission port that is not 465", async () => {
    const createSmtpTransport = smtpTransportFactory();
    const protocol = createMailProtocol(guardedConfig, {
      createSmtpTransport,
      resolveHostAddresses: async () => ["93.184.216.34"],
    });

    await protocol.validateSmtpCredential({ ...credential, smtpPort: 587 });

    // requireTLS keeps the upgrade mandatory, so the password is never sent in
    // the clear to a server that does not offer STARTTLS.
    expect(configPassedTo(createSmtpTransport)).toMatchObject({ port: 587, secure: false, requireTLS: true });
  });

  it("pins an IPv6 answer when the host has no IPv4 record", async () => {
    const createImapClient = imapClientFactory();
    const protocol = createMailProtocol(guardedConfig, {
      createImapClient,
      resolveHostAddresses: async () => ["2606:2800:220:1:248:1893:25c8:1946"],
    });

    await protocol.validateImapCredential(credential);

    expect(configPassedTo(createImapClient).host).toBe("2606:2800:220:1:248:1893:25c8:1946");
  });
});
