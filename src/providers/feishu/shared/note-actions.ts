import type { ActionDefinition } from "../../../core/types.ts";

import { s } from "../../../core/json-schema.ts";
import { defineProviderAction } from "../../../core/provider-definition.ts";
const noteId = s.string("The Feishu meeting note ID.", { minLength: 1 });
export function createFeishuNoteActions(service: string): readonly ActionDefinition[] {
  return [
    defineProviderAction(service, {
      name: "get_vc_note",
      operationType: "read",
      description: "Get meeting-note metadata and its related document tokens.",
      requiredScopes: ["vc:note:read"],
      providerPermissions: ["vc:note:read"],
      inputSchema: s.object(
        "Identify the meeting note.",
        { noteId },
        {
          optional: [],
        },
      ),
      outputSchema: s.object(
        "The normalized meeting-note details.",
        {
          noteId,
          displayType: s.stringEnum("The meeting-note display type.", ["unknown", "normal", "unified"]),
          creatorId: s.string("The note creator open_id."),
          createTime: s.string("The provider creation timestamp."),
          noteDocumentToken: s.string("The main note document token."),
          verbatimDocumentToken: s.string("The verbatim transcript document token."),
          sharedDocumentTokens: s.array(
            "Document tokens referenced by the note.",
            s.string("A referenced document token."),
          ),
          raw: s.looseRequiredObject(
            "The raw Feishu note object.",
            {},
            {
              optional: [],
            },
          ),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "download_vc_note_transcript",
      operationType: "read",
      description:
        "Fetch every page of a unified meeting-note transcript and save the complete text to local transit storage.",
      requiredScopes: ["vc:note:read"],
      providerPermissions: ["vc:note:read"],
      inputSchema: s.object(
        "Identify the unified note and choose transcript rendering.",
        {
          noteId,
          format: s.stringEnum("The transcript content format.", ["markdown", "plain_text"]),
          locale: s.string("The transcript locale, such as zh_cn, en_us, or ja_jp.", {
            minLength: 1,
          }),
          fileName: s.string("An optional output file name.", { minLength: 1 }),
        },
        {
          optional: ["format", "locale", "fileName"],
        },
      ),
      outputSchema: s.object(
        "The complete transcript in local transit storage.",
        {
          noteId,
          format: s.string("The transcript format."),
          locale: s.string("The transcript locale."),
          file: s.object(
            "The locally stored transcript file.",
            {
              fileId: s.nonEmptyString("The local transit file identifier."),
              downloadUrl: s.url("The local transit file download URL."),
              name: s.string("The transcript file name."),
              mimeType: s.string("The transcript MIME type."),
              sizeBytes: s.integer("The UTF-8 transcript size in bytes.", { minimum: 0 }),
            },
            { optional: [] },
          ),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "get_vc_meeting_note",
      operationType: "read",
      description: "Resolve a video meeting to its note ID and return normalized meeting-note details.",
      requiredScopes: ["vc:meeting.meetingevent:read", "vc:note:read"],
      providerPermissions: ["vc:meeting.meetingevent:read", "vc:note:read"],
      inputSchema: s.object(
        "Identify the video meeting.",
        {
          meetingId: s.string("The Feishu video meeting ID.", { minLength: 1 }),
        },
        {
          optional: [],
        },
      ),
      outputSchema: s.object(
        "The video meeting and its note details.",
        {
          meetingId: s.string("The Feishu video meeting ID."),
          note: s.looseRequiredObject(
            "The normalized meeting-note details.",
            {},
            {
              optional: [],
            },
          ),
        },
        {
          optional: [],
        },
      ),
    }),
  ];
}
