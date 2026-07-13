import type { MailCredential } from "../../mail/imap-smtp/protocol.ts";
import type { MailRuntimeConfig } from "../../mail/imap-smtp/runtime.ts";

import { ProviderRequestError } from "../provider-runtime.ts";

export const qqMailRuntimeConfig: MailRuntimeConfig = {
  service: "qq_mail",
  displayName: "QQ Mail",
  attachmentFallbackPrefix: "qq-mail",
  connectAuthMessage:
    "Verify that QQ Mail POP3/IMAP/SMTP service is enabled and use the 16-character authorization code instead of the web login password.",
  readCredential(values): MailCredential {
    const email = values.email?.trim() ?? "";
    const authorizationCode = values.authorizationCode?.trim() ?? "";

    const parts = email.split("@");
    const hasWhitespace = [...email].some((character) => character.trim().length === 0);
    if (parts.length !== 2 || !parts[0] || !parts[1] || hasWhitespace) {
      throw new ProviderRequestError(400, "QQ Mail email must be a valid email address.");
    }
    if (authorizationCode.length !== 16) {
      throw new ProviderRequestError(400, "QQ Mail authorization code must be 16 characters.");
    }

    return {
      email,
      authorizationCode,
      imapHost: "imap.qq.com",
      smtpHost: "smtp.qq.com",
    };
  },
};
