import type { ConnectionCreatedEvent } from "../../connection-service.ts";
import type { Logger } from "../logger.ts";

import { createHmac, timingSafeEqual } from "node:crypto";

/** Default signature header. Override it when a receiver expects a different name. */
export const defaultWebhookSignatureHeader = "x-oo-connector-signature";

export interface ConnectionWebhookOptions {
  url: string;
  secret: string;
  /**
   * Header carrying the signature.
   *
   * Configurable because receivers written against another connector expect their own
   * header name; pointing this at that name lets an existing handler work unmodified
   * rather than forcing a change on the receiving side.
   */
  signatureHeader?: string;
  timeoutMs?: number;
  logger?: Logger;
  fetchImpl?: typeof fetch;
}

/**
 * Delivers `connection.created` to a configured endpoint.
 *
 * Delivery is fire-and-forget on purpose: the user has already authorized with the
 * provider and the credential is already stored, so a receiver being down must not fail
 * the OAuth flow or lose the connection. Failures are logged; the receiver is expected to
 * reconcile from `GET /api/connections` if it misses one.
 */
export class ConnectionWebhookNotifier {
  private readonly options: ConnectionWebhookOptions;

  constructor(options: ConnectionWebhookOptions) {
    this.options = options;
  }

  notify(event: ConnectionCreatedEvent): void {
    void this.deliver(event);
  }

  private async deliver(event: ConnectionCreatedEvent): Promise<void> {
    const body = JSON.stringify(buildConnectionCreatedPayload(event));
    const signatureHeader = this.options.signatureHeader ?? defaultWebhookSignatureHeader;
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 10_000);

    try {
      const response = await fetchImpl(this.options.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [signatureHeader]: signConnectionWebhook(body, this.options.secret),
        },
        body,
        signal: controller.signal,
      });
      if (!response.ok) {
        this.options.logger?.warn(
          { status: response.status, service: event.service, tenant: event.tenant },
          "connection webhook rejected",
        );
        return;
      }
      this.options.logger?.info({ service: event.service, tenant: event.tenant }, "connection webhook delivered");
    } catch (error) {
      this.options.logger?.warn(
        { service: event.service, tenant: event.tenant, err: error },
        "connection webhook delivery failed",
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

/**
 * Payload for a newly created connection.
 *
 * `connectionId` and `providerConfigKey` are named for compatibility with existing
 * receivers; `tenant` and `connectionName` are the connector's own identifiers and are
 * additive, so a receiver that ignores them is unaffected.
 */
export function buildConnectionCreatedPayload(event: ConnectionCreatedEvent): Record<string, unknown> {
  return {
    type: "connection.created",
    connectionId: event.connectionId,
    providerConfigKey: event.service,
    tenant: event.tenant,
    connectionName: event.connectionName,
    authType: event.authType,
    createdAt: event.createdAt,
  };
}

export function signConnectionWebhook(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

/**
 * Constant-time signature check, exported so receivers and tests verify the same way.
 */
export function verifyConnectionWebhook(body: string, secret: string, signature: string): boolean {
  const expected = Buffer.from(signConnectionWebhook(body, secret));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
