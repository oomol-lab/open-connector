import type { KlingAudioMode, KlingModel, KlingMultimodalLimits, KlingResolution } from "./models.ts";

import { klingModelDefinitions } from "./models.ts";

export const klingPromptMaxLength = 2500;

export type KlingMediaRole =
  | "first_frame"
  | "middle_frame"
  | "last_frame"
  | "reference_image"
  | "reference_video"
  | "source_video";

export interface KlingMediaInput {
  role: KlingMediaRole;
  url: string;
  referenceId?: string;
}

interface KlingShotInput {
  prompt: string;
  duration: number;
}

export interface KlingMultiShotInput {
  mode: "intelligent" | "custom";
  shots?: KlingShotInput[];
}

export interface KlingSubmitInput {
  model: KlingModel;
  prompt?: string;
  media: KlingMediaInput[];
  resolution: KlingResolution;
  aspectRatio: "16:9" | "9:16" | "1:1" | "21:9" | "4:3" | "3:4" | "adaptive";
  dynamicRange?: "sdr" | "hdr";
  elements?: { elementId: string; referenceId: string }[];
  voices?: { voiceId: string; referenceId: string }[];
  duration?: number;
  audioMode: KlingAudioMode;
  multiShot?: KlingMultiShotInput;
  watermark: boolean;
}

interface KlingInputIssue {
  path: Array<string | number>;
  message: string;
}

