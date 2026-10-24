import type { AppStoreServerContext, AppStoreServerHandler, AppStoreServerHandlers } from "./runtime-helpers.ts";

import {
  looseArray,
  optionalNumber,
  optionalString,
  pickOptionalString,
  rawStringOrNull,
  recordOrEmpty,
} from "../../core/cast.ts";
import { readTransitFileInput } from "../provider-files.ts";
import { ProviderRequestError, requiredInputString } from "../provider-runtime.ts";
import {
  appStoreServerPath,
  getAppStoreServerObject,
  readAppStoreServerId,
  readResponseInteger,
  writeAppStoreServerNoContent,
} from "./runtime-helpers.ts";

const messagingRoot = "/inApps/v1/messaging";

const maximumImageBytes = 20 * 1024 * 1024;

const defaultImageSize = "FULL_SIZE";
const bulletPointImageSize = "BULLET_POINT";

const fullSizeWidth = 3840;
const fullSizeMinHeight = 160;
const fullSizeMaxHeight = 2160;

const bulletPointEdge = 1024;

const defaultMessageNotFoundErrorCode = 4_040_020;
const realtimeUrlNotFoundErrorCode = 4_040_021;

const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const pngHeaderLength = 24;

const handlers: AppStoreServerHandlers = {
  async upload_retention_image(input, context) {
    const imageIdentifier = readAppStoreServerId(input.imageIdentifier, "imageIdentifier");
    const imageSize = optionalString(input.imageSize) ?? defaultImageSize;
    const bytes = await readImageBytes(input, context);
    assertPngDimensions(bytes, imageSize);

    await writeAppStoreServerNoContent(context, {
      method: "PUT",
      path: appStoreServerPath(`${messagingRoot}/image`, imageIdentifier),
      query: { imageSize },
      rawBody: { bytes, contentType: "image/png" },
      allowedStatuses: [200],
      label: "Upload Image",
    });

    return { imageIdentifier, imageSize, byteLength: bytes.byteLength, uploaded: true };
  },

  async get_retention_image_list(_input, context) {
    const envelope = await getAppStoreServerObject(context, {
      path: `${messagingRoot}/image/list`,
    });

    return {
      images: looseArray(envelope.imageIdentifiers).map((item) => {
        const image = recordOrEmpty(item);
        return {
          imageIdentifier: rawStringOrNull(image.imageIdentifier),
          imageSize: rawStringOrNull(image.imageSize),
          imageState: rawStringOrNull(image.imageState),
        };
      }),
    };
  },

  async delete_retention_image(input, context) {
    const imageIdentifier = readAppStoreServerId(input.imageIdentifier, "imageIdentifier");
    await writeAppStoreServerNoContent(context, {
      method: "DELETE",
      path: appStoreServerPath(`${messagingRoot}/image`, imageIdentifier),
      allowedStatuses: [200],
      label: "Delete Image",
    });

    return { imageIdentifier, deleted: true };
  },

  async upload_retention_message(input, context) {
    const messageIdentifier = readAppStoreServerId(input.messageIdentifier, "messageIdentifier");
    const image = input.image === undefined ? undefined : recordOrEmpty(input.image);
    const headerPosition = pickOptionalString(input, "headerPosition");
    if (headerPosition === "ABOVE_IMAGE" && image === undefined) {
      throw new ProviderRequestError(
        400,
        "headerPosition ABOVE_IMAGE requires an image; provide image or use ABOVE_BODY",
        undefined,
        "invalid_input",
      );
    }

    await writeAppStoreServerNoContent(context, {
      method: "PUT",
      path: appStoreServerPath(`${messagingRoot}/message`, messageIdentifier),
      body: {
        header: requiredInputString(input.header, "header"),
        body: requiredInputString(input.body, "body"),
        image:
          image === undefined
            ? undefined
            : {
                imageIdentifier: readAppStoreServerId(image.imageIdentifier, "image.imageIdentifier"),
                altText: requiredInputString(image.altText, "image.altText"),
              },
        bulletPoints:
          input.bulletPoints === undefined
            ? undefined
            : looseArray(input.bulletPoints).map((item) => {
                const bulletPoint = recordOrEmpty(item);
                return {
                  text: requiredInputString(bulletPoint.text, "bulletPoints.text"),
                  imageIdentifier: readAppStoreServerId(bulletPoint.imageIdentifier, "bulletPoints.imageIdentifier"),
                  altText: requiredInputString(bulletPoint.altText, "bulletPoints.altText"),
                };
              }),
        headerPosition,
      },
      allowedStatuses: [200],
      label: "Upload Message",
    });

    return { messageIdentifier, uploaded: true };
  },

  async get_retention_message_list(_input, context) {
    const envelope = await getAppStoreServerObject(context, {
      path: `${messagingRoot}/message/list`,
    });

    return {
      messages: looseArray(envelope.messageIdentifiers).map((item) => {
        const message = recordOrEmpty(item);
        return {
          messageIdentifier: rawStringOrNull(message.messageIdentifier),
          messageState: rawStringOrNull(message.messageState),
        };
      }),
    };
  },

  async delete_retention_message(input, context) {
    const messageIdentifier = readAppStoreServerId(input.messageIdentifier, "messageIdentifier");
    await writeAppStoreServerNoContent(context, {
      method: "DELETE",
      path: appStoreServerPath(`${messagingRoot}/message`, messageIdentifier),
      allowedStatuses: [200],
      label: "Delete Message",
    });

    return { messageIdentifier, deleted: true };
  },

  async configure_default_retention_message(input, context) {
    const productId = readAppStoreServerId(input.productId, "productId");
    const locale = readAppStoreServerId(input.locale, "locale");
    const messageIdentifier = readAppStoreServerId(input.messageIdentifier, "messageIdentifier");
    await writeAppStoreServerNoContent(context, {
      method: "PUT",
      path: appStoreServerPath(`${messagingRoot}/default`, productId, locale),
      body: { messageIdentifier },
      allowedStatuses: [200],
      label: "Configure Default Message",
    });

    return { productId, locale, messageIdentifier, configured: true };
  },

  async get_default_retention_message(input, context) {
    const productId = readAppStoreServerId(input.productId, "productId");
    const locale = readAppStoreServerId(input.locale, "locale");
    const envelope = await readOptionalObject(
      context,
      appStoreServerPath(`${messagingRoot}/default`, productId, locale),
      defaultMessageNotFoundErrorCode,
    );

    return {
      productId,
      locale,
      messageIdentifier: envelope ? rawStringOrNull(envelope.messageIdentifier) : null,
    };
  },

  async delete_default_retention_message(input, context) {
    const productId = readAppStoreServerId(input.productId, "productId");
    const locale = readAppStoreServerId(input.locale, "locale");
    await writeAppStoreServerNoContent(context, {
      method: "DELETE",
      path: appStoreServerPath(`${messagingRoot}/default`, productId, locale),
      allowedStatuses: [200],
      label: "Delete Default Message",
    });

    return { productId, locale, deleted: true };
  },

  async configure_retention_realtime_url(input, context) {
    const realtimeUrl = requiredInputString(input.realtimeUrl, "realtimeUrl");
    await writeAppStoreServerNoContent(context, {
      method: "PUT",
      path: `${messagingRoot}/realtime/url`,
      body: { realtimeURL: realtimeUrl },
      allowedStatuses: [200],
      label: "Configure Realtime URL",
    });

    return { environment: context.environment, realtimeUrl, configured: true };
  },

  async get_retention_realtime_url(_input, context) {
    const envelope = await readOptionalObject(context, `${messagingRoot}/realtime/url`, realtimeUrlNotFoundErrorCode);

    return {
      environment: context.environment,
      realtimeUrl: envelope ? rawStringOrNull(envelope.realtimeURL) : null,
    };
  },

  async delete_retention_realtime_url(_input, context) {
    await writeAppStoreServerNoContent(context, {
      method: "DELETE",
      path: `${messagingRoot}/realtime/url`,
      allowedStatuses: [200],
      label: "Delete Realtime URL",
    });

    return { environment: context.environment, deleted: true };
  },

  async initiate_retention_performance_test(input, context) {
    assertSandbox(context, "initiate_retention_performance_test");
    const envelope = await getAppStoreServerObject(context, {
      method: "POST",
      path: `${messagingRoot}/performanceTest`,
      body: {
        originalTransactionId: readAppStoreServerId(input.originalTransactionId, "originalTransactionId"),
      },
    });

    return {
      requestId: rawStringOrNull(envelope.requestId),
      config: readPerformanceTestConfig(envelope.config),
    };
  },

  async get_retention_performance_test_results(input, context) {
    assertSandbox(context, "get_retention_performance_test_results");
    const requestId = readAppStoreServerId(input.requestId, "requestId");
    const envelope = await getAppStoreServerObject(context, {
      path: appStoreServerPath(`${messagingRoot}/performanceTest/result`, requestId),
    });
    const responseTimes = recordOrEmpty(envelope.responseTimes);

    return {
      requestId,
      result: rawStringOrNull(envelope.result),
      target: rawStringOrNull(envelope.target),
      successRate: readResponseInteger(envelope.successRate),
      numPending: readResponseInteger(envelope.numPending),
      responseTimes: {
        average: readResponseInteger(responseTimes.average),
        p50: readResponseInteger(responseTimes.p50),
        p90: readResponseInteger(responseTimes.p90),
        p95: readResponseInteger(responseTimes.p95),
        p99: readResponseInteger(responseTimes.p99),
      },
      failures: readFailureCounts(envelope.failures),
      config: readPerformanceTestConfig(envelope.config),
    };
  },
};

