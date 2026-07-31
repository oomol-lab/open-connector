import type { MailCredential } from "./protocol.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { isPrivateNetworkAccessAllowed, setPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { createMailProtocol } from "./protocol.ts";

const credential: MailCredential = {
  email: "user@example.com",
  authorizationCode: "app-password",
  imapHost: "imap.example.com",
  smtpHost: "smtp.example.com",
};

const guardedConfig = {
  displayName: "IMAP Mailbox",
  attachmentFallbackPrefix: "imap",
  enforceHostNetworkPolicy: true,
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
});
