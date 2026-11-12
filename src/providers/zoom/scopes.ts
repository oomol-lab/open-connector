export const zoomUserReadScope = "user:read:user";
export const zoomMeetingListScope = "meeting:read:list_meetings";
export const zoomMeetingWriteScope = "meeting:write:meeting";
export const zoomMeetingUpdateScope = "meeting:update:meeting";
export const zoomMeetingSummaryListScope = "meeting:read:list_summaries";
export const zoomMeetingSummaryReadScope = "meeting:read:summary";

export const zoomProviderScopes: string[] = [
  zoomUserReadScope,
  zoomMeetingListScope,
  zoomMeetingWriteScope,
  zoomMeetingUpdateScope,
];

/**
 * AI Companion meeting summary scopes. They are optional so existing Zoom apps keep
 * their consent screen; request them explicitly to read meeting summaries.
 */
export const zoomMeetingSummaryScopes: string[] = [zoomMeetingSummaryListScope, zoomMeetingSummaryReadScope];
