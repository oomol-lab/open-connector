import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "shotstack";

const editSchema = s.looseRequiredObject(
  "The Shotstack Edit JSON body, including a timeline and output configuration.",
  {
    timeline: s.looseRequiredObject("The Shotstack timeline containing the tracks to render.", {
      tracks: s.array(
        "The ordered Shotstack tracks containing render clips.",
        s.looseObject("One Shotstack track and its provider-defined clip configuration."),
      ),
    }),
    output: s.looseRequiredObject("The Shotstack output configuration.", {
      format: s.stringEnum("The output media format required by Shotstack.", [
        "mp4",
        "gif",
        "jpg",
        "png",
        "bmp",
        "mp3",
      ]),
    }),
  },
);

const renderSchema = s.looseRequiredObject(
  "The current Shotstack render details.",
  {
    id: s.string("The Shotstack render identifier."),
    status: s.string("The current Shotstack render status."),
    url: s.nullableString("The temporary output URL when Shotstack has produced one.", { format: "uri" }),
    poster: s.nullableString("The poster image URL when Shotstack generated one.", { format: "uri" }),
    thumbnail: s.nullableString("The thumbnail image URL when Shotstack generated one.", { format: "uri" }),
    owner: s.string("The Shotstack account identifier that owns the render."),
    plan: s.string("The Shotstack subscription plan used for the render."),
    error: s.string("The error message returned when Shotstack cannot render the edit."),
    duration: s.number("The rendered media duration in seconds."),
    renderTime: s.number("The time Shotstack spent rendering the media in milliseconds."),
    created: s.string("The timestamp when Shotstack created the render."),
    updated: s.string("The timestamp when Shotstack last updated the render."),
    data: s.looseObject("The original edit payload returned when requested."),
  },
  {
    optional: [
      "url",
      "poster",
      "thumbnail",
      "owner",
      "plan",
      "error",
      "duration",
      "renderTime",
      "created",
      "updated",
      "data",
    ],
  },
);

export const shotstackActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "render_edit",
    operationType: "write",
    description:
      "Submit a Shotstack edit JSON payload for asynchronous video, image, or audio rendering and return its render ID.",
    inputSchema: s.actionInput(
      {
        edit: editSchema,
      },
      ["edit"],
      "The Shotstack edit payload to queue for rendering.",
    ),
    outputSchema: s.actionOutput(
      {
        render: s.actionOutput(
          {
            id: s.string("The Shotstack render identifier used to retrieve the result."),
            message: s.string("The queue confirmation message returned by Shotstack."),
          },
          "The render job queued by Shotstack.",
        ),
      },
      "The queued Shotstack render response.",
    ),
    asyncLifecycle: {
      startActionId: "shotstack.render_edit",
      statusActionId: "shotstack.get_render",
    },
  }),
  defineProviderAction(service, {
    name: "get_render",
    operationType: "read",
    description: "Get the status and output URL for one Shotstack render, optionally including its original edit JSON.",
    inputSchema: s.actionInput(
      {
        id: s.uuid("The Shotstack render task UUID."),
        data: s.boolean("Whether to include the original edit data in the response."),
        merged: s.boolean("Whether returned edit data should include merged fields."),
      },
      ["id"],
      "The identifier and optional response fields for one Shotstack render.",
    ),
    outputSchema: s.actionOutput(
      {
        render: renderSchema,
      },
      "The current Shotstack render response.",
    ),
    asyncLifecycle: {
      startActionId: "shotstack.render_edit",
      statusActionId: "shotstack.get_render",
    },
  }),
];
