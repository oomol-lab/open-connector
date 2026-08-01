import type { GuardedFetchDnsLookup } from "../../core/guarded-fetch.ts";
import type { MailCredential } from "./protocol.ts";
import type { LookupFunction, TcpNetConnectOpts } from "node:net";

import { Socket } from "node:net";
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

const guardedConfig = {
  displayName: genericImapRuntimeConfig.displayName,
  attachmentFallbackPrefix: genericImapRuntimeConfig.attachmentFallbackPrefix,
  enforceHostNetworkPolicy: genericImapRuntimeConfig.enforceHostNetworkPolicy,
};

const unguardedConfig = {
  displayName: "Mail Test",
  attachmentFallbackPrefix: "mail-test",
};

const publicIpv4 = { address: "93.184.216.34", family: 4 };
const secondPublicIpv4 = { address: "93.184.216.35", family: 4 };
const publicIpv6 = { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 };

const initialPrivateNetworkAccess = isPrivateNetworkAccessAllowed();

afterEach(() => {
  setPrivateNetworkAccessAllowed(initialPrivateNetworkAccess);
});

function lookup(...addresses: Array<{ address: string; family: number }>): GuardedFetchDnsLookup {
  return async () => addresses;
}

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

function readLookupAddresses(lookupFunction: LookupFunction): Promise<Array<{ address: string; family: number }>> {
  return new Promise((resolve, reject) => {
    lookupFunction("mail.example.com", { all: true }, (error, addresses) => {
      if (error) {
        reject(error);
        return;
      }
      if (!Array.isArray(addresses)) {
        reject(new Error("lookup did not return all addresses"));
        return;
      }
      resolve(addresses);
    });
  });
}

function lookupFromImapConfig(config: Record<string, unknown>): LookupFunction {
  const tls = config.tls as { lookup: LookupFunction; autoSelectFamily: boolean };
  expect(tls.autoSelectFamily).toBe(true);
  return tls.lookup;
}

