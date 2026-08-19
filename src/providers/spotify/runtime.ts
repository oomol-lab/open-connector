import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { OAuthProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalInteger, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const spotifyApiBaseUrl: string = "https://api.spotify.com/v1/";

type SpotifyRuntimeDeps = OAuthProviderContext;
type SpotifyActionHandler = (input: Record<string, unknown>, deps: SpotifyRuntimeDeps) => Promise<unknown>;

type SpotifyRequestOptions = {
  accessToken: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, string | undefined>;
  body?: unknown;
};
export const spotifyActionHandlers: ProviderActionHandlers<"spotify", SpotifyActionHandler> = {
  get_current_user_profile(_input, deps) {
    return spotifyJsonRequest("me", deps);
  },
  search_items(input, deps) {
    return searchSpotifyItems(input, deps);
  },
  get_user_top_tracks(input, deps) {
    return spotifyJsonRequest("me/top/tracks", {
      ...deps,
      query: buildTopItemsQuery(input),
    });
  },
  get_user_top_artists(input, deps) {
    return spotifyJsonRequest("me/top/artists", {
      ...deps,
      query: buildTopItemsQuery(input),
    });
  },
  get_playlist(input, deps) {
    return spotifyJsonRequest(`playlists/${encodeURIComponent(requireString(input.playlistId))}`, {
      ...deps,
      query: {
        market: optionalString(input.market),
      },
    });
  },
  get_playlist_items(input, deps) {
    return spotifyJsonRequest(`playlists/${encodeURIComponent(requireString(input.playlistId))}/tracks`, {
      ...deps,
      query: {
        limit: stringifyOptionalInteger(input.limit),
        offset: stringifyOptionalInteger(input.offset),
        market: optionalString(input.market),
      },
    });
  },
  get_album(input, deps) {
    return spotifyJsonRequest(`albums/${encodeURIComponent(requireString(input.albumId))}`, {
      ...deps,
      query: {
        market: optionalString(input.market),
      },
    });
  },
  get_album_tracks(input, deps) {
    return spotifyJsonRequest(`albums/${encodeURIComponent(requireString(input.albumId))}/tracks`, {
      ...deps,
      query: buildPagingQuery(input, {
        market: optionalString(input.market),
      }),
    });
  },
  get_artist(input, deps) {
    return spotifyJsonRequest(`artists/${encodeURIComponent(requireString(input.artistId))}`, deps);
  },
  get_artist_albums(input, deps) {
    return spotifyJsonRequest(`artists/${encodeURIComponent(requireString(input.artistId))}/albums`, {
      ...deps,
      query: buildPagingQuery(input, {
        include_groups: joinStringArray(input.includeGroups),
        market: optionalString(input.market),
      }),
    });
  },
  get_artist_related_artists(input, deps) {
    return spotifyJsonRequest(`artists/${encodeURIComponent(requireString(input.artistId))}/related-artists`, deps);
  },
  get_artist_top_tracks(input, deps) {
    return spotifyJsonRequest(`artists/${encodeURIComponent(requireString(input.artistId))}/top-tracks`, {
      ...deps,
      query: {
        market: requireString(input.market),
      },
    });
  },
  get_track(input, deps) {
    return spotifyJsonRequest(`tracks/${encodeURIComponent(requireString(input.trackId))}`, {
      ...deps,
      query: {
        market: optionalString(input.market),
      },
    });
  },
  get_several_tracks(input, deps) {
    return spotifyJsonRequest("tracks", {
      ...deps,
      query: {
        ids: joinIds(input.trackIds),
        market: optionalString(input.market),
      },
    });
  },
  get_several_artists(input, deps) {
    return spotifyJsonRequest("artists", {
      ...deps,
      query: {
        ids: joinIds(input.artistIds),
      },
    });
  },
  get_several_albums(input, deps) {
    return spotifyJsonRequest("albums", {
      ...deps,
      query: {
        ids: joinIds(input.albumIds),
        market: optionalString(input.market),
      },
    });
  },
  get_track_audio_features(input, deps) {
    return spotifyJsonRequest(`audio-features/${encodeURIComponent(requireString(input.trackId))}`, deps);
  },
  get_several_track_audio_features(input, deps) {
    return spotifyJsonRequest("audio-features", {
      ...deps,
      query: {
        ids: joinIds(input.trackIds),
      },
    });
  },
  get_track_audio_analysis(input, deps) {
    return spotifyJsonRequest(`audio-analysis/${encodeURIComponent(requireString(input.trackId))}`, deps);
  },
  get_recommendations(input, deps) {
    return spotifyJsonRequest("recommendations", {
      ...deps,
      query: {
        market: optionalString(input.market),
        limit: stringifyOptionalInteger(input.limit),
        seed_artists: joinStringArray(input.seedArtists),
        seed_tracks: joinStringArray(input.seedTracks),
        seed_genres: joinStringArray(input.seedGenres),
      },
    });
  },
  get_available_genre_seeds(_input, deps) {
    return spotifyJsonRequest("recommendations/available-genre-seeds", deps);
  },
  get_available_markets(_input, deps) {
    return spotifyJsonRequest("markets", deps);
  },
  get_playlist_cover_image(input, deps) {
    return spotifyJsonRequest(`playlists/${encodeURIComponent(requireString(input.playlistId))}/images`, deps);
  },
  create_playlist(input, deps) {
    return spotifyJsonRequest(`users/${encodeURIComponent(requireString(input.userId))}/playlists`, {
      ...deps,
      method: "POST",
      body: compactObject({
        name: requireString(input.name),
        public: optionalBoolean(input.public),
        collaborative: optionalBoolean(input.collaborative),
        description: optionalString(input.description),
      }),
    });
  },
  async change_playlist_details(input, deps) {
    await spotifyJsonRequest(`playlists/${encodeURIComponent(requireString(input.playlistId))}`, {
      ...deps,
      method: "PUT",
      body: compactObject({
        name: optionalString(input.name),
        public: optionalBoolean(input.public),
        collaborative: optionalBoolean(input.collaborative),
        description: optionalString(input.description),
      }),
    });

    return {
      success: true,
    };
  },
  add_items_to_playlist(input, deps) {
    return spotifyJsonRequest(`playlists/${encodeURIComponent(requireString(input.playlistId))}/tracks`, {
      ...deps,
      method: "POST",
      body: compactObject({
        uris: requireStringArray(input.uris),
        position: optionalInteger(input.position),
      }),
    }).then((payload) => readSnapshotId(payload));
  },
  update_playlist_items(input, deps) {
    return spotifyJsonRequest(`playlists/${encodeURIComponent(requireString(input.playlistId))}/tracks`, {
      ...deps,
      method: "PUT",
      body: buildUpdatePlaylistItemsBody(input),
    }).then((payload) => readSnapshotId(payload));
  },
  remove_playlist_items(input, deps) {
    return spotifyJsonRequest(`playlists/${encodeURIComponent(requireString(input.playlistId))}/tracks`, {
      ...deps,
      method: "DELETE",
      body: buildRemovePlaylistItemsBody(input),
    }).then((payload) => readSnapshotId(payload));
  },
  async follow_playlist(input, deps) {
    await spotifyJsonRequest(`playlists/${encodeURIComponent(requireString(input.playlistId))}/followers`, {
      ...deps,
      method: "PUT",
      body: compactObject({
        public: optionalBoolean(input.public),
      }),
    });

    return {
      success: true,
    };
  },
  async unfollow_playlist(input, deps) {
    await spotifyJsonRequest(`playlists/${encodeURIComponent(requireString(input.playlistId))}/followers`, {
      ...deps,
      method: "DELETE",
    });

    return {
      success: true,
    };
  },
  get_show(input, deps) {
    return spotifyJsonRequest(`shows/${encodeURIComponent(requireString(input.showId))}`, {
      ...deps,
      query: {
        market: optionalString(input.market),
      },
    });
  },
  get_show_episodes(input, deps) {
    return spotifyJsonRequest(`shows/${encodeURIComponent(requireString(input.showId))}/episodes`, {
      ...deps,
      query: buildPagingQuery(input, {
        market: optionalString(input.market),
      }),
    });
  },
  get_episode(input, deps) {
    return spotifyJsonRequest(`episodes/${encodeURIComponent(requireString(input.episodeId))}`, {
      ...deps,
      query: {
        market: optionalString(input.market),
      },
    });
  },
  get_several_episodes(input, deps) {
    return spotifyJsonRequest("episodes", {
      ...deps,
      query: {
        ids: joinIds(input.episodeIds),
        market: optionalString(input.market),
      },
    });
  },
  get_audiobook(input, deps) {
    return spotifyJsonRequest(`audiobooks/${encodeURIComponent(requireString(input.audiobookId))}`, {
      ...deps,
      query: {
        market: optionalString(input.market),
      },
    });
  },
  get_audiobook_chapters(input, deps) {
    return spotifyJsonRequest(`audiobooks/${encodeURIComponent(requireString(input.audiobookId))}/chapters`, {
      ...deps,
      query: buildPagingQuery(input, {
        market: optionalString(input.market),
      }),
    });
  },
  get_chapter(input, deps) {
    return spotifyJsonRequest(`chapters/${encodeURIComponent(requireString(input.chapterId))}`, {
      ...deps,
      query: {
        market: optionalString(input.market),
      },
    });
  },
  get_several_audiobooks(input, deps) {
    return spotifyJsonRequest("audiobooks", {
      ...deps,
      query: {
        ids: joinIds(input.audiobookIds),
        market: optionalString(input.market),
      },
    });
  },
  get_several_chapters(input, deps) {
    return spotifyJsonRequest("chapters", {
      ...deps,
      query: {
        ids: joinIds(input.chapterIds),
        market: optionalString(input.market),
      },
    });
  },
  get_several_shows(input, deps) {
    return spotifyJsonRequest("shows", {
      ...deps,
      query: {
        ids: joinIds(input.showIds),
        market: optionalString(input.market),
      },
    });
  },
  get_featured_playlists(input, deps) {
    return spotifyJsonRequest("browse/featured-playlists", {
      ...deps,
      query: buildPagingQuery(input, {
        country: optionalString(input.country),
        locale: optionalString(input.locale),
        timestamp: optionalString(input.timestamp),
      }),
    });
  },
  get_new_releases(input, deps) {
    return spotifyJsonRequest("browse/new-releases", {
      ...deps,
      query: buildPagingQuery(input, {
        country: optionalString(input.country),
      }),
    });
  },
  get_browse_categories(input, deps) {
    return spotifyJsonRequest("browse/categories", {
      ...deps,
      query: buildPagingQuery(input, {
        country: optionalString(input.country),
        locale: optionalString(input.locale),
      }),
    });
  },
  get_browse_category(input, deps) {
    return spotifyJsonRequest(`browse/categories/${encodeURIComponent(requireString(input.categoryId))}`, {
      ...deps,
      query: {
        country: optionalString(input.country),
        locale: optionalString(input.locale),
      },
    });
  },
  get_category_playlists(input, deps) {
    return spotifyJsonRequest(`browse/categories/${encodeURIComponent(requireString(input.categoryId))}/playlists`, {
      ...deps,
      query: buildPagingQuery(input, {
        country: optionalString(input.country),
      }),
    });
  },
  get_user_profile(input, deps) {
    return spotifyJsonRequest(`users/${encodeURIComponent(requireString(input.userId))}`, deps);
  },
  get_current_user_playlists(input, deps) {
    return spotifyJsonRequest("me/playlists", {
      ...deps,
      query: buildPagingQuery(input),
    });
  },
  get_user_playlists(input, deps) {
    return spotifyJsonRequest(`users/${encodeURIComponent(requireString(input.userId))}/playlists`, {
      ...deps,
      query: buildPagingQuery(input),
    });
  },
  save_albums_for_current_user(input, deps) {
    return spotifySuccessRequest("me/albums", {
      ...deps,
      method: "PUT",
      body: {
        ids: requireStringArray(input.albumIds),
      },
    });
  },
  remove_users_saved_albums(input, deps) {
    return spotifySuccessRequest("me/albums", {
      ...deps,
      method: "DELETE",
      body: {
        ids: requireStringArray(input.albumIds),
      },
    });
  },
  save_audiobooks_for_current_user(input, deps) {
    return spotifySuccessRequest("me/audiobooks", {
      ...deps,
      method: "PUT",
      query: {
        ids: joinIds(input.audiobookIds),
      },
    });
  },
  remove_user_s_saved_audiobooks(input, deps) {
    return spotifySuccessRequest("me/audiobooks", {
      ...deps,
      method: "DELETE",
      query: {
        ids: joinIds(input.audiobookIds),
      },
    });
  },
  save_episodes_for_current_user(input, deps) {
    return spotifySuccessRequest("me/episodes", {
      ...deps,
      method: "PUT",
      body: {
        ids: requireStringArray(input.episodeIds),
      },
    });
  },
  remove_user_s_saved_episodes(input, deps) {
    return spotifySuccessRequest("me/episodes", {
      ...deps,
      method: "DELETE",
      body: {
        ids: requireStringArray(input.episodeIds),
      },
    });
  },
  save_shows_for_current_user(input, deps) {
    return spotifySuccessRequest("me/shows", {
      ...deps,
      method: "PUT",
      query: {
        ids: joinIds(input.showIds),
      },
    });
  },
  remove_user_s_saved_shows(input, deps) {
    return spotifySuccessRequest("me/shows", {
      ...deps,
      method: "DELETE",
      query: {
        ids: joinIds(input.showIds),
        market: optionalString(input.market),
      },
    });
  },
  save_tracks_for_current_user(input, deps) {
    return spotifySuccessRequest("me/tracks", {
      ...deps,
      method: "PUT",
      body: buildSaveTracksBody(input),
    });
  },
  remove_user_s_saved_tracks(input, deps) {
    return spotifySuccessRequest("me/tracks", {
      ...deps,
      method: "DELETE",
      body: {
        ids: requireStringArray(input.trackIds),
      },
    });
  },
  get_user_saved_albums(input, deps) {
    return spotifyJsonRequest("me/albums", {
      ...deps,
      query: buildPagingQuery(input, {
        market: optionalString(input.market),
      }),
    });
  },
  get_user_saved_audiobooks(input, deps) {
    return spotifyJsonRequest("me/audiobooks", {
      ...deps,
      query: buildPagingQuery(input),
    });
  },
  get_user_saved_episodes(input, deps) {
    return spotifyJsonRequest("me/episodes", {
      ...deps,
      query: buildPagingQuery(input, {
        market: optionalString(input.market),
      }),
    });
  },
  get_user_saved_shows(input, deps) {
    return spotifyJsonRequest("me/shows", {
      ...deps,
      query: buildPagingQuery(input),
    });
  },
  get_user_saved_tracks(input, deps) {
    return spotifyJsonRequest("me/tracks", {
      ...deps,
      query: buildPagingQuery(input, {
        market: optionalString(input.market),
      }),
    });
  },
  check_saved_albums(input, deps) {
    return spotifyBooleanResultsRequest("me/albums/contains", input.albumIds, deps);
  },
  check_saved_audiobooks(input, deps) {
    return spotifyBooleanResultsRequest("me/audiobooks/contains", input.audiobookIds, deps);
  },
  check_saved_episodes(input, deps) {
    return spotifyBooleanResultsRequest("me/episodes/contains", input.episodeIds, deps);
  },
  check_saved_shows(input, deps) {
    return spotifyBooleanResultsRequest("me/shows/contains", input.showIds, deps);
  },
  check_saved_tracks(input, deps) {
    return spotifyBooleanResultsRequest("me/tracks/contains", input.trackIds, deps);
  },
  follow_artists_or_users(input, deps) {
    return spotifySuccessRequest("me/following", {
      ...deps,
      method: "PUT",
      query: {
        type: requireString(input.type),
        ids: joinIds(input.ids),
      },
    });
  },
  unfollow_artists_or_users(input, deps) {
    return spotifySuccessRequest("me/following", {
      ...deps,
      method: "DELETE",
      query: {
        type: requireString(input.type),
        ids: joinIds(input.ids),
      },
    });
  },
  get_followed_artists(input, deps) {
    return spotifyJsonRequest("me/following", {
      ...deps,
      query: {
        type: "artist",
        after: optionalString(input.after),
        limit: stringifyOptionalInteger(input.limit),
      },
    });
  },
  check_user_follows_artists_or_users(input, deps) {
    return spotifyBooleanResultsRequest("me/following/contains", input.ids, deps, {
      type: requireString(input.type),
    });
  },
  check_users_follow_playlist(input, deps) {
    return spotifyBooleanResultsRequest(
      `playlists/${encodeURIComponent(requireString(input.playlistId))}/followers/contains`,
      input.userIds,
      deps,
    );
  },
  get_available_devices(_input, deps) {
    return spotifyJsonRequest("me/player/devices", deps);
  },
  start_resume_playback(input, deps) {
    return spotifySuccessRequest("me/player/play", {
      ...deps,
      method: "PUT",
      query: buildDeviceQuery(input),
      body: buildStartResumePlaybackBody(input),
    });
  },
  pause_playback(input, deps) {
    return spotifySuccessRequest("me/player/pause", {
      ...deps,
      method: "PUT",
      query: buildDeviceQuery(input),
    });
  },
  seek_to_position(input, deps) {
    return spotifySuccessRequest("me/player/seek", {
      ...deps,
      method: "PUT",
      query: {
        ...buildDeviceQuery(input),
        position_ms: stringifyOptionalInteger(input.positionMs),
      },
    });
  },
  set_repeat_mode(input, deps) {
    return spotifySuccessRequest("me/player/repeat", {
      ...deps,
      method: "PUT",
      query: {
        ...buildDeviceQuery(input),
        state: requireString(input.state),
      },
    });
  },
  set_playback_volume(input, deps) {
    return spotifySuccessRequest("me/player/volume", {
      ...deps,
      method: "PUT",
      query: {
        ...buildDeviceQuery(input),
        volume_percent: stringifyOptionalInteger(input.volumePercent),
      },
    });
  },
  skip_to_next(input, deps) {
    return spotifySuccessRequest("me/player/next", {
      ...deps,
      method: "POST",
      query: buildDeviceQuery(input),
    });
  },
  skip_to_previous(input, deps) {
    return spotifySuccessRequest("me/player/previous", {
      ...deps,
      method: "POST",
      query: buildDeviceQuery(input),
    });
  },
  toggle_playback_shuffle(input, deps) {
    return spotifySuccessRequest("me/player/shuffle", {
      ...deps,
      method: "PUT",
      query: {
        ...buildDeviceQuery(input),
        state: String(optionalBoolean(input.state) === true),
      },
    });
  },
  transfer_playback(input, deps) {
    return spotifySuccessRequest("me/player", {
      ...deps,
      method: "PUT",
      body: compactObject({
        device_ids: requireStringArray(input.deviceIds),
        play: optionalBoolean(input.play),
      }),
    });
  },
  add_item_to_playback_queue(input, deps) {
    return spotifySuccessRequest("me/player/queue", {
      ...deps,
      method: "POST",
      query: {
        ...buildDeviceQuery(input),
        uri: requireString(input.uri),
      },
    });
  },
  get_playback_state(input, deps) {
    return spotifyJsonRequest("me/player", {
      ...deps,
      query: buildPlaybackQuery(input),
    });
  },
  get_currently_playing_track(input, deps) {
    return spotifyJsonRequest("me/player/currently-playing", {
      ...deps,
      query: buildPlaybackQuery(input),
    });
  },
  get_recently_played_tracks(input, deps) {
    return spotifyJsonRequest("me/player/recently-played", {
      ...deps,
      query: {
        limit: stringifyOptionalInteger(input.limit),
        after: stringifyOptionalInteger(input.after),
        before: stringifyOptionalInteger(input.before),
      },
    });
  },
  get_user_queue(_input, deps) {
    return spotifyJsonRequest("me/player/queue", deps);
  },
};
export async function spotifyJsonRequest<T = unknown>(path: string, input: SpotifyRequestOptions): Promise<T> {
  const target = new URL(path, spotifyApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (typeof value !== "string" || value.length === 0) {
      continue;
    }
    target.searchParams.set(key, value);
  }

  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${input.accessToken}`,
    "user-agent": providerUserAgent,
  });
  let body: string | undefined;
  if (input.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(input.body);
  }

  const response = await input.fetcher(target.toString(), {
    method: input.method ?? "GET",
    headers,
    signal: input.signal,
    ...(body === undefined ? {} : { body }),
  });

  await assertSpotifyResponse(response);
  return (await readSpotifyJsonResponse(response)) as T;
}

export async function assertSpotifyResponse(response: Response): Promise<void> {
  if (response.ok) return;
  const { message } = await readSpotifyError(response);
  if (response.status === 400) throw new ProviderRequestError(400, message);
  if (response.status === 401) throw new ProviderRequestError(401, message);
  if (response.status === 403) throw new ProviderRequestError(403, message);
  if (response.status === 429) throw new ProviderRequestError(429, message);
  throw new ProviderRequestError(response.status, message);
}
async function searchSpotifyItems(input: Record<string, unknown>, deps: SpotifyRuntimeDeps) {
  const types = requireStringArray(input.types);
  const payload = await spotifyJsonRequest<Record<string, unknown>>("search", {
    ...deps,
    query: {
      q: requireString(input.query),
      type: types.join(","),
      limit: stringifyOptionalInteger(input.limit),
      offset: stringifyOptionalInteger(input.offset),
      market: optionalString(input.market),
      include_external: optionalBoolean(input.includeExternalAudio) ? "audio" : undefined,
    },
  });

  return {
    query: requireString(input.query),
    types,
    ...(asOptionalRecord(payload.albums) ? { albums: payload.albums } : {}),
    ...(asOptionalRecord(payload.artists) ? { artists: payload.artists } : {}),
    ...(asOptionalRecord(payload.playlists) ? { playlists: payload.playlists } : {}),
    ...(asOptionalRecord(payload.tracks) ? { tracks: payload.tracks } : {}),
    ...(asOptionalRecord(payload.shows) ? { shows: payload.shows } : {}),
    ...(asOptionalRecord(payload.episodes) ? { episodes: payload.episodes } : {}),
    ...(asOptionalRecord(payload.audiobooks) ? { audiobooks: payload.audiobooks } : {}),
  };
}

async function spotifyBooleanResultsRequest(
  path: string,
  ids: unknown,
  deps: SpotifyRuntimeDeps,
  extraQuery?: Record<string, string | undefined>,
) {
  const payload = await spotifyJsonRequest<unknown>(path, {
    ...deps,
    query: {
      ...(extraQuery ?? {}),
      ids: joinIds(ids),
    },
  });

  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "spotify boolean response is malformed");
  }
  if (payload.some((value) => typeof value !== "boolean")) {
    throw new ProviderRequestError(502, "spotify boolean response is malformed");
  }

  return {
    results: payload,
  };
}

async function spotifySuccessRequest(path: string, input: SpotifyRequestOptions) {
  await spotifyJsonRequest(path, input);
  return {
    success: true,
  };
}

function buildTopItemsQuery(input: Record<string, unknown>) {
  return {
    limit: stringifyOptionalInteger(input.limit),
    offset: stringifyOptionalInteger(input.offset),
    time_range: optionalString(input.timeRange),
  };
}

function buildPagingQuery(input: Record<string, unknown>, extraQuery?: Record<string, string | undefined>) {
  return {
    limit: stringifyOptionalInteger(input.limit),
    offset: stringifyOptionalInteger(input.offset),
    ...(extraQuery ?? {}),
  };
}

function buildPlaybackQuery(input: Record<string, unknown>) {
  return {
    market: optionalString(input.market),
    additional_types: joinStringArray(input.additionalTypes),
  };
}

function buildDeviceQuery(input: Record<string, unknown>) {
  return {
    device_id: optionalString(input.deviceId),
  };
}

function buildUpdatePlaylistItemsBody(input: Record<string, unknown>) {
  const uris = Array.isArray(input.uris) ? requireStringArray(input.uris) : undefined;
  if (uris && uris.length > 0) {
    return {
      uris,
    };
  }

  return compactObject({
    range_start: optionalInteger(input.rangeStart),
    insert_before: optionalInteger(input.insertBefore),
    range_length: optionalInteger(input.rangeLength),
    snapshot_id: optionalString(input.snapshotId),
  });
}

function buildRemovePlaylistItemsBody(input: Record<string, unknown>) {
  return compactObject({
    tracks: requireRemovalItems(input.items),
    snapshot_id: optionalString(input.snapshotId),
  });
}

function buildSaveTracksBody(input: Record<string, unknown>) {
  const timestampedTrackIds = requireTimestampedTrackIds(input.timestampedTrackIds);
  if (timestampedTrackIds) {
    return {
      timestamped_ids: timestampedTrackIds,
    };
  }

  return {
    ids: requireStringArray(input.trackIds),
  };
}

function buildStartResumePlaybackBody(input: Record<string, unknown>) {
  const offset = asOptionalRecord(input.offset);
  return compactObject({
    context_uri: optionalString(input.contextUri),
    uris: Array.isArray(input.uris) ? requireStringArray(input.uris) : undefined,
    offset:
      offset === undefined
        ? undefined
        : compactObject({
            position: optionalInteger(offset.position),
            uri: optionalString(offset.uri),
          }),
    position_ms: optionalInteger(input.positionMs),
  });
}

async function readSpotifyJsonResponse(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "malformed spotify response");
  }
}

async function readSpotifyError(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text) {
    return {
      message: `spotify request failed with status ${response.status}`,
    };
  }

  try {
    const payload = JSON.parse(text) as Record<string, unknown>;
    const error = asOptionalRecord(payload.error);
    const message =
      optionalString(error?.message) ??
      optionalString(payload.error_description) ??
      optionalString(payload.message) ??
      `spotify request failed with status ${response.status}`;

    return { message };
  } catch {
    return {
      message: text,
    };
  }
}

function requireString(value: unknown) {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProviderRequestError(400, "expected a non-empty string");
  }

  return value;
}

function requireStringArray(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ProviderRequestError(400, "expected a non-empty string array");
  }

  const items = value.map((item) => requireString(item));
  return items;
}

function requireRemovalItems(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ProviderRequestError(400, "expected a non-empty item array");
  }

  return value.map((item) => {
    const record = asOptionalRecord(item);
    if (!record) {
      throw new ProviderRequestError(400, "playlist removal item must be an object");
    }

    return compactObject({
      uri: requireString(record.uri),
      positions: Array.isArray(record.positions)
        ? record.positions.map((position) => {
            const parsed = optionalInteger(position);
            if (parsed === undefined || parsed < 0) {
              throw new ProviderRequestError(400, "playlist removal positions must be non-negative integers");
            }
            return parsed;
          })
        : undefined,
    });
  });
}

function requireTimestampedTrackIds(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }

  return value.map((item) => {
    const record = asOptionalRecord(item);
    if (!record) {
      throw new ProviderRequestError(400, "timestamped track item must be an object");
    }

    return {
      id: requireString(record.trackId),
      added_at: requireString(record.addedAt),
    };
  });
}

function joinIds(value: unknown) {
  return requireStringArray(value).join(",");
}

function joinStringArray(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }

  return value.map((item) => requireString(item)).join(",");
}

function stringifyOptionalInteger(value: unknown) {
  const integer = optionalInteger(value);
  return integer === undefined ? undefined : String(integer);
}

function readSnapshotId(payload: unknown) {
  const record = asOptionalRecord(payload);
  const snapshotId = optionalString(record?.snapshot_id);
  if (!snapshotId) {
    throw new ProviderRequestError(502, "spotify snapshot response is malformed");
  }

  return {
    snapshotId,
  };
}

function asOptionalRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}
