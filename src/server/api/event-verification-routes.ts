import type {
  ChannelCredentialScope,
  ChannelCredentialSource,
  ChannelEventRejectionReason,
  ChannelEventVerifier,
} from "../event-verification/contract.ts";
import type { ScopedServices, TenantServices } from "../tenant-services.ts";
import type { RuntimeFailureInput } from "./runtime-api.ts";
import type { Context } from "hono";

import { Hono } from "hono";
import { ConnectionError } from "../../connection-error.ts";
import { optionalString } from "../../core/cast.ts";
import { listChannelEventVerifiers } from "../event-verification/registry.ts";
import { readEventRequestBody } from "../event-verification/request-body.ts";
import { readTenantId } from "./auth.ts";
import { readConnectionName } from "./http-utils.ts";
import { mapConnectionErrorStatus, writeRuntimeFailure, writeRuntimeSuccess } from "./runtime-api.ts";

export interface EventVerificationRoutesOptions {
  services: ScopedServices;
  /** Dedicated OOMOL_CONNECT_EVENT_VERIFY_TOKEN, when configured. */
  eventVerifyToken: string | undefined;
}

/** One HTTP status and error code per rejection reason, identical for every channel. */
const rejectionFailures: Record<ChannelEventRejectionReason, Pick<RuntimeFailureInput, "status" | "errorCode">> = {
  payload: { status: 400, errorCode: "invalid_event_payload" },
  signature: { status: 401, errorCode: "invalid_webhook_signature" },
  timestamp: { status: 401, errorCode: "invalid_webhook_timestamp" },
  app: { status: 403, errorCode: "webhook_app_mismatch" },
  body_too_large: { status: 413, errorCode: "webhook_request_too_large" },
  unavailable: { status: 502, errorCode: "event_verification_unavailable" },
};

/**
 * Checks the dedicated event verification bearer token. Returns the failure
 * response when the route must not proceed, or undefined when it is authorized.
 */
async function rejectUnauthorizedEventVerification(
  context: Context,
  eventVerifyToken: string | undefined,
): Promise<Response | undefined> {
  const expected = eventVerifyToken?.trim();
  if (!expected)
    return writeRuntimeFailure(context, {
      status: 404,
      errorCode: "event_verification_disabled",
      message: "Event verification is disabled.",
    });
  const authorization = context.req.header("authorization") ?? "";
  const provided = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!(await sameSecret(provided, expected)))
    return writeRuntimeFailure(context, {
      status: 401,
      errorCode: "unauthorized",
      message: "A valid event verification token is required.",
    });
  return undefined;
}

/**
 * Inbound channel event verification using a dedicated bearer token.
 *
 * One handler serves every channel in the verifier registry: it checks the token,
 * loads the channel's credential from its declared scope, enforces the body
 * limit, and maps the verifier's outcome to the runtime envelope. Nothing is
 * stored or scheduled.
 */
export function createEventVerificationRoutes({ services, eventVerifyToken }: EventVerificationRoutesOptions): Hono {
  const app = new Hono();
  // The dedicated bearer token authenticates this route; there is no caller
  // grant, so readTenantId falls back to the request's tenant context.
  const scoped = (context: Context): Promise<TenantServices> => services.forTenant(readTenantId(context));

  async function readCredentialSource(
    context: Context,
    service: string,
    scope: ChannelCredentialScope,
  ): Promise<ChannelCredentialSource> {
    const { connections, oauthClientConfigs } = await scoped(context);
    if (scope === "application") return { applicationConfig: await oauthClientConfigs.getConfig(service) };
    const connection = await connections.resolveConnection(
      service,
      readConnectionName(context),
      optionalString(context.req.header("x-oo-connector-app-id")),
    );
    return {
      connectionValues:
        connection.source === "local" && connection.credential?.authType === "custom_credential"
          ? connection.credential.values
          : undefined,
    };
  }

  async function verifyChannelEvent(
    context: Context,
    service: string,
    loadVerifier: () => Promise<ChannelEventVerifier<unknown>>,
  ): Promise<Response> {
    const rejected = await rejectUnauthorizedEventVerification(context, eventVerifyToken);
    if (rejected) return rejected;
    const verifier = await loadVerifier();

    let source: ChannelCredentialSource;
    try {
      source = await readCredentialSource(context, service, verifier.credentialScope);
    } catch (error) {
      if (!(error instanceof ConnectionError)) throw error;
      return writeRuntimeFailure(context, {
        status: mapConnectionErrorStatus(error),
        errorCode: error.code,
        message: error.message,
      });
    }
    const credential = verifier.readCredential(source);
    if (credential === undefined)
      return writeRuntimeFailure(context, {
        status: 409,
        errorCode: "event_verification_not_configured",
        message: verifier.messages.notConfigured,
      });

    const rawBody = await readEventRequestBody(context.req.raw);
    if (!rawBody)
      return writeRuntimeFailure(context, {
        ...rejectionFailures.body_too_large,
        message: verifier.messages.bodyTooLarge,
      });

    const verification = await verifier.verify(
      { headers: context.req.raw.headers, rawBody, now: Date.now() },
      credential,
    );
    if (verification.verified) return writeRuntimeSuccess(context, verification.result);
    return writeRuntimeFailure(context, { ...rejectionFailures[verification.reason], message: verification.message });
  }

  // One concrete path per channel, so each route is documented and contract-tested individually.
  for (const [service, loadVerifier] of listChannelEventVerifiers())
    app.post(`/providers/${service}/events/verify`, (context) => verifyChannelEvent(context, service, loadVerifier));

  return app;
}

/** Hash both values before a constant-time comparison so length never leaks. */
async function sameSecret(provided: string, expected: string): Promise<boolean> {
  if (!provided || !expected) return false;
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index]! ^ b[index]!;
  return difference === 0;
}