export const appStoreServerRetentionMessagingHandlers: AppStoreServerHandlers = Object.fromEntries(
  Object.entries(handlers).map(([name, handler]) => [name, withAccessDiagnosis(handler)]),
);

function withAccessDiagnosis(handler: AppStoreServerHandler): AppStoreServerHandler {
  return async (input, context) => {
    try {
      return await handler(input, context);
    } catch (error) {
      if (isBodilessNotFound(error)) {
        throw new ProviderRequestError(
          400,
          "The App Store Server API answered 404 without an error body, which is how it reports that this developer account has no access to the Retention Messaging API. Request access in App Store Connect before using these actions.",
          error.details,
          "invalid_input",
        );
      }
      throw error;
    }
  };
}

function isBodilessNotFound(error: unknown): error is ProviderRequestError {
  return error instanceof ProviderRequestError && error.status === 404 && error.details === null;
}

async function readOptionalObject(
  context: AppStoreServerContext,
  path: string,
  notFoundErrorCode: number,
): Promise<Record<string, unknown> | undefined> {
  try {
    return await getAppStoreServerObject(context, { path });
  } catch (error) {
    if (
      error instanceof ProviderRequestError &&
      optionalNumber(recordOrEmpty(error.details).errorCode) === notFoundErrorCode
    ) {
      return undefined;
    }
    throw error;
  }
}

