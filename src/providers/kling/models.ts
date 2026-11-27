export const defaultKlingModel = "kling-3.0";
export const klingModels = ["kling-3.0-turbo", "kling-3.0", "kling-3.0-omni", "kling-4.0", "kling-4.0-flash"] as const;
export type KlingModel = (typeof klingModels)[number];
export type KlingResolution = "720p" | "1080p" | "4k";
export type KlingAudioMode = "off" | "native" | "original";

interface KlingDefaults {
  resolution: KlingResolution;
  aspectRatio: "16:9" | "adaptive";
  duration: number | undefined;
  audioMode: KlingAudioMode;
}

export interface KlingMultimodalLimits {
  maxDuration: number;
  resolutions: readonly KlingResolution[];
  dynamicRange: boolean;
  frameSequence: boolean;
  maxVoices: number;
  requireImageReferenceIDs: boolean;
}

interface KlingSettingsContract {
  multiShot: boolean;
  inheritMediaSettings: boolean;
  audio: "all" | "omni";
}

interface KlingModelDefinition {
  defaults: KlingDefaults;
  settings: KlingSettingsContract;
  multimodal: KlingMultimodalLimits | undefined;
}

const classicSettings: KlingSettingsContract = {
  multiShot: true,
  inheritMediaSettings: true,
  audio: "all",
};
const multimodalSettings: KlingSettingsContract = {
  multiShot: false,
  inheritMediaSettings: false,
  audio: "omni",
};

const standardDefaults: KlingDefaults = {
  resolution: "720p",
  aspectRatio: "16:9",
  duration: 5,
  audioMode: "off",
};
const automaticDefaults: KlingDefaults = {
  resolution: "1080p",
  aspectRatio: "adaptive",
  duration: undefined,
  audioMode: "native",
};
const fullMultimodal: KlingMultimodalLimits = {
  maxDuration: 30,
  resolutions: ["720p", "1080p", "4k"],
  dynamicRange: true,
  frameSequence: true,
  maxVoices: 3,
  requireImageReferenceIDs: true,
};
const fastMultimodal: KlingMultimodalLimits = {
  maxDuration: 20,
  resolutions: ["720p"],
  dynamicRange: false,
  frameSequence: false,
  maxVoices: 0,
  requireImageReferenceIDs: false,
};

// Official model capabilities and defaults drive protocol validation and request mapping.
// https://klingai.com/document-api/api/video/4-0/video-omni
// https://klingai.com/document-api/api/video/4-0-flash/video-omni
export const klingModelDefinitions: Record<KlingModel, KlingModelDefinition> = {
  "kling-3.0": { defaults: standardDefaults, settings: classicSettings, multimodal: undefined },
  "kling-3.0-turbo": {
    defaults: { ...standardDefaults, audioMode: "native" },
    settings: classicSettings,
    multimodal: undefined,
  },
  "kling-3.0-omni": {
    defaults: standardDefaults,
    settings: classicSettings,
    multimodal: undefined,
  },
  "kling-4.0": {
    defaults: automaticDefaults,
    settings: multimodalSettings,
    multimodal: fullMultimodal,
  },
  "kling-4.0-flash": {
    defaults: { ...automaticDefaults, resolution: "720p" },
    settings: multimodalSettings,
    multimodal: fastMultimodal,
  },
};
