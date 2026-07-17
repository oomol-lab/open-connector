import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { MailActionName } from "../../mail/imap-smtp/actions.ts";

import { createMailActions } from "../../mail/imap-smtp/actions.ts";

export const genericImapActions: readonly ProviderActionDefinition<MailActionName>[] = createMailActions(
  "generic_imap",
  "IMAP Mailbox",
);