export function collectKlingSubmitInputIssues(input: KlingSubmitInput): KlingInputIssue[] {
  const { multimodal } = klingModelDefinitions[input.model];
  if (multimodal) return collectMultimodalIssues(input, multimodal);
  const issues: KlingInputIssue[] = [];
  const addIssue = (path: Array<string | number>, message: string) => {
    issues.push({ path, message });
  };

  if (input.dynamicRange || input.elements?.length || input.voices?.length)
    addIssue(["model"], "dynamicRange, elements and voices require Kling 4 models");
  if (!["16:9", "9:16", "1:1"].includes(input.aspectRatio))
    addIssue(["aspectRatio"], "This aspect ratio requires Kling 4 models");
  if (input.media.some((item) => item.role === "middle_frame")) addIssue(["media"], "middle_frame requires kling-4.0");
  if (input.prompt !== undefined) {
    const promptLength = unicodeCharacterLength(input.prompt);
    if (promptLength < 1) addIssue(["prompt"], "prompt must not be blank");
    if (promptLength > klingPromptMaxLength)
      addIssue(["prompt"], `prompt must not exceed ${klingPromptMaxLength} characters`);
  }

  if (!input.multiShot) {
    if (!input.prompt) addIssue(["prompt"], "prompt is required when multiShot is omitted");
  } else if (input.multiShot.mode === "intelligent") {
    if (!input.prompt) addIssue(["prompt"], "prompt is required for intelligent multiShot mode");
    if (input.multiShot.shots !== undefined)
      addIssue(["multiShot", "shots"], "multiShot.shots is only supported in custom mode");
  } else {
    if (input.prompt) addIssue(["prompt"], "prompt must be omitted in custom multiShot mode");
    const shots = input.multiShot.shots;
    if (!shots || shots.length < 1 || shots.length > 6) {
      addIssue(["multiShot", "shots"], "custom multiShot mode requires from 1 through 6 shots");
    } else {
      let totalDuration = 0;
      for (const [index, shot] of shots.entries()) {
        const promptLength = unicodeCharacterLength(shot.prompt);
        if (promptLength < 1) addIssue(["multiShot", "shots", index, "prompt"], "shot prompt must not be blank");
        if (promptLength > 512)
          addIssue(["multiShot", "shots", index, "prompt"], "multiShot.shots.prompt must not exceed 512 characters");
        if (shot.duration < 1 || shot.duration > (input.duration ?? 5))
          addIssue(
            ["multiShot", "shots", index, "duration"],
            "multiShot.shots.duration must be from 1 through the total duration",
          );
        totalDuration += shot.duration;
      }
      if (totalDuration !== (input.duration ?? 5))
        addIssue(["multiShot", "shots"], "custom shot durations must add up to duration");
      if (unicodeCharacterLength(serializeKlingCustomShots(shots)) > klingPromptMaxLength)
        addIssue(
          ["multiShot", "shots"],
          `serialized custom shot prompt must not exceed ${klingPromptMaxLength} characters`,
        );
    }
  }

  if ((input.duration ?? 5) < 3 || (input.duration ?? 5) > 15)
    addIssue(["duration"], "duration must be an integer from 3 through 15");
  if (input.model === "kling-3.0-turbo" && input.resolution === "4k")
    addIssue(["resolution"], "kling-3.0-turbo does not support 4k resolution");
  if (input.media.length > 9) addIssue(["media"], "media supports at most 9 items");

  const firstFrames = byRole(input.media, "first_frame");
  const lastFrames = byRole(input.media, "last_frame");
  const referenceImages = byRole(input.media, "reference_image");
  const referenceVideos = byRole(input.media, "reference_video");
  const sourceVideos = byRole(input.media, "source_video");
  if (firstFrames.length > 1 || lastFrames.length > 1)
    addIssue(["media"], "media supports at most one first_frame and one last_frame");
  if (lastFrames.length > 0 && firstFrames.length !== 1)
    addIssue(["media"], "last_frame requires exactly one first_frame");
  if (referenceVideos.length + sourceVideos.length > 1)
    addIssue(["media"], "media supports at most one reference_video or source_video");

  const referenceIds = new Set<string>();
  for (const [index, item] of input.media.entries()) {
    if (!item.referenceId) continue;
    if (referenceIds.has(item.referenceId))
      addIssue(["media", index, "referenceId"], `media.referenceId must be unique: ${item.referenceId}`);
    referenceIds.add(item.referenceId);
  }

  if (input.model === "kling-3.0-turbo") {
    if (input.audioMode !== "native") addIssue(["audioMode"], "kling-3.0-turbo only supports native audio");
    if (input.media.some((item) => item.role !== "first_frame") || firstFrames.length > 1)
      addIssue(["media"], "kling-3.0-turbo only supports text or one first_frame");
  } else if (input.model === "kling-3.0") {
    if (referenceImages.length > 0 || referenceVideos.length > 0 || sourceVideos.length > 0)
      addIssue(["media"], "kling-3.0 only supports text, first_frame, or first_frame with last_frame");
  } else {
    if (sourceVideos.length > 0 && (firstFrames.length > 0 || lastFrames.length > 0 || referenceVideos.length > 0))
      addIssue(["media"], "source_video cannot be combined with frame images or reference_video");
    if (referenceVideos.length > 0 && lastFrames.length > 0)
      addIssue(["media"], "reference_video cannot be combined with last_frame");
    if (referenceVideos.length > 0 && firstFrames.length > 0 && referenceImages.length > 0)
      addIssue(["media"], "reference_video cannot combine first_frame with reference_image");
    if (sourceVideos.length > 0 && input.multiShot) addIssue(["multiShot"], "source_video does not support multiShot");
    if (referenceVideos.length > 0 && input.multiShot?.mode === "custom")
      addIssue(["multiShot"], "reference_video does not support custom multiShot mode");
    if (referenceVideos.length > 0 && (input.duration ?? 5) > 10)
      addIssue(["duration"], "reference_video duration must be from 3 through 10 seconds");
    const maximumReferenceImages = referenceVideos.length > 0 ? 4 : 7;
    if (referenceImages.length > maximumReferenceImages)
      addIssue(["media"], `this media mode supports at most ${maximumReferenceImages} reference_image items`);
  }

  const hasVideoInput = referenceVideos.length > 0 || sourceVideos.length > 0;
  if (hasVideoInput && input.audioMode === "native")
    addIssue(["audioMode"], "reference_video and source_video do not support native audio");
  if (input.audioMode === "original" && (input.model !== "kling-3.0-omni" || !hasVideoInput))
    addIssue(["audioMode"], "original audio requires kling-3.0-omni with reference_video or source_video");

  return issues;
}

