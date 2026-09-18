import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "y_gy";
const linkIdInputSchema = s.anyOf("The Y.GY link identifier returned by the API.", [
  s.positiveInteger("The numeric form of the Y.GY link identifier."),
  s.string({
    minLength: 1,
    pattern: "^[1-9][0-9]*$",
    description: "The positive-integer string form of a Y.GY link identifier, containing decimal digits only.",
  }),
]);
const hexColorSchema = (description: string) => s.stringPattern("^#[0-9A-Fa-f]{6}$", { description });
const tagSchema = s.requiredObject("A tag associated with a Y.GY link.", {
  id: s.integer("The unique tag identifier."),
  name: s.string("The tag name."),
  created_at: s.string("The timestamp string returned by Y.GY for tag creation."),
  organization_id: s.integer("The organization identifier that owns the tag."),
});
const linkProperties = {
  id: s.integer("The unique Y.GY link identifier."),
  destination_url: s.url("The destination URL reached through the short link."),
  url: s.url("The complete shortened URL."),
  created_at: s.string("The timestamp string returned by Y.GY for link creation."),
  domain: s.string("The domain used by the short link."),
  suffix: s.string("The path suffix used by the short link."),
  organization_id: s.integer("The organization identifier that owns the link."),
  og_title: s.nullableString("The Open Graph title, or null when none is configured."),
  og_description: s.nullableString("The Open Graph description, or null when none is configured."),
  og_image: s.nullableString("The Open Graph image URL, or null when none is configured."),
  expiration_date: s.nullableString("The expiration timestamp, or null for no expiration."),
  qr_code_svg: s.string("The SVG markup for the generated QR code."),
  qr_code_png: s.nullableString("The generated QR code PNG URL, or null when PNG generation is disabled."),
  qr_code_foreground_hex: s.string("The QR code foreground color returned by Y.GY."),
  qr_code_background_hex: s.string("The QR code background color returned by Y.GY."),
  has_password: s.boolean("Whether the link is password protected."),
  android_link_destination: s.nullableString("The Android-specific destination URL, or null when none is configured."),
  ios_link_destination: s.nullableString("The iOS-specific destination URL, or null when none is configured."),
  bot_protection: s.nullableBoolean("Whether bot protection is enabled, or null when the setting is unavailable."),
  captcha: s.nullableBoolean("Whether CAPTCHA protection is enabled, or null when the setting is unavailable."),
  name: s.nullableString("The internal link name, or null when none is configured."),
  tags: s.array("Tags associated with the link.", tagSchema),
  webhook_url: s.nullableString("The webhook destination URL, or null when no webhook is configured."),
};
const linkSchema = s.object("A normalized Y.GY short link.", linkProperties, {
  required: ["id", "destination_url", "url"],
});
const destinationSchema = s.nonWhitespaceString("The destination URL or hostname/path that Y.GY should redirect to.");
const mutableLinkFields = {
  destination_url: destinationSchema,
  password: s.nonEmptyString("The password required to access the short link."),
  og_title: s.nonEmptyString("The updated title used in social link previews."),
  og_description: s.nonEmptyString("The updated description used in social link previews."),
  og_image: s.url("The updated image URL used in social link previews."),
  expiration_date: s.dateTime("The ISO 8601 timestamp when the short link should expire."),
  qr_code_foreground_hex: hexColorSchema("The six-digit foreground color for the QR code."),
  qr_code_background_hex: hexColorSchema("The six-digit background color for the QR code."),
  name: s.nonEmptyString("The updated internal name for the short link."),
  android_link_destination: s.url("The destination URL used for Android visitors."),
  ios_link_destination: s.url("The destination URL used for iOS visitors."),
  bot_protection: s.boolean("Whether bots should be blocked from following the short link."),
  captcha: s.boolean("Whether visitors must pass a CAPTCHA before being redirected."),
  webhook_url: s.url("The URL that Y.GY should notify with real-time link updates."),
  webhook_auth_key: s.nonEmptyString("The authentication key Y.GY should use for webhook requests."),
};
const updateFields = [
  "destination_url",
  "password",
  "og_title",
  "og_description",
  "og_image",
  "expiration_date",
  "qr_code_foreground_hex",
  "qr_code_background_hex",
  "name",
  "android_link_destination",
  "ios_link_destination",
  "bot_protection",
  "captcha",
  "webhook_url",
  "webhook_auth_key",
  "add_tags",
  "remove_tags",
];

