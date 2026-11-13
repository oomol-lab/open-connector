import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "huntapi";
const huntApiMediaMetadataSchema = s.looseObject(
  "Metadata of the video, once the job completes.",
  {
    title: s.nullableString("Title of the video."),
    description: s.nullableString("Description of the video."),
    duration: s.nullableNumber("Duration of the video in seconds."),
    ext: s.nullableString("File extension of the download."),
    thumbnail: s.nullableString("URL of the video thumbnail."),
    uploader: s.nullableString("Name of the uploader."),
    uploader_url: s.nullableString("URL of the uploader's page."),
    view_count: s.nullableNumber("Number of views."),
    like_count: s.nullableNumber("Number of likes."),
    comment_count: s.nullableNumber("Number of comments."),
    upload_date: s.nullableNumber("Upload date as a Unix timestamp in seconds."),
    original_url: s.nullableString("URL of the video page."),
  },
  {
    optional: [
      "title",
      "description",
      "duration",
      "ext",
      "thumbnail",
      "uploader",
      "uploader_url",
      "view_count",
      "like_count",
      "comment_count",
      "upload_date",
      "original_url",
    ],
  },
);

export const huntapiActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "download_video",
    operationType: "write",
    description:
      "Start downloading a public video in a chosen quality and format. Returns a job ID; use Get Job to get the file link once the job completes.",
    inputSchema: s.actionInput(
      {
        url: s.nonEmptyString('URL of the public video (e.g., "https://www.youtube.com/watch?v=jNQXAC9IVRw").'),
        videoQuality: s.stringEnum(
          'Quality: best, 1080p, 720p, 480p or 360p (defaults to "best"); videos over an hour are capped at 720p.',
          ["best", "1080p", "720p", "480p", "360p"],
        ),
        videoFormat: s.stringEnum('Preferred format: mp4, webm or mkv (defaults to "mp4").', ["mp4", "webm", "mkv"]),
        downloadType: s.stringEnum(
          'audio_video for the video with sound, video for the picture only (defaults to "audio_video").',
          ["audio_video", "video"],
        ),
        maxDuration: s.integer("Maximum duration in seconds; longer content is cut at this length.", { minimum: 1 }),
      },
      ["url"],
      "Input for Download Video.",
    ),
    outputSchema: s.looseObject(
      "The HuntAPI response for Download Video.",
      {
        job_id: s.nullableString("ID of the download job, to pass to Get Job."),
      },
      { optional: ["job_id"] },
    ),
    followUpActions: ["huntapi.get_job"],
    asyncLifecycle: {
      startActionId: "huntapi.download_video",
      statusActionId: "huntapi.get_job",
    },
  }),
  defineProviderAction(service, {
    name: "download_audio",
    operationType: "write",
    description:
      "Start extracting the audio track of a public video as MP3 or another format. Returns a job ID; use Get Job to get the file link once the job completes.",
    inputSchema: s.actionInput(
      {
        url: s.nonEmptyString('URL of the public video (e.g., "https://www.youtube.com/watch?v=jNQXAC9IVRw").'),
        audioQuality: s.stringEnum('Quality: best, 320kbps, 256kbps or 128kbps (defaults to "best").', [
          "best",
          "320kbps",
          "256kbps",
          "128kbps",
        ]),
        audioFormat: s.stringEnum('Preferred format: mp3, m4a or wav (defaults to "mp3").', ["mp3", "m4a", "wav"]),
        maxDuration: s.integer("Maximum duration in seconds; longer content is cut at this length.", { minimum: 1 }),
      },
      ["url"],
      "Input for Download Audio.",
    ),
    outputSchema: s.looseObject(
      "The HuntAPI response for Download Audio.",
      {
        job_id: s.nullableString("ID of the download job, to pass to Get Job."),
      },
      { optional: ["job_id"] },
    ),
    followUpActions: ["huntapi.get_job"],
    asyncLifecycle: {
      startActionId: "huntapi.download_audio",
      statusActionId: "huntapi.get_job",
    },
  }),
  defineProviderAction(service, {
    name: "get_job",
    operationType: "read",
    description:
      "Get a download job's status and progress and, once it completes, the link to the file with the video's metadata.",
    inputSchema: s.actionInput(
      {
        jobId: s.nonEmptyString("The job ID returned by Download Video or Download Audio."),
      },
      ["jobId"],
      "Input for Get Job.",
    ),
    outputSchema: s.looseObject(
      "The HuntAPI response for Get Job.",
      {
        id: s.nullableString("ID of the download job."),
        status: s.nullableString("Status of the job, CompletedJob once the file is ready."),
        progress: s.nullableNumber("Progress of the job, from 0 to 100."),
        result: s.looseObject(
          "Result returned by HuntAPI.",
          {
            response: s.nullableString("Link to the downloaded file, once the job completes."),
            metadata: huntApiMediaMetadataSchema,
          },
          { optional: ["response", "metadata"] },
        ),
        created_at: s.nullableString("When the job was created."),
        completed_at: s.nullableString("When the job completed."),
        duration_ms: s.nullableNumber("Time the job took, in milliseconds."),
      },
      { optional: ["id", "status", "progress", "result", "created_at", "completed_at", "duration_ms"] },
    ),
  }),
];
