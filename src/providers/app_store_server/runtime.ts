import type { CredentialValidationResult } from "../../core/types.ts";
import type { AppStoreServerHandlers } from "./runtime-helpers.ts";

import { optionalNumber, recordOrEmpty } from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import { createAppStoreServerAuthorization, readAppStoreServerCredential } from "./jwt.ts";
import {
  appStoreServerApiOrigins,
  appStoreServerRetryableErrorCodes,
  appStoreServerWrongAccountErrorCodes,
  appStoreServerWrongAppErrorCodes,
  readAppStoreServerEnvironment,
  requestAppStoreServer,
} from "./runtime-helpers.ts";
import { appStoreServerNotificationHandlers } from "./runtime-notifications.ts";
import { appStoreServerRefundHandlers } from "./runtime-refunds.ts";
import { appStoreServerRetentionMessagingHandlers } from "./runtime-retention-messaging.ts";
import { appStoreServerSubscriptionHandlers } from "./runtime-subscriptions.ts";
import { appStoreServerTransactionHandlers } from "./runtime-transactions.ts";

export { appStoreServerApiOrigins, readAppStoreServerEnvironment } from "./runtime-helpers.ts";

const validationEndpoint = "/inApps/v1/transactions/0";

const inconclusiveErrorCodes = new Set([4_290_000, 5_000_000]);

export const appStoreServerActionHandlers: AppStoreServerHandlers = {
  ...appStoreServerTransactionHandlers,
  ...appStoreServerSubscriptionHandlers,
  ...appStoreServerRefundHandlers,
  ...appStoreServerNotificationHandlers,
  ...appStoreServerRetentionMessagingHandlers,
};

export async function validateAppStoreServerCredential(
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const credential = readAppStoreServerCredential(values);
  const environment = readAppStoreServerEnvironment(values.environment);
  try {
    await requestAppStoreServer(
      { authorization: createAppStoreServerAuthorization(credential), environment, fetcher, signal },
      { path: validationEndpoint, phase: "validate" },
    );
  } catch (error) {
    if (!provesAuthentication(error)) {
      throw error;
    }
  }

  return {
    profile: {
      accountId: `app_store_server:${environment}:${credential.bundleId}`,
      displayName: `App Store Server API ${credential.bundleId} (${environment})`,
    },
    metadata: {
      apiBaseUrl: appStoreServerApiOrigins[environment],
      environment,
      bundleId: credential.bundleId,
      keyId: credential.keyId,
      issuerId: credential.issuerId,
      validationEndpoint,
    },
  };
}

function provesAuthentication(error: unknown): boolean {
  if (!(error instanceof ProviderRequestError)) {
    return false;
  }
  const errorCode = optionalNumber(recordOrEmpty(error.details).errorCode);
  return (
    errorCode !== undefined &&
    !appStoreServerWrongAppErrorCodes.has(errorCode) &&
    !appStoreServerWrongAccountErrorCodes.has(errorCode) &&
    !appStoreServerRetryableErrorCodes.has(errorCode) &&
    !inconclusiveErrorCodes.has(errorCode)
  );
}