export const yGyActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_link",
    operationType: "write",
    description: "Create a Y.GY short link with optional QR, security, and routing settings.",
    followUpActions: ["y_gy.get_link", "y_gy.update_link", "y_gy.delete_link"],
    inputSchema: s.object(
      "Input payload for creating a Y.GY short link.",
      {
        destination_url: destinationSchema,
        domain: s.nonEmptyString("A verified Y.GY custom domain, or y.gy when omitted."),
        suffix: s.nonEmptyString("The preferred custom suffix for the short link."),
        password: mutableLinkFields.password,
        og_title: mutableLinkFields.og_title,
        og_description: mutableLinkFields.og_description,
        og_image: mutableLinkFields.og_image,
        expiration_date: mutableLinkFields.expiration_date,
        qr_code_foreground_hex: mutableLinkFields.qr_code_foreground_hex,
        qr_code_background_hex: mutableLinkFields.qr_code_background_hex,
        name: s.nonEmptyString("An internal name for the short link."),
        tags: s.array(
          "Tag identifiers to associate with the short link.",
          s.positiveInteger("A Y.GY tag identifier."),
          { minItems: 1 },
        ),
        android_link_destination: mutableLinkFields.android_link_destination,
        ios_link_destination: mutableLinkFields.ios_link_destination,
        webhook_url: mutableLinkFields.webhook_url,
        webhook_auth_key: mutableLinkFields.webhook_auth_key,
        disable_png: s.boolean("Whether Y.GY should skip PNG generation and return only the SVG QR code."),
      },
      {
        optional: [
          "domain",
          "suffix",
          "password",
          "og_title",
          "og_description",
          "og_image",
          "expiration_date",
          "qr_code_foreground_hex",
          "qr_code_background_hex",
          "name",
          "tags",
          "android_link_destination",
          "ios_link_destination",
          "webhook_url",
          "webhook_auth_key",
          "disable_png",
        ],
      },
    ),
    outputSchema: linkSchema,
  }),
  defineProviderAction(service, {
    name: "get_link",
    operationType: "read",
    description: "Get one Y.GY short link by its identifier.",
    followUpActions: ["y_gy.update_link", "y_gy.delete_link"],
    inputSchema: s.requiredObject("Input payload for reading a Y.GY short link.", {
      id: linkIdInputSchema,
    }),
    outputSchema: linkSchema,
  }),
  defineProviderAction(service, {
    name: "list_links",
    operationType: "read",
    description: "List Y.GY short links with offset pagination.",
    inputSchema: s.object(
      "Input payload for listing Y.GY short links.",
      {
        limit: s.positiveInteger("The maximum number of links to return; Y.GY defaults to 25."),
        offset: s.nonNegativeInteger("The number of links to skip before collecting results."),
      },
      { optional: ["limit", "offset"] },
    ),
    outputSchema: s.requiredObject("A paginated Y.GY link collection.", {
      links: s.array("The links returned for the requested range.", linkSchema),
      total_links: s.nonNegativeInteger("The total number of links in the Y.GY account."),
    }),
  }),
  defineProviderAction(service, {
    name: "update_link",
    operationType: "write",
    description: "Update the documented mutable settings of a Y.GY short link.",
    followUpActions: ["y_gy.get_link"],
    inputSchema: {
      ...s.object(
        "Input payload for updating a Y.GY short link.",
        {
          id: linkIdInputSchema,
          ...mutableLinkFields,
          add_tags: s.array(
            "Tag identifiers to add to the short link.",
            s.positiveInteger("A Y.GY tag identifier to add."),
            { minItems: 1 },
          ),
          remove_tags: s.array(
            "Tag identifiers to remove from the short link.",
            s.positiveInteger("A Y.GY tag identifier to remove."),
            { minItems: 1 },
          ),
        },
        { required: ["id"] },
      ),
      anyOf: updateFields.map((field) => ({ required: [field] })),
    },
    outputSchema: linkSchema,
  }),
  defineProviderAction(service, {
    name: "delete_link",
    operationType: "destructive",
    description: "Delete a Y.GY short link by its identifier.",
    inputSchema: s.requiredObject("Input payload for deleting a Y.GY short link.", {
      id: linkIdInputSchema,
    }),
    outputSchema: s.requiredObject("Acknowledgement for a deleted Y.GY short link.", {
      id: s.positiveInteger("The Y.GY link identifier returned by the API."),
      deleted: s.literal(true, {
        description: "Whether the short link was deleted successfully.",
      }),
    }),
  }),
];
