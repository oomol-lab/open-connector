export const oneDriveProviderScopes = {
  userRead: "User.Read",
  filesRead: "Files.Read",
  filesReadWrite: "Files.ReadWrite",
  filesReadAll: "Files.Read.All",
  filesReadWriteAll: "Files.ReadWrite.All",
  offlineAccess: "offline_access",
} as const;

export const oneDriveReadScopes: string[] = [oneDriveProviderScopes.filesRead];
export const oneDriveWriteScopes: string[] = [oneDriveProviderScopes.filesReadWrite];

/**
 * Scopes a client may request. This list is both the allow-list
 * `requestedScopes` is validated against and the fallback for a client that
 * requests none, so every scope an action names in `requiredScopes` must
 * appear here. `Files.Read` sits beside `Files.ReadWrite` so a read-only
 * client can ask for the narrower grant; the fallback's effective access is
 * unchanged because `Files.ReadWrite` already covers it.
 */
export const oneDriveOAuthScopes: string[] = [
  oneDriveProviderScopes.userRead,
  oneDriveProviderScopes.filesRead,
  oneDriveProviderScopes.filesReadWrite,
  oneDriveProviderScopes.offlineAccess,
];
