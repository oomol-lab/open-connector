import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { MailActionName } from "../../mail/imap-smtp/actions.ts";

import { createMailActions } from "../../mail/imap-smtp/actions.ts";

export const neteaseMailActions: readonly ProviderActionDefinition<MailActionName>[] = createMailActions(
  "netease_mail",
  "NetEase Mail",
);