describe("mail host pinning", () => {
  it("rejects a hostname that resolves to loopback at connect time", async () => {
    const createImapClient = imapClientFactory();
    const protocol = createMailProtocol(guardedConfig, {
      createImapClient,
      lookup: lookup({ address: "127.0.0.1", family: 4 }),
    });

    await expect(protocol.validateImapCredential(credential)).rejects.toThrow(/IMAP host must not resolve/);
    expect(createImapClient).not.toHaveBeenCalled();
  });

  it("rejects a hostname that resolves to the cloud metadata address", async () => {
    const createImapClient = imapClientFactory();
    const protocol = createMailProtocol(guardedConfig, {
      createImapClient,
      lookup: lookup({ address: "169.254.169.254", family: 4 }),
    });

    await expect(protocol.validateImapCredential(credential)).rejects.toThrow(/IMAP host must not resolve/);
    expect(createImapClient).not.toHaveBeenCalled();
  });

  it("rejects the whole host when any resolved address is blocked", async () => {
    const createImapClient = imapClientFactory();
    const protocol = createMailProtocol(guardedConfig, {
      createImapClient,
      lookup: lookup(publicIpv4, { address: "10.0.0.5", family: 4 }),
    });

    await expect(protocol.validateImapCredential(credential)).rejects.toThrow(/IMAP host must not resolve/);
    expect(createImapClient).not.toHaveBeenCalled();
  });

  it("pins every screened address and keeps the hostname for IMAP TLS verification", async () => {
    const createImapClient = imapClientFactory();
    const protocol = createMailProtocol(guardedConfig, {
      createImapClient,
      lookup: lookup(publicIpv6, publicIpv4, secondPublicIpv4),
    });

    await protocol.validateImapCredential(credential);

    const config = configPassedTo(createImapClient);
    expect(config.host).toBe("imap.example.com");
    expect(config.servername).toBe("imap.example.com");
    await expect(readLookupAddresses(lookupFromImapConfig(config))).resolves.toEqual([
      publicIpv6,
      publicIpv4,
      secondPublicIpv4,
    ]);
  });

  it("opens SMTP through every screened address without resolving the hostname again", async () => {
    const createSmtpTransport = smtpTransportFactory();
    const socket = new Socket();
    const connectSocket = vi.fn((_options: TcpNetConnectOpts) => {
      queueMicrotask(() => socket.emit("connect"));
      return socket;
    });
    const protocol = createMailProtocol(guardedConfig, {
      createSmtpTransport,
      connectSocket,
      lookup: lookup(publicIpv4, secondPublicIpv4),
    });

    await protocol.validateSmtpCredential(credential);

    const config = configPassedTo(createSmtpTransport);
    expect(config.host).toBe("smtp.example.com");
    expect(config.servername).toBe("smtp.example.com");
    const getSocket = config.getSocket as (
      options: unknown,
      callback: (error: Error | null, result?: { connection: Socket }) => void,
    ) => void;
    const connection = await new Promise<Socket>((resolve, reject) => {
      getSocket({}, (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(result!.connection);
      });
    });
    const connectOptions = connectSocket.mock.calls[0]![0];
    expect(connectOptions).toMatchObject({ host: "smtp.example.com", port: 465, autoSelectFamily: true });
    await expect(readLookupAddresses(connectOptions.lookup!)).resolves.toEqual([publicIpv4, secondPublicIpv4]);
    connection.destroy();
  });

  it("leaves providers without the policy untouched", async () => {
    const createImapClient = imapClientFactory();
    const resolveHost = vi.fn(lookup({ address: "127.0.0.1", family: 4 }));
    const protocol = createMailProtocol(unguardedConfig, {
      createImapClient,
      lookup: resolveHost,
    });

    await protocol.validateImapCredential(credential);

    const config = configPassedTo(createImapClient);
    expect(config.host).toBe("imap.example.com");
    expect(config.servername).toBeUndefined();
    expect(config.tls).toBeUndefined();
    expect(resolveHost).not.toHaveBeenCalled();
  });

  it("accepts a private address when the deployment opted in", async () => {
    setPrivateNetworkAccessAllowed(true);
    const createImapClient = imapClientFactory();
    const privateAddress = { address: "10.0.0.5", family: 4 };
    const protocol = createMailProtocol(guardedConfig, {
      createImapClient,
      lookup: lookup(privateAddress),
    });

    await protocol.validateImapCredential(credential);

    const config = configPassedTo(createImapClient);
    await expect(readLookupAddresses(lookupFromImapConfig(config))).resolves.toEqual([privateAddress]);
  });

  it("still blocks loopback when the deployment opted in to private networks", async () => {
    setPrivateNetworkAccessAllowed(true);
    const createImapClient = imapClientFactory();
    const protocol = createMailProtocol(guardedConfig, {
      createImapClient,
      lookup: lookup({ address: "127.0.0.1", family: 4 }),
    });

    await expect(protocol.validateImapCredential(credential)).rejects.toThrow(/IMAP host must not resolve/);
    expect(createImapClient).not.toHaveBeenCalled();
  });

  it("screens an IP literal host without resolving it", async () => {
    const createImapClient = imapClientFactory();
    const resolveHost = vi.fn(lookup(publicIpv4));
    const protocol = createMailProtocol(guardedConfig, {
      createImapClient,
      lookup: resolveHost,
    });

    await expect(protocol.validateImapCredential({ ...credential, imapHost: "127.0.0.1" })).rejects.toThrow(
      /IMAP host must not target/,
    );
    expect(resolveHost).not.toHaveBeenCalled();
  });

  it("fails closed when the host resolves to no address at all", async () => {
    const createImapClient = imapClientFactory();
    const protocol = createMailProtocol(guardedConfig, {
      createImapClient,
      lookup: lookup(),
    });

    await expect(protocol.validateImapCredential(credential)).rejects.toThrow(
      /IMAP host could not be resolved for validation/,
    );
    expect(createImapClient).not.toHaveBeenCalled();
  });

  it("does not disclose the resolved address it rejected", async () => {
    const protocol = createMailProtocol(guardedConfig, {
      createImapClient: imapClientFactory(),
      lookup: lookup({ address: "10.11.12.13", family: 4 }),
    });

    await expect(protocol.validateImapCredential(credential)).rejects.toThrow(
      /IMAP host must not resolve to private or reserved IP addresses/,
    );
    await expect(protocol.validateImapCredential(credential)).rejects.not.toThrow(/10\.11\.12\.13/);
  });

  it("keeps implicit TLS on the default submission port", async () => {
    const createSmtpTransport = smtpTransportFactory();
    const protocol = createMailProtocol(guardedConfig, {
      createSmtpTransport,
      lookup: lookup(publicIpv4),
    });

    await protocol.validateSmtpCredential(credential);

    expect(configPassedTo(createSmtpTransport)).toMatchObject({ port: 465, secure: true, requireTLS: false });
  });

  it("switches to required STARTTLS on a submission port that is not 465", async () => {
    const createSmtpTransport = smtpTransportFactory();
    const protocol = createMailProtocol(guardedConfig, {
      createSmtpTransport,
      lookup: lookup(publicIpv4),
    });

    await protocol.validateSmtpCredential({ ...credential, smtpPort: 587 });

    expect(configPassedTo(createSmtpTransport)).toMatchObject({ port: 587, secure: false, requireTLS: true });
  });

  it("pins an IPv6 answer when the host has no IPv4 record", async () => {
    const createImapClient = imapClientFactory();
    const protocol = createMailProtocol(guardedConfig, {
      createImapClient,
      lookup: lookup(publicIpv6),
    });

    await protocol.validateImapCredential(credential);

    const config = configPassedTo(createImapClient);
    await expect(readLookupAddresses(lookupFromImapConfig(config))).resolves.toEqual([publicIpv6]);
  });
});
