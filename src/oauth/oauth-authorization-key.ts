import type { StoredLocalConnection } from "../connection-store.ts";

import { sha256Hex } from "../core/aws-sigv4.ts";

/** Identify the authorization being retired without storing its token in the retirement log. */
export function oauthAuthorizationKey(connection: StoredLocalConnection): string {
  const credential = connection.credential;
  if (credential.authType !== "oauth2") throw new Error("An OAuth authorization is required.");
  return sha256Hex(
    JSON.stringify([
      connection.id,
      credential.metadata.oauthAuthorizationId ?? credential.refreshToken ?? credential.accessToken,
    ]),
  );
}
