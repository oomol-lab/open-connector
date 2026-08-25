import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "whatsapp";
const managementPermission = "whatsapp_business_management";
const messagingPermission = "whatsapp_business_messaging";

const phoneNumberId = s.nonEmptyString("Meta phone number ID for the WhatsApp Business number used by this action.");
const toNumber = s.nonEmptyString("Recipient phone number in international format without the plus sign.");
const wabaId = s.nonEmptyString("WhatsApp Business Account ID. Omit to use the default credential WABA ID.");
const fields = s.nonEmptyString("Comma-separated list of fields to retrieve.");
const mediaType = s.stringEnum("WhatsApp media type.", ["audio", "document", "image", "sticker", "video"]);
const paging = s.looseObject("Pagination data returned by Meta.", {
  cursors: s.looseObject("Cursor values returned by Meta.", {
    before: s.string("Cursor for the previous page."),
    after: s.string("Cursor for the next page."),
  }),
  previous: s.string("URL for the previous page, when provided."),
  next: s.string("URL for the next page, when provided."),
});
const messageSendResponse = s.actionOutput({
  contacts: s.array(
    "Resolved contacts associated with the delivery request.",
    s.object("One contact returned by Meta.", {
      input: s.string("Phone number submitted in the request."),
      wa_id: s.string("WhatsApp ID resolved by Meta for the contact."),
    }),
  ),
  messages: s.array(
    "Messages accepted by Meta.",
    s.object("One accepted message.", {
      id: s.string("Meta message identifier."),
    }),
  ),
});
const phoneNumber = s.looseObject("A WhatsApp Business phone number.", {
  id: s.string("Meta phone number ID."),
  display_phone_number: s.string("Phone number in display format, including country code."),
  verified_name: s.string("Verified business name shown to WhatsApp users."),
  quality_rating: s.string("Meta quality rating for this phone number."),
  code_verification_status: s.string("Verification status of the phone number."),
  platform_type: s.string("Hosting platform type, such as CLOUD_API."),
  last_onboarded_time: s.string("Timestamp for the latest phone number onboarding event."),
  throughput: s.looseObject("Messaging throughput information returned by Meta.", {
    level: s.string("Messaging throughput tier for the phone number."),
  }),
  webhook_configuration: s.looseObject("Webhook configuration returned by Meta.", {
    application: s.string("Webhook endpoint configured for the phone number, when Meta returns one."),
  }),
});
const template = s.looseObject("A WhatsApp message template.", {
  id: s.string("Meta template ID."),
  name: s.string("Template name."),
  status: s.string("Template status returned by Meta."),
  category: s.string("Template category."),
  language: s.string("Template language code."),
  components: s.array("Template components.", s.unknownObject("A template component returned by Meta.")),
});
const mediaInfo = s.looseObject("A WhatsApp media record.", {
  id: s.string("Meta media ID."),
  url: s.string("Short-lived download URL for the media file."),
  mime_type: s.string("MIME type of the uploaded media."),
  sha256: s.string("SHA256 hash of the media file."),
  file_size: s.integer("Size of the media file in bytes."),
  messaging_product: s.string("Messaging product identifier, typically whatsapp."),
});
const templateCreateComponent = s.looseObject("A component submitted when creating the template.", {
  type: s.stringEnum("Template component type.", ["HEADER", "BODY", "BUTTONS"]),
  text: s.string("Text value for BODY or TEXT HEADER components.", { maxLength: 1024 }),
  format: s.stringEnum("HEADER format.", ["TEXT", "IMAGE", "VIDEO", "DOCUMENT"]),
  buttons: s.array("Buttons defined for a BUTTONS component.", s.unknownObject("A template button."), {
    minItems: 1,
    maxItems: 3,
  }),
  example: s.record("Example placeholder values used for submission.", true),
});
const templateSendComponent = s.looseObject("Template component parameters passed to Meta.", {
  type: s.string("Template component type such as header, body, or button."),
  index: s.integer("Button index for button components."),
  sub_type: s.string("Button subtype such as quick_reply or url."),
  parameters: s.array("Parameters used to fill template placeholders.", s.unknownObject("A template parameter.")),
});
const contact = s.looseObject("A WhatsApp contact message payload.", {
  name: s.unknownObject("Contact name information."),
  org: s.unknownObject("Organization information."),
  emails: s.array("Email addresses for the contact.", s.unknownObject("A contact email.")),
  phones: s.array("Phone numbers for the contact.", s.unknownObject("A contact phone number.")),
  addresses: s.array("Postal addresses for the contact.", s.unknownObject("A contact address.")),
  birthday: s.string("Birthday in YYYY-MM-DD format."),
});
const buttonReply = s.object("A reply button.", {
  id: s.string("Unique identifier for the reply button.", { maxLength: 256 }),
  title: s.string("Button label shown to the user.", { maxLength: 20 }),
});
const listRow = s.object("An interactive list row.", {
  id: s.string("Unique identifier for the row.", { maxLength: 24 }),
  title: s.string("Row title shown to the user.", { maxLength: 24 }),
  description: s.string("Optional row description.", { maxLength: 72 }),
});
const listSection = s.object("An interactive list section.", {
  title: s.string("Section title.", { maxLength: 24 }),
  rows: s.array("Rows listed inside the section.", listRow, { minItems: 1, maxItems: 10 }),
});

