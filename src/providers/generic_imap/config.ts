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
  // The hosts come from user input, so the save-time hostname check below is not
  // enough on its own: the resolved addresses are screened again at connect time.
  enforceHostNetworkPolicy: true,
  readCredential(values): MailCredential {
    const email = values.email?.trim() ?? "";
    const authorizationCode = values.password ?? "";

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

    return {
      email,
      authorizationCode,
      imapHost,
      smtpHost,
      smtpPort: readSmtpPort(values.smtpPort?.trim() ?? ""),
    };
  },
};

/**
 * Read the optional submission port.
 *
 * The mailbox host is the user's, so its submission service is too: several
 * large mailboxes (iCloud, Outlook.com) only listen on 587 and never answer on
 * 465, which would otherwise make them unconnectable rather than merely
 * unsendable, since the connection test verifies SMTP as well as IMAP.
 */
function readSmtpPort(value: string): number | undefined {
  if (!value) {
    return undefined;
  }
  const port = Number(value);
  if (!/^\d+$/.test(value) || port < 1 || port > 65535) {
    throw new ProviderRequestError(400, "SMTP port must be a port number between 1 and 65535, such as 465 or 587.");
  }
  return port;
}

/**
 * Guess the submission host from the IMAP host.
 *
 * Mail hosts overwhelmingly mirror the IMAP name for submission, so a leading
 * `imap` label prefix is swapped for `smtp`: `imap.gmail.com` pairs with
 * `smtp.gmail.com`, `imap-mail.outlook.com` with `smtp-mail.outlook.com`. The
 * prefix has to end the token (`.` or `-`) so that names which merely start with
 * those letters (`imaps.example.com`) are left alone, as are single-host setups
 * (`mail.example.com`, `ssl0.ovh.net`) where IMAP and SMTP share one name.
 */
function defaultSmtpHost(imapHost: string): string {
  return /^imap[.-]/.test(imapHost) ? `smtp${imapHost.slice("imap".length)}` : imapHost;
}

/**
 * Validate a user-supplied mailbox host against the shared SSRF policy and
 * return its normalized form.
 *
 * The value is checked as a bare hostname first so that scheme, userinfo, port,
 * or path forms cannot smuggle a different target past the URL parser, then
 * handed to the shared `assertPublicHttpUrl` guard. The socket path performs the
 * shared resolved-address check again immediately before connecting. Private
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
 * Whether the value is a bare hostname: labels and dots only, with no scheme,
 * userinfo, port, or path.
 *
 * This is a syntax gate, not the SSRF decision. It runs before
 * `assertPublicHttpUrl` so the URL parser only ever receives a host, and it
 * deliberately still matches IP literals, which the shared guard then classifies
 * and rejects. Single-label names pass the gate too — a Compose service name or
 * a Tailscale MagicDNS short name is exactly the mailbox a deployment that opted
 * into private networks connects — and are judged by the same shared guard,
 * which still blocks `localhost` and anything resolving into a blocked range.
 */
function isBareHostname(host: string): boolean {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i.test(host);
}
