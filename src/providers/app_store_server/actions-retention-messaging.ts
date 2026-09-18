import type { ActionDefinition } from "../../core/types.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { nonEmptyString, service, uuidString } from "./schemas.ts";

const boundedString = (description: string, maxLength: number) => s.nonWhitespaceString(description, { maxLength });

const retentionImageSizes: readonly string[] = ["FULL_SIZE", "BULLET_POINT"];
const retentionHeaderPositions: readonly string[] = ["ABOVE_BODY", "ABOVE_IMAGE"];

const retentionApprovalStates: readonly string[] = ["PENDING", "APPROVED", "REJECTED"];
const retentionPerformanceTestStatuses: readonly string[] = ["PENDING", "PASS", "FAIL"];

const headerMaxLength = 66;
const bodyMaxLength = 144;
const altTextMaxLength = 150;
const bulletPointTextMaxLength = 66;

const accessNote =
  "Apple grants Retention Messaging API access per developer account; without it these endpoints answer 404 with no error body.";
const approvalNote =
  "Only images and messages in the APPROVED state are shown to customers; the sandbox approves uploads immediately.";

const nullableStateString = (description: string) =>
  s.nullableString(`${description} One of ${retentionApprovalStates.join(", ")}.`);

const imageIdentifierInput = uuidString(
  "UUID that identifies the image. You choose it when you upload the image and use it everywhere the image is referenced afterwards.",
);
const messageIdentifierInput = uuidString(
  "UUID that identifies the message. You choose it when you upload the message and use it everywhere the message is referenced afterwards.",
);
const productIdInput = nonEmptyString(
  "Product identifier of the auto-renewable subscription, as created in App Store Connect.",
);
const localeInput = nonEmptyString(
  "App Store locale short code the default message applies to, such as en-US or zh-Hans. The value is case-sensitive.",
);

const imageAltTextInput = boundedString(
  `Alternative text for the image, up to ${altTextMaxLength} characters.`,
  altTextMaxLength,
);

const messageImageInput = s.object(
  "Full-size image to show with the message. Omit it for messages you plan to use as switch-plan or promotional-offer messages, which cannot carry an image.",
  {
    imageIdentifier: imageIdentifierInput,
    altText: imageAltTextInput,
  },
);

const bulletPointInput = s.object("One bullet point with its icon.", {
  text: boundedString(
    `Text of the bullet point, up to ${bulletPointTextMaxLength} characters.`,
    bulletPointTextMaxLength,
  ),
  imageIdentifier: uuidString(
    "Identifier of a BULLET_POINT sized image (1024 by 1024 pixels) to use as the icon of this bullet point.",
  ),
  altText: imageAltTextInput,
});

const performanceTestConfigOutput = s.object(
  "Parameters Apple uses for the performance test. Apple may omit a field, in which case it is null.",
  {
    maxConcurrentRequests: s.nullableInteger("Maximum number of concurrent requests the test sends to your endpoint."),
    responseTimeThreshold: s.nullableInteger(
      "Maximum time in milliseconds your endpoint has to answer each request for it to count as a success.",
    ),
    successRateThreshold: s.nullableInteger("Percentage of requests that must succeed for the test to pass."),
    totalDuration: s.nullableInteger(
      "Total duration of the test in milliseconds. Add it to the time you initiated the test to know when results are final.",
    ),
    totalRequests: s.nullableInteger("Total number of requests the test sends."),
  },
  { required: [] },
);

const responseTimeOutput = (description: string) => s.nullableInteger(`${description}, in milliseconds.`);

const sandboxOnlyNote =
  "Available only on a connection whose environment is sandbox; Apple serves the performance test endpoints on the sandbox host alone.";

function deletedOutput(fields: Record<string, JsonSchema>, description: string) {
  return s.actionOutput(
    {
      ...fields,
      deleted: s.boolean("Always true once Apple confirmed the deletion."),
    },
    description,
  );
}

export const appStoreServerRetentionMessagingActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "upload_retention_image",
    operationType: "write",
    description: `Upload a PNG image for retention messages, either a FULL_SIZE image shown above the message body or a BULLET_POINT icon. The image starts in the PENDING state and Apple reviews it before it can be displayed; check the state with get_retention_image_list. Each app can hold up to 2000 images and an identifier can be uploaded only once. ${approvalNote} ${accessNote}`,
    requiredScopes: [],
    inputSchema: s.object(
      "The PNG image to upload and the identifier to file it under.",
      {
        imageIdentifier: imageIdentifierInput,
        imageSize: s.stringEnum(
          "Which slot the image is for. FULL_SIZE images must be 3840 pixels wide and 160 to 2160 pixels tall; BULLET_POINT images must be 1024 by 1024 pixels. Defaults to FULL_SIZE.",
          retentionImageSizes,
        ),
        file: s.transitFile("A PNG file previously uploaded to the local transit file API, up to 20 MB."),
      },
      { optional: ["imageSize"] },
    ),
    outputSchema: s.actionOutput(
      {
        imageIdentifier: s.string("Identifier the image was filed under."),
        imageSize: s.stringEnum("Slot the image was uploaded for.", retentionImageSizes),
        byteLength: s.integer("Number of PNG bytes sent to Apple."),
        uploaded: s.boolean("Always true once Apple accepted the upload."),
      },
      "Confirmation of the upload. The image is PENDING until Apple approves it.",
    ),
    followUpActions: ["app_store_server.get_retention_image_list"],
  }),
  defineProviderAction(service, {
    name: "get_retention_image_list",
    operationType: "read",
    description: `List every image uploaded for retention messaging in this app and environment, with its size slot and approval state. ${approvalNote} ${accessNote}`,
    requiredScopes: [],
    inputSchema: s.actionInput({}, [], "No input. The list covers the app and environment of this connection."),
    outputSchema: s.actionOutput(
      {
        images: s.array(
          "All uploaded images.",
          s.object(
            "One uploaded image.",
            {
              imageIdentifier: s.nullableString("Identifier of the image."),
              imageSize: s.nullableString(`Slot the image was uploaded for. One of ${retentionImageSizes.join(", ")}.`),
              imageState: nullableStateString("Approval state of the image."),
            },
            { required: [] },
          ),
        ),
      },
      "The uploaded images and their states.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_retention_image",
    operationType: "destructive",
    description: `Delete an uploaded retention image. Apple refuses with 403 while a message still references the image, so delete the message first; a missing image answers 404. ${accessNote}`,
    requiredScopes: [],
    inputSchema: s.actionInput(
      { imageIdentifier: imageIdentifierInput },
      ["imageIdentifier"],
      "Identifies the image to delete.",
    ),
    outputSchema: deletedOutput(
      { imageIdentifier: s.string("Identifier of the deleted image.") },
      "Confirmation of the deletion.",
    ),
  }),

  defineProviderAction(service, {
    name: "upload_retention_message",
    operationType: "write",
    description: `Upload the text of a retention message: a header, a body, optionally a full-size image and bullet points with icons. The message starts in the PENDING state and Apple reviews it; check the state with get_retention_message_list. Leave out image and bulletPoints for messages you will use as switch-plan or promotional-offer messages. Each app can hold up to 2000 messages and an identifier can be uploaded only once. ${approvalNote} ${accessNote}`,
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        messageIdentifier: messageIdentifierInput,
        header: boundedString(
          `Header text, up to ${headerMaxLength} characters. Shown above the body, or above the image when headerPosition is ABOVE_IMAGE.`,
          headerMaxLength,
        ),
        body: boundedString(`Body text, up to ${bodyMaxLength} characters.`, bodyMaxLength),
        image: messageImageInput,
        bulletPoints: s.array(
          "Bullet points to list under the body, each with a BULLET_POINT sized icon. Apple limits how many a message can carry.",
          bulletPointInput,
          { minItems: 1 },
        ),
        headerPosition: s.stringEnum(
          "Where the header goes: ABOVE_BODY (the default) or ABOVE_IMAGE, which requires an image.",
          retentionHeaderPositions,
        ),
      },
      ["messageIdentifier", "header", "body"],
      "The message text and the identifier to file it under.",
    ),
    outputSchema: s.actionOutput(
      {
        messageIdentifier: s.string("Identifier the message was filed under."),
        uploaded: s.boolean("Always true once Apple accepted the upload."),
      },
      "Confirmation of the upload. The message is PENDING until Apple approves it.",
    ),
    followUpActions: ["app_store_server.get_retention_message_list"],
  }),
  defineProviderAction(service, {
    name: "get_retention_message_list",
    operationType: "read",
    description: `List every message uploaded for retention messaging in this app and environment, with its approval state. A message that carries an image also needs that image to be APPROVED; check it with get_retention_image_list. ${accessNote}`,
    requiredScopes: [],
    inputSchema: s.actionInput({}, [], "No input. The list covers the app and environment of this connection."),
    outputSchema: s.actionOutput(
      {
        messages: s.array(
          "All uploaded messages.",
          s.object(
            "One uploaded message.",
            {
              messageIdentifier: s.nullableString("Identifier of the message."),
              messageState: nullableStateString("Approval state of the message."),
            },
            { required: [] },
          ),
        ),
      },
      "The uploaded messages and their states.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_retention_message",
    operationType: "destructive",
    description: `Delete an uploaded retention message. A missing message answers 404. Stop returning the identifier from your Get Retention Message endpoint first, and delete any image it used afterwards with delete_retention_image. ${accessNote}`,
    requiredScopes: [],
    inputSchema: s.actionInput(
      { messageIdentifier: messageIdentifierInput },
      ["messageIdentifier"],
      "Identifies the message to delete.",
    ),
    outputSchema: deletedOutput(
      { messageIdentifier: s.string("Identifier of the deleted message.") },
      "Confirmation of the deletion.",
    ),
  }),

  defineProviderAction(service, {
    name: "configure_default_retention_message",
    operationType: "destructive",
    description: `Set the default retention message the App Store shows for one subscription product in one locale, replacing any default configured before. Only text-based messages, with or without an image, can be defaults, and both the message and its image must be APPROVED. Products without a default in a locale show no retention message there, and the default is also the fallback when your real-time endpoint fails. ${accessNote}`,
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        productId: productIdInput,
        locale: localeInput,
        messageIdentifier: uuidString("Identifier of the APPROVED message to use as the default."),
      },
      ["productId", "locale", "messageIdentifier"],
      "The product, locale and message to pair.",
    ),
    outputSchema: s.actionOutput(
      {
        productId: s.string("Product identifier the default applies to."),
        locale: s.string("Locale the default applies to."),
        messageIdentifier: s.string("Message now configured as the default."),
        configured: s.boolean("Always true once Apple confirmed the configuration."),
      },
      "Confirmation of the default message configuration.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_default_retention_message",
    operationType: "read",
    description: `Read which message is configured as the default retention message for one subscription product in one locale. Returns a null messageIdentifier when no default is configured there. ${accessNote}`,
    requiredScopes: [],
    inputSchema: s.actionInput(
      { productId: productIdInput, locale: localeInput },
      ["productId", "locale"],
      "The product and locale to look up.",
    ),
    outputSchema: s.actionOutput(
      {
        productId: s.string("Product identifier that was looked up."),
        locale: s.string("Locale that was looked up."),
        messageIdentifier: s.nullableString(
          "Message configured as the default, or null when the product has no default message in this locale.",
        ),
      },
      "The default message configuration, if any.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_default_retention_message",
    operationType: "destructive",
    description: `Remove the default retention message of one subscription product in one locale, so the App Store shows no retention message there. Succeeds even when no default was configured. ${accessNote}`,
    requiredScopes: [],
    inputSchema: s.actionInput(
      { productId: productIdInput, locale: localeInput },
      ["productId", "locale"],
      "The product and locale whose default to remove.",
    ),
    outputSchema: deletedOutput(
      {
        productId: s.string("Product identifier whose default was removed."),
        locale: s.string("Locale whose default was removed."),
      },
      "Confirmation of the removal.",
    ),
  }),

  defineProviderAction(service, {
    name: "configure_retention_realtime_url",
    operationType: "destructive",
    description: `Register the URL of your Get Retention Message endpoint for the environment of this connection, replacing any URL registered before. Once set, the App Store calls it whenever a subscriber opens the cancellation flow and shows the message you pick. A production URL is accepted only after your endpoint passed the sandbox performance test (Apple answers 403 otherwise). ${accessNote}`,
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        realtimeUrl: s.url(
          "URL of your Get Retention Message endpoint, reachable by Apple's servers. Use different URLs for sandbox and production.",
        ),
      },
      ["realtimeUrl"],
      "The endpoint URL to register.",
    ),
    outputSchema: s.actionOutput(
      {
        environment: s.string("Environment the URL was registered for, production or sandbox."),
        realtimeUrl: s.string("URL now registered."),
        configured: s.boolean("Always true once Apple confirmed the configuration."),
      },
      "Confirmation of the URL configuration.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_retention_realtime_url",
    operationType: "read",
    description: `Read the URL of the Get Retention Message endpoint registered for the environment of this connection. Returns a null realtimeUrl when none is registered. ${accessNote}`,
    requiredScopes: [],
    inputSchema: s.actionInput({}, [], "No input. The lookup covers the app and environment of this connection."),
    outputSchema: s.actionOutput(
      {
        environment: s.string("Environment that was looked up, production or sandbox."),
        realtimeUrl: s.nullableString(
          "Registered endpoint URL, or null when no URL is registered for this environment.",
        ),
      },
      "The registered endpoint URL, if any.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_retention_realtime_url",
    operationType: "destructive",
    description: `Unregister the Get Retention Message endpoint URL for the environment of this connection. Afterwards the App Store shows only default messages in that environment until a URL is registered again. ${accessNote}`,
    requiredScopes: [],
    inputSchema: s.actionInput({}, [], "No input. The removal covers the app and environment of this connection."),
    outputSchema: deletedOutput(
      { environment: s.string("Environment whose URL was removed, production or sandbox.") },
      "Confirmation of the removal.",
    ),
  }),

  defineProviderAction(service, {
    name: "initiate_retention_performance_test",
    operationType: "write",
    description: `Start Apple's performance test of the Get Retention Message endpoint registered in the sandbox, using an active sandbox subscription as the sample purchase. Passing the test is required before configure_retention_realtime_url accepts a production URL. Returns the request identifier and the test parameters; the test runs for the returned totalDuration. ${sandboxOnlyNote} ${accessNote}`,
    requiredScopes: [],
    asyncLifecycle: {
      startActionId: "app_store_server.initiate_retention_performance_test",
      statusActionId: "app_store_server.get_retention_performance_test_results",
    },
    inputSchema: s.actionInput(
      {
        originalTransactionId: nonEmptyString(
          "Original transaction identifier of an active auto-renewable subscription purchased in the sandbox environment. Family Sharing transactions are not accepted.",
        ),
      },
      ["originalTransactionId"],
      "The sandbox subscription the test requests are about.",
    ),
    outputSchema: s.actionOutput(
      {
        requestId: s.string("Identifier of the test run. Pass it to get_retention_performance_test_results."),
        config: performanceTestConfigOutput,
      },
      "The started test run and its parameters.",
    ),
    followUpActions: ["app_store_server.get_retention_performance_test_results"],
  }),
  defineProviderAction(service, {
    name: "get_retention_performance_test_results",
    operationType: "read",
    description: `Read the outcome of a sandbox performance test started with initiate_retention_performance_test: PENDING while it runs, then PASS or FAIL together with the measured response times, success rate and failure counts. ${sandboxOnlyNote} ${accessNote}`,
    requiredScopes: [],
    asyncLifecycle: {
      startActionId: "app_store_server.initiate_retention_performance_test",
      statusActionId: "app_store_server.get_retention_performance_test_results",
    },
    inputSchema: s.actionInput(
      {
        requestId: uuidString("Identifier of the test run, returned by initiate_retention_performance_test."),
      },
      ["requestId"],
      "Identifies the test run to read.",
    ),
    outputSchema: s.actionOutput(
      {
        requestId: s.string("Identifier of the test run that was read."),
        result: s.nullableString(`Overall outcome. One of ${retentionPerformanceTestStatuses.join(", ")}.`),
        target: s.nullableString("URL the test called."),
        successRate: s.nullableInteger("Percentage of requests your endpoint answered in time."),
        numPending: s.nullableInteger("Number of test requests still outstanding."),
        responseTimes: s.object(
          "Response times measured during the test. Apple may omit a field, in which case it is null.",
          {
            average: responseTimeOutput("Average response time"),
            p50: responseTimeOutput("50th percentile response time"),
            p90: responseTimeOutput("90th percentile response time"),
            p95: responseTimeOutput("95th percentile response time"),
            p99: responseTimeOutput("99th percentile response time"),
          },
          { required: [] },
        ),
        failures: s.record(
          "Failure counts keyed by Apple's send attempt result, such as TIMED_OUT or UNSUCCESSFUL_HTTP_RESPONSE_CODE. Empty when every request succeeded.",
          s.integer("Number of requests that ended with this result."),
        ),
        config: performanceTestConfigOutput,
      },
      "The test outcome and measurements.",
    ),
  }),
];
