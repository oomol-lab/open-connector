export const googleDriveReadonlyScope = "https://www.googleapis.com/auth/drive.readonly";
export const googleDriveMetadataReadonlyScope = "https://www.googleapis.com/auth/drive.metadata.readonly";
export const googleDriveFullScope = "https://www.googleapis.com/auth/drive";

export const googledriveReadScopes: string[] = [googleDriveReadonlyScope, googleDriveMetadataReadonlyScope];
export const googledriveWriteScopes: string[] = [googleDriveFullScope];

export const googledriveOAuthScopes: string[] = [
  googleDriveReadonlyScope,
  googleDriveMetadataReadonlyScope,
  googleDriveFullScope,
];
