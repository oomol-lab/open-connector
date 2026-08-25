import type { ProviderDefinition } from "../../core/types.ts";

import { tmdbActions } from "./actions.ts";

const service = "tmdb";

export const provider: ProviderDefinition = {
  service,
  displayName: "TMDB",
  description: "Search and look up movies, TV shows, people, and trending titles on The Movie Database.",
  categories: ["Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Read Access Token",
      placeholder: "eyJhbGciOiJIUzI1NiJ9...",
      description:
        "TMDB API Read Access Token sent as an Authorization Bearer token. Create or copy it from TMDB API settings: https://www.themoviedb.org/settings/api. Use the Read Access Token, not the short v3 API key.",
    },
  ],
  homepageUrl: "https://www.themoviedb.org",
  actions: tmdbActions,
};
