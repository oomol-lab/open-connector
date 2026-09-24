import { googleIdentityScopes } from "../googleads/scopes.ts";

export const bigQueryScope = "https://www.googleapis.com/auth/bigquery";
export const bigQueryReadOnlyScope = "https://www.googleapis.com/auth/bigquery.readonly";
export const bigQueryInsertDataScope = "https://www.googleapis.com/auth/bigquery.insertdata";
export const devStorageReadOnlyScope = "https://www.googleapis.com/auth/devstorage.read_only";
export const devStorageReadWriteScope = "https://www.googleapis.com/auth/devstorage.read_write";

export const googleBigQueryReadScopes: string[] = [bigQueryReadOnlyScope];
export const googleBigQueryInsertDataScopes: string[] = [bigQueryInsertDataScope];
export const googleBigQueryWriteScopes: string[] = [bigQueryScope];
export const googleBigQueryLoadJobScopes: string[] = [bigQueryScope, devStorageReadOnlyScope];
export const googleBigQueryExtractJobScopes: string[] = [bigQueryScope, devStorageReadWriteScope];
export const googleBigQueryOAuthScopes: string[] = [
  bigQueryScope,
  bigQueryReadOnlyScope,
  bigQueryInsertDataScope,
  devStorageReadOnlyScope,
  devStorageReadWriteScope,
  ...googleIdentityScopes,
];
