export const speechmaticsBatchRegions = ["eu1", "eu2", "us1", "us2", "au1"] as const;

export type SpeechmaticsBatchRegion = (typeof speechmaticsBatchRegions)[number];

export const speechmaticsBatchHosts: Readonly<Record<SpeechmaticsBatchRegion, string>> = {
  eu1: "eu1.asr.api.speechmatics.com",
  eu2: "eu2.asr.api.speechmatics.com",
  us1: "us1.asr.api.speechmatics.com",
  us2: "us2.asr.api.speechmatics.com",
  au1: "au1.asr.api.speechmatics.com",
};
