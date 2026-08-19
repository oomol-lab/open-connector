import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "proxiedmail";

const nonEmptyString = (description: string) => s.nonEmptyString(description);
const emailAddress = (description: string) => s.string({ format: "email", minLength: 1, description });
const callbackUrlString = (description: string) =>
  s.anyOf(
    [
      s.literal("", { description: "An empty callback URL." }),
      s.url("A callback URL ProxiedMail should call when new mail arrives."),
    ],
    { description },
  );

const rawObjectSchema = s.looseObject("The raw object returned by ProxiedMail.");

const realAddressStatusSchema = s.looseObject(
  {
    is_enabled: s.boolean("Whether forwarding to this real address is enabled."),
    is_verified: s.boolean("Whether this real address has been verified."),
    is_verification_needed: s.boolean("Whether ProxiedMail reports verification is still needed."),
  },
  { description: "Status metadata for one real forwarding address." },
);

const proxyBindingAttributesSchema = s.looseObject(
  {
    real_addresses: s.record("Real forwarding addresses keyed by email address.", realAddressStatusSchema),
    proxy_address: s.string("The ProxiedMail proxy email address."),
    received_emails: s.integer("The number of received emails for this proxy binding."),
    description: s.string("The proxy binding description."),
    callback_url: s.string("The callback URL ProxiedMail calls when new mail arrives."),
    is_browsable: s.boolean("Whether received emails can be listed with the API."),
    created_at: s.string("The date and time when ProxiedMail created this proxy binding."),
    updated_at: s.string("The date and time when ProxiedMail last updated this proxy binding."),
    type: s.integer("The internal ProxiedMail binding type code."),
  },
  { description: "Attributes of a ProxiedMail proxy binding." },
);

const proxyBindingSchema = s.looseObject(
  {
    type: s.string("The JSON:API resource type, usually proxy_bindings."),
    id: s.string("The ProxiedMail proxy binding ID."),
    attributes: proxyBindingAttributesSchema,
    relationships: rawObjectSchema,
  },
  { description: "A ProxiedMail proxy binding resource." },
);

const proxyBindingMetaSchema = s.looseObject(
  {
    usedProxyBindings: s.integer("The number of proxy bindings used by the account."),
    availableProxyBindings: s.integer("The number of proxy bindings available to the account."),
    isVerificationEmailSend: s.boolean("Whether ProxiedMail sent a verification email."),
    firstProxyBinding: s.boolean("Whether this response is for the account's first proxy binding."),
  },
  { description: "Metadata returned with proxy binding responses." },
);

const realAddressUpdatesSchema = s.record(
  "Real forwarding addresses keyed by email address with true to enable and false to disable.",
  s.boolean("Whether this real forwarding address should be enabled."),
);

const receivedEmailLinkAttributesSchema = s.looseObject(
  {
    recipient_email: s.string("The proxy email address that received the message."),
    sender_email: s.string("The sender email address."),
    subject: s.string("The received email subject."),
    attachmentsCounter: s.integer("The number of attachments reported by ProxiedMail."),
    link: s.string("The API path for fetching the received email payload."),
    is_processed: s.boolean("Whether ProxiedMail has processed the received email."),
    created_at: s.string("The date and time when ProxiedMail created the received email record."),
    updated_at: s.string("The date and time when ProxiedMail last updated the received email record."),
  },
  { description: "Attributes for a ProxiedMail received-email link." },
);

const receivedEmailLinkSchema = s.looseObject(
  {
    type: s.string("The JSON:API resource type, usually received_emails_link."),
    id: s.string("The ProxiedMail received email ID."),
    attributes: receivedEmailLinkAttributesSchema,
  },
  { description: "A ProxiedMail received-email link resource." },
);

const receivedEmailAttributesSchema = s.looseObject(
  {
    recipient_email: s.string("The proxy email address that received the message."),
    sender_email: s.string("The sender email address."),
    payload: s.looseObject("The message payload returned by ProxiedMail."),
    attachments: s.array(
      "Attachments returned by ProxiedMail for this received email.",
      s.unknown("One attachment payload."),
    ),
    is_processed: s.boolean("Whether ProxiedMail has processed the received email."),
    created_at: s.string("The date and time when ProxiedMail created the received email record."),
    updated_at: s.string("The date and time when ProxiedMail last updated the received email record."),
  },
  { description: "Attributes for one ProxiedMail email." },
);