function input(properties: Record<string, JsonSchema>, required: string[], description: string): JsonSchema {
  return s.actionInput(properties, required, description);
}

export const whatsappActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_phone_numbers",
    description: "List phone numbers for a WhatsApp Business Account.",
    providerPermissions: [managementPermission],
    inputSchema: input(
      {
        waba_id: wabaId,
        limit: s.integer("Maximum number of phone numbers to return.", { minimum: 1, maximum: 100, default: 25 }),
      },
      [],
      "Input for listing WhatsApp phone numbers.",
    ),
    outputSchema: s.actionOutput({
      phone_numbers: s.array("Phone numbers returned for the WABA.", phoneNumber),
      paging,
    }),
  }),
  defineProviderAction(service, {
    name: "get_phone_number",
    description: "Get metadata for a specific WhatsApp Business phone number.",
    providerPermissions: [managementPermission],
    inputSchema: input({ phone_number_id: phoneNumberId, fields }, ["phone_number_id"], "Input for a phone number."),
    outputSchema: phoneNumber,
  }),
  defineProviderAction(service, {
    name: "get_business_profile",
    description: "Get the business profile configured for a WhatsApp Business phone number.",
    providerPermissions: [managementPermission],
    inputSchema: input(
      {
        phone_number_id: phoneNumberId,
        fields,
      },
      ["phone_number_id"],
      "Input for reading a WhatsApp business profile.",
    ),
    outputSchema: s.looseObject("A WhatsApp business profile.", {
      messaging_product: s.string("Messaging product identifier, typically whatsapp."),
      about: s.string("About text shown on the business profile."),
      address: s.string("Business address."),
      description: s.string("Business description."),
      email: s.string("Business support email address."),
      profile_picture_url: s.string("Public URL for the business profile picture."),
      websites: s.array("Websites linked from the business profile.", s.string("A website URL.")),
      vertical: s.string("Business vertical selected in Meta."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_message_templates",
    description: "List message templates for a WhatsApp Business Account.",
    providerPermissions: [managementPermission],
    inputSchema: input(
      {
        waba_id: wabaId,
        after: s.string("Pagination cursor returned by a previous response."),
        limit: s.integer("Maximum number of templates to return.", { minimum: 1, maximum: 100, default: 25 }),
        status: s.string("Optional template status filter."),
        category: s.string("Optional template category filter."),
        language: s.string("Optional template language filter."),
        name_or_content: s.string("Optional filter that matches template name or content."),
      },
      [],
      "Input for listing WhatsApp message templates.",
    ),
    outputSchema: s.actionOutput({
      templates: s.array("Templates returned for the WABA.", template),
      paging,
    }),
  }),
  defineProviderAction(service, {
    name: "get_template_status",
    description: "Get status details for a specific message template.",
    providerPermissions: [managementPermission],
    inputSchema: input(
      { template_id: s.nonEmptyString("Meta template ID."), fields },
      ["template_id"],
      "Input for reading a WhatsApp template.",
    ),
    outputSchema: template,
  }),
  defineProviderAction(service, {
    name: "create_message_template",
    description: "Create a new WhatsApp message template for a WABA.",
    providerPermissions: [managementPermission],
    inputSchema: input(
      {
        waba_id: wabaId,
        name: s.string({ description: "Unique template name.", pattern: "^[a-z0-9_]+$", maxLength: 512 }),
        category: s.stringEnum("Template category.", ["AUTHENTICATION", "MARKETING", "UTILITY"]),
        language: s.string("Template language code such as en_US."),
        components: s.array("Components submitted when creating the template.", templateCreateComponent, {
          minItems: 1,
        }),
      },
      ["name", "category", "language", "components"],
      "Input for creating a WhatsApp message template.",
    ),
    outputSchema: s.actionOutput({
      id: s.string("Template ID created by Meta."),
      status: s.string("Initial template status returned by Meta."),
      category: s.string("Template category returned by Meta."),
    }),
  }),
  defineProviderAction(service, {
    name: "delete_message_template",
    description: "Delete all message template variants that share the same name.",
    providerPermissions: [managementPermission],
    inputSchema: input(
      { name: s.string("Template name to delete."), waba_id: wabaId },
      ["name"],
      "Input for deleting a WhatsApp message template.",
    ),
    outputSchema: s.actionOutput({ success: s.boolean("Whether the request completed successfully.") }),
  }),
  defineProviderAction(service, {
    name: "send_message",
    description: "Send a text message to a WhatsApp user.",
    providerPermissions: [messagingPermission],
    inputSchema: input(
      {
        phone_number_id: phoneNumberId,
        to_number: toNumber,
        text: s.string("Text body of the message to send.", { minLength: 1, maxLength: 4096 }),
        message_id: s.string("WhatsApp message ID. Omit to send a standalone message."),
        preview_url: s.boolean({
          description: "Whether Meta should render a link preview for the first URL in the text.",
          default: false,
        }),
      },
      ["phone_number_id", "to_number", "text"],
      "Input for sending a WhatsApp text message.",
    ),
    outputSchema: messageSendResponse,
  }),
  defineProviderAction(service, {
    name: "send_template_message",
    description: "Send an approved WhatsApp template message.",
    providerPermissions: [messagingPermission],
    inputSchema: input(
      {
        phone_number_id: phoneNumberId,
        to_number: toNumber,
        template_name: s.string("Approved template name."),
        language_code: s.string("Template language code used for delivery.", { default: "en_US" }),
        components: s.array("Template component parameters passed to Meta.", templateSendComponent),
      },
      ["phone_number_id", "to_number", "template_name"],
      "Input for sending a WhatsApp template message.",
    ),
    outputSchema: messageSendResponse,
  }),
  defineProviderAction(service, {
    name: "send_media",
    description: "Send a media message by public URL.",
    providerPermissions: [messagingPermission],
    inputSchema: input(
      {
        phone_number_id: phoneNumberId,
        media_type: mediaType,
        to_number: toNumber,
        link: s.url("Public HTTPS URL for the media file."),
        caption: s.string("Optional caption for image, video, or document messages.", { maxLength: 1024 }),
      },
      ["phone_number_id", "media_type", "to_number", "link"],
      "Input for sending a WhatsApp media message by URL.",
    ),
    outputSchema: messageSendResponse,
  }),
  defineProviderAction(service, {
    name: "send_media_by_id",
    description: "Send previously uploaded media by Meta media ID.",
    providerPermissions: [messagingPermission],
    inputSchema: input(
      {
        phone_number_id: phoneNumberId,
        to_number: toNumber,
        media_type: mediaType,
        media_id: s.nonEmptyString("Meta media ID."),
        caption: s.string("Optional caption for image, video, or document messages.", { maxLength: 1024 }),
        filename: s.string("Filename to attach when sending a document by media ID."),
        reply_to_message_id: s.string("WhatsApp message ID to reply to."),
      },
      ["phone_number_id", "to_number", "media_type", "media_id"],
      "Input for sending a WhatsApp media message by uploaded media ID.",
    ),
    outputSchema: messageSendResponse,
  }),
  defineProviderAction(service, {
    name: "upload_media",
    description: "Upload media to Meta and return the resulting media record.",
    providerPermissions: [messagingPermission],
    followUpActions: ["whatsapp.send_media_by_id"],
    inputSchema: input(
      {
        phone_number_id: phoneNumberId,
        media_type: mediaType,
        file: s.transitFile("Source file to upload to Meta."),
      },
      ["phone_number_id", "media_type", "file"],
      "Input for uploading WhatsApp media.",
    ),
    outputSchema: mediaInfo,
  }),
  defineProviderAction(service, {
    name: "get_media_info",
    description: "Get metadata and a short-lived download URL for uploaded media.",
    providerPermissions: [messagingPermission],
    inputSchema: input({ media_id: s.nonEmptyString("Meta media ID.") }, ["media_id"], "Input for reading media info."),
    outputSchema: mediaInfo,
  }),
  defineProviderAction(service, {
    name: "send_location",
    description: "Send a location message to a WhatsApp user.",
    providerPermissions: [messagingPermission],
    inputSchema: input(
      {
        phone_number_id: phoneNumberId,
        to_number: toNumber,
        latitude: s.union([s.number("Latitude in decimal degrees."), s.string("Latitude in decimal degrees.")]),
        longitude: s.union([s.number("Longitude in decimal degrees."), s.string("Longitude in decimal degrees.")]),
        name: s.string("Location title."),
        address: s.string("Location address."),
      },
      ["phone_number_id", "to_number", "latitude", "longitude", "name", "address"],
      "Input for sending a WhatsApp location message.",
    ),
    outputSchema: messageSendResponse,
  }),
  defineProviderAction(service, {
    name: "send_contacts",
    description: "Send one or more contacts to a WhatsApp user.",
    providerPermissions: [messagingPermission],
    inputSchema: input(
      {
        phone_number_id: phoneNumberId,
        to_number: toNumber,
        contacts: s.array("Contacts to send in the message.", contact, { minItems: 1 }),
      },
      ["phone_number_id", "to_number", "contacts"],
      "Input for sending WhatsApp contacts.",
    ),
    outputSchema: messageSendResponse,
  }),
  defineProviderAction(service, {
    name: "send_interactive_buttons",
    description: "Send an interactive reply-button message.",
    providerPermissions: [messagingPermission],
    inputSchema: input(
      {
        phone_number_id: phoneNumberId,
        to_number: toNumber,
        body_text: s.string("Body text shown above the buttons.", { maxLength: 1024 }),
        buttons: s.array("Reply buttons shown in the interactive message.", buttonReply, { minItems: 1, maxItems: 3 }),
        header_text: s.string("Optional header text.", { maxLength: 60 }),
        footer_text: s.string("Optional footer text.", { maxLength: 60 }),
        reply_to_message_id: s.string("WhatsApp message ID to reply to."),
      },
      ["phone_number_id", "to_number", "body_text", "buttons"],
      "Input for sending a WhatsApp interactive button message.",
    ),
    outputSchema: messageSendResponse,
  }),
  defineProviderAction(service, {
    name: "send_interactive_list",
    description: "Send an interactive list message with sections and rows.",
    providerPermissions: [messagingPermission],
    inputSchema: input(
      {
        phone_number_id: phoneNumberId,
        to_number: toNumber,
        body_text: s.string("Body text shown above the list button.", { maxLength: 1024 }),
        button_text: s.string("Label shown on the list button.", { maxLength: 20 }),
        sections: s.array("Sections and rows shown inside the interactive list.", listSection, {
          minItems: 1,
          maxItems: 10,
        }),
        header_text: s.string("Optional header text.", { maxLength: 60 }),
        footer_text: s.string("Optional footer text.", { maxLength: 60 }),
        reply_to_message_id: s.string("WhatsApp message ID to reply to."),
      },
      ["phone_number_id", "to_number", "body_text", "button_text", "sections"],
      "Input for sending a WhatsApp interactive list message.",
    ),
    outputSchema: messageSendResponse,
  }),
];
