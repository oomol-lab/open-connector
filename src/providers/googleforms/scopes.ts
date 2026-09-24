import { googleIdentityScopes } from "../google-oauth-scopes.ts";

export const googleFormsReadScope = "https://www.googleapis.com/auth/forms.body.readonly";
export const googleFormsWriteScope = "https://www.googleapis.com/auth/forms.body";
export const googleFormsResponsesReadScope = "https://www.googleapis.com/auth/forms.responses.readonly";

export const googleFormsOAuthScopes: string[] = [
  googleFormsReadScope,
  googleFormsWriteScope,
  googleFormsResponsesReadScope,
  ...googleIdentityScopes,
];