const receivedEmailSchema = s.looseObject(
  {
    type: s.string("The JSON:API resource type, usually received_emails_details."),
    id: s.string("The ProxiedMail received email ID."),
    attributes: receivedEmailAttributesSchema,
  },
  { description: "A ProxiedMail received-email detail resource." },
);

export const proxiedmailActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_proxy_bindings",
    description: "List ProxiedMail proxy email bindings for the connected account.",
    inputSchema: s.object(
      {},
      {
        required: [],
        description: "No input is required for listing ProxiedMail proxy bindings.",
      },
    ),
    outputSchema: s.object(
      {
        meta: proxyBindingMetaSchema,
        proxyBindings: s.array("The proxy bindings returned by ProxiedMail.", proxyBindingSchema),
        raw: rawObjectSchema,
      },
      {
        required: ["meta", "proxyBindings", "raw"],
        description: "The response returned when listing ProxiedMail proxy bindings.",
      },
    ),
  }),
  defineProviderAction(service, {
    name: "create_proxy_binding",
    description: "Create a ProxiedMail proxy email binding that forwards to real addresses.",
    inputSchema: s.object(
      {
        realAddresses: s.array(
          "Real email addresses that should receive mail forwarded from the proxy address.",
          emailAddress("One real forwarding email address."),
          { minItems: 1 },
        ),
        proxyAddress: emailAddress("The proxy email address ProxiedMail should issue."),
        callbackUrl: callbackUrlString(
          "The callback URL ProxiedMail should call when new mail arrives, or an empty string.",
        ),
        isBrowsable: s.boolean("Whether received emails should be listable through the API."),
      },
      {
        required: ["realAddresses", "proxyAddress"],
        description: "Input for creating a ProxiedMail proxy binding.",
      },
    ),
    outputSchema: s.object(
      {
        meta: proxyBindingMetaSchema,
        proxyBinding: proxyBindingSchema,
        raw: rawObjectSchema,
      },
      {
        required: ["meta", "proxyBinding", "raw"],
        description: "The response returned after creating a ProxiedMail proxy binding.",
      },
    ),
  }),
  defineProviderAction(service, {
    name: "update_proxy_binding",
    description: "Update a ProxiedMail proxy email binding by ID.",
    inputSchema: s.object(
      {
        proxyBindingId: nonEmptyString("The ProxiedMail proxy binding ID to update."),
        realAddresses: realAddressUpdatesSchema,
        proxyAddress: emailAddress("The proxy email address for this binding."),
        description: s.string("The free-form description for this proxy binding."),
        callbackUrl: callbackUrlString(
          "The callback URL ProxiedMail should call when new mail arrives, or an empty string to clear it.",
        ),
        isBrowsable: s.boolean("Whether received emails should be listable through the API."),
      },
      {
        required: ["proxyBindingId"],
        description: "Input for updating a ProxiedMail proxy binding.",
      },
    ),
    outputSchema: s.object(
      {
        meta: proxyBindingMetaSchema,
        proxyBinding: proxyBindingSchema,
        raw: rawObjectSchema,
      },
      {
        required: ["meta", "proxyBinding", "raw"],
        description: "The response returned after updating a ProxiedMail proxy binding.",
      },
    ),
  }),
  defineProviderAction(service, {
    name: "list_received_email_links",
    description: "List received-email links for a browsable ProxiedMail proxy binding.",
    inputSchema: s.object(
      {
        proxyBindingId: nonEmptyString("The ProxiedMail proxy binding ID whose messages to list."),
      },
      {
        required: ["proxyBindingId"],
        description: "Input for listing ProxiedMail received-email links.",
      },
    ),
    outputSchema: s.object(
      {
        receivedEmailLinks: s.array("The received-email links returned by ProxiedMail.", receivedEmailLinkSchema),
        raw: rawObjectSchema,
      },
      {
        required: ["receivedEmailLinks", "raw"],
        description: "The response returned when listing ProxiedMail received-email links.",
      },
    ),
  }),
  defineProviderAction(service, {
    name: "get_received_email",
    description: "Get the payload and metadata for one ProxiedMail received email.",
    inputSchema: s.object(
      {
        receivedEmailId: nonEmptyString("The ProxiedMail received email ID to fetch."),
      },
      {
        required: ["receivedEmailId"],
        description: "Input for fetching one ProxiedMail received email.",
      },
    ),
    outputSchema: s.object(
      {
        receivedEmail: receivedEmailSchema,
        raw: rawObjectSchema,
      },
      {
        required: ["receivedEmail", "raw"],
        description: "The response returned when fetching one ProxiedMail received email.",
      },
    ),
  }),
];