function assertSandbox(context: AppStoreServerContext, actionName: string): void {
  if (context.environment !== "sandbox") {
    throw new ProviderRequestError(
      400,
      `${actionName} is available only in the sandbox environment; Apple serves the Retention Messaging performance test on the sandbox host alone. Use a connection whose environment is sandbox.`,
      undefined,
      "invalid_input",
    );
  }
}

async function readImageBytes(input: Record<string, unknown>, context: AppStoreServerContext): Promise<Uint8Array> {
  const source = await readTransitFileInput(input.file, context);
  const bytes = new Uint8Array(await source.file.arrayBuffer());
  if (bytes.byteLength > maximumImageBytes) {
    throw new ProviderRequestError(
      400,
      `file exceeds the ${maximumImageBytes} byte connector limit`,
      undefined,
      "invalid_input",
    );
  }
  return bytes;
}

function assertPngDimensions(bytes: Uint8Array, imageSize: string): void {
  const isPng =
    bytes.byteLength >= pngHeaderLength &&
    pngSignature.every((byte, index) => bytes[index] === byte) &&
    String.fromCharCode(bytes[12]!, bytes[13]!, bytes[14]!, bytes[15]!) === "IHDR";
  if (!isPng) {
    throw new ProviderRequestError(
      400,
      "the image must be a PNG file; Apple accepts only PNG images without transparency for retention messaging",
      undefined,
      "invalid_input",
    );
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);

  if (imageSize === bulletPointImageSize) {
    if (width !== bulletPointEdge || height !== bulletPointEdge) {
      throw new ProviderRequestError(
        400,
        `a BULLET_POINT image must be ${bulletPointEdge} by ${bulletPointEdge} pixels; this PNG is ${width} by ${height}`,
        undefined,
        "invalid_input",
      );
    }
    return;
  }
  if (width !== fullSizeWidth || height < fullSizeMinHeight || height > fullSizeMaxHeight) {
    throw new ProviderRequestError(
      400,
      `a FULL_SIZE image must be ${fullSizeWidth} pixels wide and ${fullSizeMinHeight} to ${fullSizeMaxHeight} pixels tall; this PNG is ${width} by ${height}`,
      undefined,
      "invalid_input",
    );
  }
}

function readPerformanceTestConfig(value: unknown): Record<string, number | null> {
  const config = recordOrEmpty(value);
  return {
    maxConcurrentRequests: readResponseInteger(config.maxConcurrentRequests),
    responseTimeThreshold: readResponseInteger(config.responseTimeThreshold),
    successRateThreshold: readResponseInteger(config.successRateThreshold),
    totalDuration: readResponseInteger(config.totalDuration),
    totalRequests: readResponseInteger(config.totalRequests),
  };
}

function readFailureCounts(value: unknown): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [key, count] of Object.entries(recordOrEmpty(value))) {
    const integer = readResponseInteger(count);
    if (integer !== null) {
      counts[key] = integer;
    }
  }
  return counts;
}
