export const zoomUserReadScope = "user:read:user";
export const zoomMeetingListScope = "meeting:read:list_meetings";
export const zoomMeetingWriteScope = "meeting:write:meeting";
export const zoomMeetingUpdateScope = "meeting:update:meeting";

export const zoomProviderScopes: string[] = [
  "cloud_recording:read:recording",
  zoomUserReadScope,
  zoomMeetingListScope,
  zoomMeetingWriteScope,
  zoomMeetingUpdateScope,
];