export function serializeKlingCustomShots(shots: KlingShotInput[]): string {
  return shots.map((shot, index) => `镜头 ${index + 1}, ${shot.duration}, ${shot.prompt};`).join(" ");
}

function unicodeCharacterLength(value: string): number {
  return Array.from(value).length;
}

function byRole(media: KlingMediaInput[], role: KlingMediaRole): KlingMediaInput[] {
  return media.filter((item) => item.role === role);
}

function collectMultimodalIssues(input: KlingSubmitInput, limits: KlingMultimodalLimits): KlingInputIssue[] {
  const issues: KlingInputIssue[] = [];
  const add = (field: string, message: string) => issues.push({ path: [field], message });
  if (!input.prompt?.trim()) add("prompt", "Kling 4 requires a prompt");
  if (input.prompt && unicodeCharacterLength(input.prompt) > 26000)
    add("prompt", "Kling 4 prompts must not exceed 26000 characters; mixed-language limits also apply upstream");
  if (input.multiShot) add("multiShot", "Describe Kling 4 shots in the prompt instead of multiShot");
  if (input.duration !== undefined && (input.duration < 3 || input.duration > limits.maxDuration))
    add("duration", "Kling 4 supports 3-30 seconds; Flash supports 3-20 seconds");
  if (!limits.dynamicRange && input.dynamicRange) add("dynamicRange", "Flash does not support dynamicRange");
  if (!limits.resolutions.includes(input.resolution)) add("resolution", "Kling 4 Flash only supports 720p");
  if (input.dynamicRange === "hdr" && (!limits.dynamicRange || input.resolution === "720p"))
    add("dynamicRange", "HDR requires kling-4.0 at 1080p or 4k");
  const videos = input.media.filter((item) => ["reference_video", "source_video"].includes(item.role));
  const images = input.media.filter((item) => !videos.includes(item));
  const elements = input.elements ?? [];
  const voices = input.voices ?? [];
  if (
    images.length > 10 ||
    videos.length > 5 ||
    elements.length > 7 ||
    voices.length > 3 ||
    input.media.length + elements.length + voices.length > 15
  )
    add("media", "Kling 4 supports 10 images, 5 videos, 7 elements, 3 voices and 15 total assets");
  for (const role of ["first_frame", "last_frame", "source_video"]) {
    if (input.media.filter((item) => item.role === role).length > 1)
      add("media", "Only one first_frame, last_frame and source_video is supported");
  }
  if (
    voices.length > limits.maxVoices ||
    (!limits.frameSequence && images.some((item) => ["middle_frame", "last_frame"].includes(item.role)))
  )
    add("media", "Flash does not support middle frames, last frames or voices");
  if (input.audioMode === "off") add("audioMode", "Kling 4 does not support disabling audio");
  if (input.audioMode === "original" && (!videos.length || voices.length))
    add("audioMode", "Original audio requires input video and cannot use voice references");
  const ids = [...input.media, ...elements, ...voices].map((item) => item.referenceId).filter((id) => id !== undefined);
  if (new Set(ids).size !== ids.length) add("media", "Reference IDs must be unique across all assets");
  for (const role of ["middle_frame", "reference_image"]) {
    const matches = images.filter((item) => item.role === role);
    if (limits.requireImageReferenceIDs && matches.length > 1 && matches.some((item) => !item.referenceId))
      add("media", "Multiple middle frames or reference images require reference IDs");
  }
  if (images.some((item) => item.role === "first_frame") && images[0]?.role !== "first_frame")
    add("media", "The first frame must be the first image");
  if (images.some((item) => item.role === "last_frame") && images.at(-1)?.role !== "last_frame")
    add("media", "The last frame must be the last image");
  return issues;
}
