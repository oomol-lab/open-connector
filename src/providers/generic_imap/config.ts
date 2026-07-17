import type { MailCredential } from "../../mail/imap-smtp/protocol.ts";
import type { MailRuntimeConfig } from "../../mail/imap-smtp/runtime.ts";

import { assertPublicHttpUrl, isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { ProviderRequestError } from "../provider-runtime.ts";

/**
 * Generic IMAP/SMTP mailbox runtime configuration.
 *
 * Unlike the provider-specific mail integrations, the IMAP and SMTP hosts are
 * supplied by the user, so any mailbox exposing IMAP over implicit TLS can be
 * connected with an application password.
 */
export const genericImapRuntimeConfig: MailRuntimeConfig = {
  service: "generic_imap",
  displayName: "IMAP Mailbox",
  attachmentFallbackPrefix: "imap",
  connectAuthMessage:
    "Verify that IMAP access is enabled for the mailbox and use an application password rather than the account login password.",
  readCredential(values): MailCredential {
    const email = values.email?.trim() ?? "";
    const authorizationCode = values.password?.trim() ?? "";

    const parts = email.split("@");
    const hasWhitespace = [...email].some((character) => character.trim().length === 0);
    if (parts.length !== 2 || !parts[0] || !parts[1] || hasWhitespace) {
      throw new ProviderRequestError(400, "IMAP mailbox email must be a valid email address.");
    }
    if (!authorizationCode) {
      throw new ProviderRequestError(400, "IMAP mailbox password must not be empty.");
    }

    // Both hosts come from user input, so they are resolved against the shared
    // SSRF policy rather than a bespoke hostname check. The deployment flag is
    // read per call so it always reflects the current bootstrap configuration.
    const allowPrivateNetwork = isPrivateNetworkAccessAllowed();
    const imapHost = assertMailHost(
      values.imapHost?.trim() ?? "",
      "IMAP host",
      "imap.example.com",
      allowPrivateNetwork,
    );
    const smtpHost = assertMailHost(
      values.smtpHost?.trim() || defaultSmtpHost(imapHost),
      "SMTP host",
      "smtp.example.com",
      allowPrivateNetwork,
    );

    return { email, authorizationCode, imapHost, smtpHost };
  },
};

function defaultSmtpHost(imapHost: string): string {
  return imapHost.startsWith("imap.") ? `smtp.${imapHost.slice("imap.".length)}` : imapHost;
}

/**
 * Validate a user-supplied mailbox host against the shared SSRF policy and
 * return its normalized form.
 *
 * IMAP and SMTP connect over implicit TLS sockets instead of `providerFetch`, so
 * the guarded fetch never sees these hosts and the credential path is the only
 * place the policy can be applied. The value is checked as a bare hostname first
 * so that scheme, userinfo, port, or path forms cannot smuggle a different
 * target past the URL parser, then handed to the shared `assertPublicHttpUrl`
 * guard: this provider inherits the cloud-metadata, loopback, link-local,
 * reserved, and IPv6 blocklists rather than re-implementing them. Private
 * (RFC 1918 / CGNAT / private-suffix) mailboxes stay blocked unless the
 * deployment opts in through `OOMOL_CONNECT_ALLOW_PRIVATE_NETWORK`.
 */
function assertMailHost(host: string, fieldName: string, example: string, allowPrivateNetwork: boolean): string {
  if (!isBareHostname(host)) {
    throw new ProviderRequestError(400, `${fieldName} must be a valid hostname, such as ${example}.`);
  }
  const url = assertPublicHttpUrl(`https://${host}`, {
    fieldName,
    createError: (message) => new ProviderRequestError(400, message),
    allowPrivateNetwork,
  });
  return url.hostname;
}

/**
 * Whether the value is a bare dotted hostname: labels and dots only, with no
 * scheme, userinfo, port, or path.
 *
 * This is a syntax gate, not the SSRF decision. It runs before
 * `assertPublicHttpUrl` so the URL parser only ever receives a host, and it
 * deliberately still matches IP literals, which the shared guard then classifies
 * and rejects.
 */
function isBareHostname(host: string): boolean {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(host);
}
