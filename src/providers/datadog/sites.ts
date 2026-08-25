export const datadogOAuthAuthorizationUrl = "https://app.datadoghq.com/oauth2/v1/authorize";

export const datadogApiKeySites: Record<string, string> = {
  us1: "https://api.datadoghq.com",
  us3: "https://api.us3.datadoghq.com",
  us5: "https://api.us5.datadoghq.com",
  eu: "https://api.datadoghq.eu",
  ap1: "https://api.ap1.datadoghq.com",
  ap2: "https://api.ap2.datadoghq.com",
  uk1: "https://api.uk1.datadoghq.com",
  gov: "https://api.ddog-gov.com",
  gov2: "https://api.us2.ddog-gov.com",
};

export const datadogOAuthSites: Record<string, string> = {
  "datadoghq.com": datadogApiKeySites.us1!,
  "us3.datadoghq.com": datadogApiKeySites.us3!,
  "us5.datadoghq.com": datadogApiKeySites.us5!,
  "datadoghq.eu": datadogApiKeySites.eu!,
  "ap1.datadoghq.com": datadogApiKeySites.ap1!,
  "ap2.datadoghq.com": datadogApiKeySites.ap2!,
  "uk1.datadoghq.com": datadogApiKeySites.uk1!,
  "ddog-gov.com": datadogApiKeySites.gov!,
  "us2.ddog-gov.com": datadogApiKeySites.gov2!,
};
