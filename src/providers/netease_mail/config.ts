import type { MailCredential } from "../../mail/imap-smtp/protocol.ts";
import type { MailRuntimeConfig } from "../../mail/imap-smtp/runtime.ts";

import { ProviderRequestError } from "../provider-runtime.ts";

const serversByDomain = new Map([
  ["163.com", { imapHost: "imap.163.com", smtpHost: "smtp.163.com" }],
  ["126.com", { imapHost: "imap.126.com", smtpHost: "smtp.126.com" }],
  ["yeah.net", { imapHost: "imap.yeah.net", smtpHost: "smtp.yeah.net" }],
]);

export const neteaseMailRuntimeConfig: MailRuntimeConfig = {
  service: "netease_mail",
  displayName: "NetEase Mail",
  attachmentFallbackPrefix: "netease-mail",
  connectAuthMessage:
    "Verify that NetEase Mail IMAP/SMTP service is enabled and use the 16-character client authorization code instead of the web login password.",
  readCredential(values): MailCredential {
    const email = values.email?.trim() ?? "";
    const authorizationCode = values.authorizationCode?.trim() ?? "";
    const parts = email.split("@");
    const hasWhitespace = [...email].some((character) => character.trim().length === 0);
    if (parts.length !== 2 || !parts[0] || !parts[1] || hasWhitespace) {
      throw new ProviderRequestError(400, "NetEase Mail email must be a valid email address.");
    }

    const domain = parts[1].toLowerCase();
    const servers = serversByDomain.get(domain);
    if (!servers) {
      throw new ProviderRequestError(
        400,
        "NetEase Mail supports only 163.com, 126.com, and yeah.net personal accounts.",
      );
    }
    if (authorizationCode.length !== 16) {
      throw new ProviderRequestError(400, "NetEase Mail authorization code must be 16 characters.");
    }

    return { email, authorizationCode, ...servers };
  },
};
