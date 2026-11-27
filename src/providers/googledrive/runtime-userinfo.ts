import type { ProviderRequestContext } from "../provider-runtime.ts";

import { optionalString, requiredString } from "../../core/cast.ts";
import { providerResponseError, requiredResponseRecord } from "../provider-runtime.ts";
import { googleJsonRequest } from "./runtime-request.ts";

interface GoogleUserInfoInput extends ProviderRequestContext {
  accessToken: string;
}

interface GoogleUserInfo {
  sub: string;
  email: string;
  name: string | undefined;
}

/** Read the Google identity independently of permissions for Gmail or Drive operations. */
export async function readGoogleUserInfo(input: GoogleUserInfoInput): Promise<GoogleUserInfo> {
  const payload = requiredResponseRecord(
    await googleJsonRequest<unknown>("https://openidconnect.googleapis.com/v1/userinfo", {
      accessToken: input.accessToken,
      fetcher: input.fetcher,
      signal: input.signal,
      service: "Google UserInfo",
    }),
    "Google UserInfo",
  );
  return {
    sub: requiredString(payload.sub, "Google UserInfo sub", providerResponseError),
    email: requiredString(payload.email, "Google UserInfo email", providerResponseError),
    name: optionalString(payload.name),
  };
}
