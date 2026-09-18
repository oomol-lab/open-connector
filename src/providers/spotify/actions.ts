import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { spotifyProviderScopes } from "./scopes.ts";

const service = "spotify";

const rawObject = s.looseObject({}, { description: "Spotify Web API response payload." });
const successOutput = s.actionOutput(
  { success: s.boolean("Whether the operation completed successfully.") },
  "Spotify mutation result.",
);
const snapshotOutput = s.actionOutput(
  { snapshotId: s.string("Playlist snapshot identifier returned by Spotify.") },
  "Spotify playlist mutation result.",
);

export type SpotifyActionName =
  | "get_current_user_profile"
  | "search_items"
  | "get_user_top_tracks"
  | "get_user_top_artists"
  | "get_playlist"
  | "get_playlist_items"
  | "get_album"
  | "get_album_tracks"
  | "get_artist"
  | "get_artist_albums"
  | "get_artist_related_artists"
  | "get_artist_top_tracks"
  | "get_track"
  | "get_several_tracks"
  | "get_several_artists"
  | "get_several_albums"
  | "get_track_audio_features"
  | "get_several_track_audio_features"
  | "get_track_audio_analysis"
  | "get_recommendations"
  | "get_available_genre_seeds"
  | "get_available_markets"
  | "get_playlist_cover_image"
  | "create_playlist"
  | "change_playlist_details"
  | "add_items_to_playlist"
  | "update_playlist_items"
  | "remove_playlist_items"
  | "follow_playlist"
  | "unfollow_playlist"
  | "get_show"
  | "get_show_episodes"
  | "get_episode"
  | "get_several_episodes"
  | "get_audiobook"
  | "get_audiobook_chapters"
  | "get_chapter"
  | "get_several_audiobooks"
  | "get_several_chapters"
  | "get_several_shows"
  | "get_featured_playlists"
  | "get_new_releases"
  | "get_browse_categories"
  | "get_browse_category"
  | "get_category_playlists"
  | "get_user_profile"
  | "get_current_user_playlists"
  | "get_user_playlists"
  | "save_albums_for_current_user"
  | "remove_users_saved_albums"
  | "save_audiobooks_for_current_user"
  | "remove_user_s_saved_audiobooks"
  | "save_episodes_for_current_user"
  | "remove_user_s_saved_episodes"
  | "save_shows_for_current_user"
  | "remove_user_s_saved_shows"
  | "save_tracks_for_current_user"
  | "remove_user_s_saved_tracks"
  | "get_user_saved_albums"
  | "get_user_saved_audiobooks"
  | "get_user_saved_episodes"
  | "get_user_saved_shows"
  | "get_user_saved_tracks"
  | "check_saved_albums"
  | "check_saved_audiobooks"
  | "check_saved_episodes"
  | "check_saved_shows"
  | "check_saved_tracks"
  | "follow_artists_or_users"
  | "unfollow_artists_or_users"
  | "get_followed_artists"
  | "check_user_follows_artists_or_users"
  | "check_users_follow_playlist"
  | "get_available_devices"
  | "start_resume_playback"
  | "pause_playback"
  | "seek_to_position"
  | "set_repeat_mode"
  | "set_playback_volume"
  | "skip_to_next"
  | "skip_to_previous"
  | "toggle_playback_shuffle"
  | "transfer_playback"
  | "add_item_to_playback_queue"
  | "get_playback_state"
  | "get_currently_playing_track"
  | "get_recently_played_tracks"
  | "get_user_queue";

export const spotifyActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user_profile",
    operationType: "read",
    description: "Get Current User Profile using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.userReadPrivate, spotifyProviderScopes.userReadEmail],
    inputSchema: spotifyInputSchema("get_current_user_profile"),
    outputSchema: spotifyOutputSchema("get_current_user_profile"),
  }),
  defineProviderAction(service, {
    name: "search_items",
    operationType: "read",
    description: "Search Items using the Spotify Web API.",
    requiredScopes: [],
    inputSchema: spotifyInputSchema("search_items"),
    outputSchema: spotifyOutputSchema("search_items"),
  }),
  defineProviderAction(service, {
    name: "get_user_top_tracks",
    operationType: "read",
    description: "Get User Top Tracks using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.userTopRead],
    inputSchema: spotifyInputSchema("get_user_top_tracks"),
    outputSchema: spotifyOutputSchema("get_user_top_tracks"),
  }),
  defineProviderAction(service, {
    name: "get_user_top_artists",
    operationType: "read",
    description: "Get User Top Artists using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.userTopRead],
    inputSchema: spotifyInputSchema("get_user_top_artists"),
    outputSchema: spotifyOutputSchema("get_user_top_artists"),
  }),
  defineProviderAction(service, {
    name: "get_playlist",
    operationType: "read",
    description: "Get Playlist using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.playlistReadPrivate, spotifyProviderScopes.playlistReadCollaborative],
    inputSchema: spotifyInputSchema("get_playlist"),
    outputSchema: spotifyOutputSchema("get_playlist"),
  }),
  defineProviderAction(service, {
    name: "get_playlist_items",
    operationType: "read",
    description: "Get Playlist Items using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.playlistReadPrivate, spotifyProviderScopes.playlistReadCollaborative],
    inputSchema: spotifyInputSchema("get_playlist_items"),
    outputSchema: spotifyOutputSchema("get_playlist_items"),
  }),
  defineProviderAction(service, {
    name: "get_album",
    operationType: "read",
    description: "Get Album using the Spotify Web API.",
    requiredScopes: [],
    inputSchema: spotifyInputSchema("get_album"),
    outputSchema: spotifyOutputSchema("get_album"),
  }),
  defineProviderAction(service, {
    name: "get_album_tracks",
    operationType: "read",
    description: "Get Album Tracks using the Spotify Web API.",
    requiredScopes: [],
    inputSchema: spotifyInputSchema("get_album_tracks"),
    outputSchema: spotifyOutputSchema("get_album_tracks"),
  }),
  defineProviderAction(service, {
    name: "get_artist",
    operationType: "read",
    description: "Get Artist using the Spotify Web API.",
    requiredScopes: [],
    inputSchema: spotifyInputSchema("get_artist"),
    outputSchema: spotifyOutputSchema("get_artist"),
  }),
  defineProviderAction(service, {
    name: "get_artist_albums",
    operationType: "read",
    description: "Get Artist Albums using the Spotify Web API.",
    requiredScopes: [],
    inputSchema: spotifyInputSchema("get_artist_albums"),
    outputSchema: spotifyOutputSchema("get_artist_albums"),
  }),
  defineProviderAction(service, {
    name: "get_artist_related_artists",
    operationType: "read",
    description: "Get Artist Related Artists using the Spotify Web API.",
    requiredScopes: [],
    inputSchema: spotifyInputSchema("get_artist_related_artists"),
    outputSchema: spotifyOutputSchema("get_artist_related_artists"),
  }),
  defineProviderAction(service, {
    name: "get_artist_top_tracks",
    operationType: "read",
    description: "Get Artist Top Tracks using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.userTopRead],
    inputSchema: spotifyInputSchema("get_artist_top_tracks"),
    outputSchema: spotifyOutputSchema("get_artist_top_tracks"),
  }),
  defineProviderAction(service, {
    name: "get_track",
    operationType: "read",
    description: "Get Track using the Spotify Web API.",
    requiredScopes: [],
    inputSchema: spotifyInputSchema("get_track"),
    outputSchema: spotifyOutputSchema("get_track"),
  }),
  defineProviderAction(service, {
    name: "get_several_tracks",
    operationType: "read",
    description: "Get Several Tracks using the Spotify Web API.",
    requiredScopes: [],
    inputSchema: spotifyInputSchema("get_several_tracks"),
    outputSchema: spotifyOutputSchema("get_several_tracks"),
  }),
  defineProviderAction(service, {
    name: "get_several_artists",
    operationType: "read",
    description: "Get Several Artists using the Spotify Web API.",
    requiredScopes: [],
    inputSchema: spotifyInputSchema("get_several_artists"),
    outputSchema: spotifyOutputSchema("get_several_artists"),
  }),
  defineProviderAction(service, {
    name: "get_several_albums",
    operationType: "read",
    description: "Get Several Albums using the Spotify Web API.",
    requiredScopes: [],
    inputSchema: spotifyInputSchema("get_several_albums"),
    outputSchema: spotifyOutputSchema("get_several_albums"),
  }),
  defineProviderAction(service, {
    name: "get_track_audio_features",
    operationType: "read",
    description: "Get Track Audio Features using the Spotify Web API.",
    requiredScopes: [],
    inputSchema: spotifyInputSchema("get_track_audio_features"),
    outputSchema: spotifyOutputSchema("get_track_audio_features"),
  }),
  defineProviderAction(service, {
    name: "get_several_track_audio_features",
    operationType: "read",
    description: "Get Several Track Audio Features using the Spotify Web API.",
    requiredScopes: [],
    inputSchema: spotifyInputSchema("get_several_track_audio_features"),
    outputSchema: spotifyOutputSchema("get_several_track_audio_features"),
  }),
  defineProviderAction(service, {
    name: "get_track_audio_analysis",
    operationType: "read",
    description: "Get Track Audio Analysis using the Spotify Web API.",
    requiredScopes: [],
    inputSchema: spotifyInputSchema("get_track_audio_analysis"),
    outputSchema: spotifyOutputSchema("get_track_audio_analysis"),
  }),
  defineProviderAction(service, {
    name: "get_recommendations",
    operationType: "read",
    description: "Get Recommendations using the Spotify Web API.",
    requiredScopes: [],
    inputSchema: spotifyInputSchema("get_recommendations"),
    outputSchema: spotifyOutputSchema("get_recommendations"),
  }),
  defineProviderAction(service, {
    name: "get_available_genre_seeds",
    operationType: "read",
    description: "Get Available Genre Seeds using the Spotify Web API.",
    requiredScopes: [],
    inputSchema: spotifyInputSchema("get_available_genre_seeds"),
    outputSchema: spotifyOutputSchema("get_available_genre_seeds"),
  }),
  defineProviderAction(service, {
    name: "get_available_markets",
    operationType: "read",
    description: "Get Available Markets using the Spotify Web API.",
    requiredScopes: [],
    inputSchema: spotifyInputSchema("get_available_markets"),
    outputSchema: spotifyOutputSchema("get_available_markets"),
  }),
  defineProviderAction(service, {
    name: "get_playlist_cover_image",
    operationType: "read",
    description: "Get Playlist Cover Image using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.playlistReadPrivate, spotifyProviderScopes.playlistReadCollaborative],
    inputSchema: spotifyInputSchema("get_playlist_cover_image"),
    outputSchema: spotifyOutputSchema("get_playlist_cover_image"),
  }),
  defineProviderAction(service, {
    name: "create_playlist",
    operationType: "write",
    description: "Create Playlist using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.playlistModifyPublic, spotifyProviderScopes.playlistModifyPrivate],
    inputSchema: spotifyInputSchema("create_playlist"),
    outputSchema: spotifyOutputSchema("create_playlist"),
  }),
  defineProviderAction(service, {
    name: "change_playlist_details",
    operationType: "write",
    description: "Change Playlist Details using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.playlistModifyPublic, spotifyProviderScopes.playlistModifyPrivate],
    inputSchema: spotifyInputSchema("change_playlist_details"),
    outputSchema: spotifyOutputSchema("change_playlist_details"),
  }),
  defineProviderAction(service, {
    name: "add_items_to_playlist",
    operationType: "write",
    description: "Add Items To Playlist using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.playlistModifyPublic, spotifyProviderScopes.playlistModifyPrivate],
    inputSchema: spotifyInputSchema("add_items_to_playlist"),
    outputSchema: spotifyOutputSchema("add_items_to_playlist"),
  }),
  defineProviderAction(service, {
    name: "update_playlist_items",
    operationType: "destructive",
    description: "Update Playlist Items using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.playlistModifyPublic, spotifyProviderScopes.playlistModifyPrivate],
    inputSchema: spotifyInputSchema("update_playlist_items"),
    outputSchema: spotifyOutputSchema("update_playlist_items"),
  }),
  defineProviderAction(service, {
    name: "remove_playlist_items",
    operationType: "destructive",
    description: "Remove Playlist Items using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.playlistModifyPublic, spotifyProviderScopes.playlistModifyPrivate],
    inputSchema: spotifyInputSchema("remove_playlist_items"),
    outputSchema: spotifyOutputSchema("remove_playlist_items"),
  }),
  defineProviderAction(service, {
    name: "follow_playlist",
    operationType: "write",
    description: "Follow Playlist using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.playlistModifyPublic, spotifyProviderScopes.playlistModifyPrivate],
    inputSchema: spotifyInputSchema("follow_playlist"),
    outputSchema: spotifyOutputSchema("follow_playlist"),
  }),
  defineProviderAction(service, {
    name: "unfollow_playlist",
    operationType: "destructive",
    description: "Unfollow Playlist using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.playlistModifyPublic, spotifyProviderScopes.playlistModifyPrivate],
    inputSchema: spotifyInputSchema("unfollow_playlist"),
    outputSchema: spotifyOutputSchema("unfollow_playlist"),
  }),
  defineProviderAction(service, {
    name: "get_show",
    operationType: "read",
    description: "Get Show using the Spotify Web API.",
    requiredScopes: [],
    inputSchema: spotifyInputSchema("get_show"),
    outputSchema: spotifyOutputSchema("get_show"),
  }),
  defineProviderAction(service, {
    name: "get_show_episodes",
    operationType: "read",
    description: "Get Show Episodes using the Spotify Web API.",
    requiredScopes: [],
    inputSchema: spotifyInputSchema("get_show_episodes"),
    outputSchema: spotifyOutputSchema("get_show_episodes"),
  }),
  defineProviderAction(service, {
    name: "get_episode",
    operationType: "read",
    description: "Get Episode using the Spotify Web API.",
    requiredScopes: [],
    inputSchema: spotifyInputSchema("get_episode"),
    outputSchema: spotifyOutputSchema("get_episode"),
  }),
  defineProviderAction(service, {
    name: "get_several_episodes",
    operationType: "read",
    description: "Get Several Episodes using the Spotify Web API.",
    requiredScopes: [],
    inputSchema: spotifyInputSchema("get_several_episodes"),
    outputSchema: spotifyOutputSchema("get_several_episodes"),
  }),
  defineProviderAction(service, {
    name: "get_audiobook",
    operationType: "read",
    description: "Get Audiobook using the Spotify Web API.",
    requiredScopes: [],
    inputSchema: spotifyInputSchema("get_audiobook"),
    outputSchema: spotifyOutputSchema("get_audiobook"),
  }),
  defineProviderAction(service, {
    name: "get_audiobook_chapters",
    operationType: "read",
    description: "Get Audiobook Chapters using the Spotify Web API.",
    requiredScopes: [],
    inputSchema: spotifyInputSchema("get_audiobook_chapters"),
    outputSchema: spotifyOutputSchema("get_audiobook_chapters"),
  }),
  defineProviderAction(service, {
    name: "get_chapter",
    operationType: "read",
    description: "Get Chapter using the Spotify Web API.",
    requiredScopes: [],
    inputSchema: spotifyInputSchema("get_chapter"),
    outputSchema: spotifyOutputSchema("get_chapter"),
  }),
  defineProviderAction(service, {
    name: "get_several_audiobooks",
    operationType: "read",
    description: "Get Several Audiobooks using the Spotify Web API.",
    requiredScopes: [],
    inputSchema: spotifyInputSchema("get_several_audiobooks"),
    outputSchema: spotifyOutputSchema("get_several_audiobooks"),
  }),
  defineProviderAction(service, {
    name: "get_several_chapters",
    operationType: "read",
    description: "Get Several Chapters using the Spotify Web API.",
    requiredScopes: [],
    inputSchema: spotifyInputSchema("get_several_chapters"),
    outputSchema: spotifyOutputSchema("get_several_chapters"),
  }),
  defineProviderAction(service, {
    name: "get_several_shows",
    operationType: "read",
    description: "Get Several Shows using the Spotify Web API.",
    requiredScopes: [],
    inputSchema: spotifyInputSchema("get_several_shows"),
    outputSchema: spotifyOutputSchema("get_several_shows"),
  }),
  defineProviderAction(service, {
    name: "get_featured_playlists",
    operationType: "read",
    description: "Get Featured Playlists using the Spotify Web API.",
    requiredScopes: [],
    inputSchema: spotifyInputSchema("get_featured_playlists"),
    outputSchema: spotifyOutputSchema("get_featured_playlists"),
  }),
  defineProviderAction(service, {
    name: "get_new_releases",
    operationType: "read",
    description: "Get New Releases using the Spotify Web API.",
    requiredScopes: [],
    inputSchema: spotifyInputSchema("get_new_releases"),
    outputSchema: spotifyOutputSchema("get_new_releases"),
  }),
  defineProviderAction(service, {
    name: "get_browse_categories",
    operationType: "read",
    description: "Get Browse Categories using the Spotify Web API.",
    requiredScopes: [],
    inputSchema: spotifyInputSchema("get_browse_categories"),
    outputSchema: spotifyOutputSchema("get_browse_categories"),
  }),
  defineProviderAction(service, {
    name: "get_browse_category",
    operationType: "read",
    description: "Get Browse Category using the Spotify Web API.",
    requiredScopes: [],
    inputSchema: spotifyInputSchema("get_browse_category"),
    outputSchema: spotifyOutputSchema("get_browse_category"),
  }),
  defineProviderAction(service, {
    name: "get_category_playlists",
    operationType: "read",
    description: "Get Category Playlists using the Spotify Web API.",
    requiredScopes: [],
    inputSchema: spotifyInputSchema("get_category_playlists"),
    outputSchema: spotifyOutputSchema("get_category_playlists"),
  }),
  defineProviderAction(service, {
    name: "get_user_profile",
    operationType: "read",
    description: "Get User Profile using the Spotify Web API.",
    requiredScopes: [],
    inputSchema: spotifyInputSchema("get_user_profile"),
    outputSchema: spotifyOutputSchema("get_user_profile"),
  }),
  defineProviderAction(service, {
    name: "get_current_user_playlists",
    operationType: "read",
    description: "Get Current User Playlists using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.playlistReadPrivate, spotifyProviderScopes.playlistReadCollaborative],
    inputSchema: spotifyInputSchema("get_current_user_playlists"),
    outputSchema: spotifyOutputSchema("get_current_user_playlists"),
  }),
  defineProviderAction(service, {
    name: "get_user_playlists",
    operationType: "read",
    description: "Get User Playlists using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.playlistReadPrivate, spotifyProviderScopes.playlistReadCollaborative],
    inputSchema: spotifyInputSchema("get_user_playlists"),
    outputSchema: spotifyOutputSchema("get_user_playlists"),
  }),
  defineProviderAction(service, {
    name: "save_albums_for_current_user",
    operationType: "write",
    description: "Save Albums For Current User using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.userLibraryModify],
    inputSchema: spotifyInputSchema("save_albums_for_current_user"),
    outputSchema: spotifyOutputSchema("save_albums_for_current_user"),
  }),
  defineProviderAction(service, {
    name: "remove_users_saved_albums",
    operationType: "destructive",
    description: "Remove Users Saved Albums using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.userLibraryModify],
    inputSchema: spotifyInputSchema("remove_users_saved_albums"),
    outputSchema: spotifyOutputSchema("remove_users_saved_albums"),
  }),
  defineProviderAction(service, {
    name: "save_audiobooks_for_current_user",
    operationType: "write",
    description: "Save Audiobooks For Current User using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.userLibraryModify],
    inputSchema: spotifyInputSchema("save_audiobooks_for_current_user"),
    outputSchema: spotifyOutputSchema("save_audiobooks_for_current_user"),
  }),
  defineProviderAction(service, {
    name: "remove_user_s_saved_audiobooks",
    operationType: "destructive",
    description: "Remove User S Saved Audiobooks using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.userLibraryModify],
    inputSchema: spotifyInputSchema("remove_user_s_saved_audiobooks"),
    outputSchema: spotifyOutputSchema("remove_user_s_saved_audiobooks"),
  }),
  defineProviderAction(service, {
    name: "save_episodes_for_current_user",
    operationType: "write",
    description: "Save Episodes For Current User using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.userLibraryModify],
    inputSchema: spotifyInputSchema("save_episodes_for_current_user"),
    outputSchema: spotifyOutputSchema("save_episodes_for_current_user"),
  }),
  defineProviderAction(service, {
    name: "remove_user_s_saved_episodes",
    operationType: "destructive",
    description: "Remove User S Saved Episodes using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.userLibraryModify],
    inputSchema: spotifyInputSchema("remove_user_s_saved_episodes"),
    outputSchema: spotifyOutputSchema("remove_user_s_saved_episodes"),
  }),
  defineProviderAction(service, {
    name: "save_shows_for_current_user",
    operationType: "write",
    description: "Save Shows For Current User using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.userLibraryModify],
    inputSchema: spotifyInputSchema("save_shows_for_current_user"),
    outputSchema: spotifyOutputSchema("save_shows_for_current_user"),
  }),
  defineProviderAction(service, {
    name: "remove_user_s_saved_shows",
    operationType: "destructive",
    description: "Remove User S Saved Shows using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.userLibraryModify],
    inputSchema: spotifyInputSchema("remove_user_s_saved_shows"),
    outputSchema: spotifyOutputSchema("remove_user_s_saved_shows"),
  }),
  defineProviderAction(service, {
    name: "save_tracks_for_current_user",
    operationType: "write",
    description: "Save Tracks For Current User using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.userLibraryModify],
    inputSchema: spotifyInputSchema("save_tracks_for_current_user"),
    outputSchema: spotifyOutputSchema("save_tracks_for_current_user"),
  }),
  defineProviderAction(service, {
    name: "remove_user_s_saved_tracks",
    operationType: "destructive",
    description: "Remove User S Saved Tracks using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.userLibraryModify],
    inputSchema: spotifyInputSchema("remove_user_s_saved_tracks"),
    outputSchema: spotifyOutputSchema("remove_user_s_saved_tracks"),
  }),
  defineProviderAction(service, {
    name: "get_user_saved_albums",
    operationType: "read",
    description: "Get User Saved Albums using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.userLibraryRead],
    inputSchema: spotifyInputSchema("get_user_saved_albums"),
    outputSchema: spotifyOutputSchema("get_user_saved_albums"),
  }),
  defineProviderAction(service, {
    name: "get_user_saved_audiobooks",
    operationType: "read",
    description: "Get User Saved Audiobooks using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.userLibraryRead],
    inputSchema: spotifyInputSchema("get_user_saved_audiobooks"),
    outputSchema: spotifyOutputSchema("get_user_saved_audiobooks"),
  }),
  defineProviderAction(service, {
    name: "get_user_saved_episodes",
    operationType: "read",
    description: "Get User Saved Episodes using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.userLibraryRead],
    inputSchema: spotifyInputSchema("get_user_saved_episodes"),
    outputSchema: spotifyOutputSchema("get_user_saved_episodes"),
  }),
  defineProviderAction(service, {
    name: "get_user_saved_shows",
    operationType: "read",
    description: "Get User Saved Shows using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.userLibraryRead],
    inputSchema: spotifyInputSchema("get_user_saved_shows"),
    outputSchema: spotifyOutputSchema("get_user_saved_shows"),
  }),
  defineProviderAction(service, {
    name: "get_user_saved_tracks",
    operationType: "read",
    description: "Get User Saved Tracks using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.userLibraryRead],
    inputSchema: spotifyInputSchema("get_user_saved_tracks"),
    outputSchema: spotifyOutputSchema("get_user_saved_tracks"),
  }),
  defineProviderAction(service, {
    name: "check_saved_albums",
    operationType: "read",
    description: "Check Saved Albums using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.userLibraryRead],
    inputSchema: spotifyInputSchema("check_saved_albums"),
    outputSchema: spotifyOutputSchema("check_saved_albums"),
  }),
  defineProviderAction(service, {
    name: "check_saved_audiobooks",
    operationType: "read",
    description: "Check Saved Audiobooks using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.userLibraryRead],
    inputSchema: spotifyInputSchema("check_saved_audiobooks"),
    outputSchema: spotifyOutputSchema("check_saved_audiobooks"),
  }),
  defineProviderAction(service, {
    name: "check_saved_episodes",
    operationType: "read",
    description: "Check Saved Episodes using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.userLibraryRead],
    inputSchema: spotifyInputSchema("check_saved_episodes"),
    outputSchema: spotifyOutputSchema("check_saved_episodes"),
  }),
  defineProviderAction(service, {
    name: "check_saved_shows",
    operationType: "read",
    description: "Check Saved Shows using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.userLibraryRead],
    inputSchema: spotifyInputSchema("check_saved_shows"),
    outputSchema: spotifyOutputSchema("check_saved_shows"),
  }),
  defineProviderAction(service, {
    name: "check_saved_tracks",
    operationType: "read",
    description: "Check Saved Tracks using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.userLibraryRead],
    inputSchema: spotifyInputSchema("check_saved_tracks"),
    outputSchema: spotifyOutputSchema("check_saved_tracks"),
  }),
  defineProviderAction(service, {
    name: "follow_artists_or_users",
    operationType: "write",
    description: "Follow Artists Or Users using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.userFollowModify],
    inputSchema: spotifyInputSchema("follow_artists_or_users"),
    outputSchema: spotifyOutputSchema("follow_artists_or_users"),
  }),
  defineProviderAction(service, {
    name: "unfollow_artists_or_users",
    operationType: "destructive",
    description: "Unfollow Artists Or Users using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.userFollowModify],
    inputSchema: spotifyInputSchema("unfollow_artists_or_users"),
    outputSchema: spotifyOutputSchema("unfollow_artists_or_users"),
  }),
  defineProviderAction(service, {
    name: "get_followed_artists",
    operationType: "read",
    description: "Get Followed Artists using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.userFollowRead],
    inputSchema: spotifyInputSchema("get_followed_artists"),
    outputSchema: spotifyOutputSchema("get_followed_artists"),
  }),
  defineProviderAction(service, {
    name: "check_user_follows_artists_or_users",
    operationType: "read",
    description: "Check User Follows Artists Or Users using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.userFollowRead],
    inputSchema: spotifyInputSchema("check_user_follows_artists_or_users"),
    outputSchema: spotifyOutputSchema("check_user_follows_artists_or_users"),
  }),
  defineProviderAction(service, {
    name: "check_users_follow_playlist",
    operationType: "read",
    description: "Check Users Follow Playlist using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.playlistReadPrivate, spotifyProviderScopes.playlistReadCollaborative],
    inputSchema: spotifyInputSchema("check_users_follow_playlist"),
    outputSchema: spotifyOutputSchema("check_users_follow_playlist"),
  }),
  defineProviderAction(service, {
    name: "get_available_devices",
    operationType: "read",
    description: "Get Available Devices using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.userReadPlaybackState, spotifyProviderScopes.userReadCurrentlyPlaying],
    inputSchema: spotifyInputSchema("get_available_devices"),
    outputSchema: spotifyOutputSchema("get_available_devices"),
  }),
  defineProviderAction(service, {
    name: "start_resume_playback",
    operationType: "write",
    description: "Start Resume Playback using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.userModifyPlaybackState],
    inputSchema: spotifyInputSchema("start_resume_playback"),
    outputSchema: spotifyOutputSchema("start_resume_playback"),
  }),
  defineProviderAction(service, {
    name: "pause_playback",
    operationType: "destructive",
    description: "Pause Playback using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.userModifyPlaybackState],
    inputSchema: spotifyInputSchema("pause_playback"),
    outputSchema: spotifyOutputSchema("pause_playback"),
  }),
  defineProviderAction(service, {
    name: "seek_to_position",
    operationType: "write",
    description: "Seek To Position using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.userModifyPlaybackState],
    inputSchema: spotifyInputSchema("seek_to_position"),
    outputSchema: spotifyOutputSchema("seek_to_position"),
  }),
  defineProviderAction(service, {
    name: "set_repeat_mode",
    operationType: "write",
    description: "Set Repeat Mode using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.userModifyPlaybackState],
    inputSchema: spotifyInputSchema("set_repeat_mode"),
    outputSchema: spotifyOutputSchema("set_repeat_mode"),
  }),
  defineProviderAction(service, {
    name: "set_playback_volume",
    operationType: "write",
    description: "Set Playback Volume using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.userModifyPlaybackState],
    inputSchema: spotifyInputSchema("set_playback_volume"),
    outputSchema: spotifyOutputSchema("set_playback_volume"),
  }),
  defineProviderAction(service, {
    name: "skip_to_next",
    operationType: "write",
    description: "Skip To Next using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.userModifyPlaybackState],
    inputSchema: spotifyInputSchema("skip_to_next"),
    outputSchema: spotifyOutputSchema("skip_to_next"),
  }),
  defineProviderAction(service, {
    name: "skip_to_previous",
    operationType: "write",
    description: "Skip To Previous using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.userModifyPlaybackState],
    inputSchema: spotifyInputSchema("skip_to_previous"),
    outputSchema: spotifyOutputSchema("skip_to_previous"),
  }),
  defineProviderAction(service, {
    name: "toggle_playback_shuffle",
    operationType: "write",
    description: "Toggle Playback Shuffle using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.userModifyPlaybackState],
    inputSchema: spotifyInputSchema("toggle_playback_shuffle"),
    outputSchema: spotifyOutputSchema("toggle_playback_shuffle"),
  }),
  defineProviderAction(service, {
    name: "transfer_playback",
    operationType: "write",
    description: "Transfer Playback using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.userModifyPlaybackState],
    inputSchema: spotifyInputSchema("transfer_playback"),
    outputSchema: spotifyOutputSchema("transfer_playback"),
  }),
  defineProviderAction(service, {
    name: "add_item_to_playback_queue",
    operationType: "write",
    description: "Add Item To Playback Queue using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.userModifyPlaybackState],
    inputSchema: spotifyInputSchema("add_item_to_playback_queue"),
    outputSchema: spotifyOutputSchema("add_item_to_playback_queue"),
  }),
  defineProviderAction(service, {
    name: "get_playback_state",
    operationType: "read",
    description: "Get Playback State using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.userReadPlaybackState, spotifyProviderScopes.userReadCurrentlyPlaying],
    inputSchema: spotifyInputSchema("get_playback_state"),
    outputSchema: spotifyOutputSchema("get_playback_state"),
  }),
  defineProviderAction(service, {
    name: "get_currently_playing_track",
    operationType: "read",
    description: "Get Currently Playing Track using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.userReadPlaybackState, spotifyProviderScopes.userReadCurrentlyPlaying],
    inputSchema: spotifyInputSchema("get_currently_playing_track"),
    outputSchema: spotifyOutputSchema("get_currently_playing_track"),
  }),
  defineProviderAction(service, {
    name: "get_recently_played_tracks",
    operationType: "read",
    description: "Get Recently Played Tracks using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.userReadRecentlyPlayed],
    inputSchema: spotifyInputSchema("get_recently_played_tracks"),
    outputSchema: spotifyOutputSchema("get_recently_played_tracks"),
  }),
  defineProviderAction(service, {
    name: "get_user_queue",
    operationType: "read",
    description: "Get User Queue using the Spotify Web API.",
    requiredScopes: [spotifyProviderScopes.userReadPlaybackState, spotifyProviderScopes.userReadCurrentlyPlaying],
    inputSchema: spotifyInputSchema("get_user_queue"),
    outputSchema: spotifyOutputSchema("get_user_queue"),
  }),
];

function spotifyInputSchema(actionName: SpotifyActionName): JsonSchema {
  const fields: Record<string, JsonSchema> = {
    query: s.nonEmptyString("Spotify search query."),
    types: s.stringArray("Spotify item types to search.", { minItems: 1, maxItems: 7 }),
    playlistId: s.nonEmptyString("Spotify playlist ID."),
    albumId: s.nonEmptyString("Spotify album ID."),
    artistId: s.nonEmptyString("Spotify artist ID."),
    trackId: s.nonEmptyString("Spotify track ID."),
    showId: s.nonEmptyString("Spotify show ID."),
    episodeId: s.nonEmptyString("Spotify episode ID."),
    audiobookId: s.nonEmptyString("Spotify audiobook ID."),
    chapterId: s.nonEmptyString("Spotify chapter ID."),
    categoryId: s.nonEmptyString("Spotify browse category ID."),
    userId: s.nonEmptyString("Spotify user ID."),
    albumIds: s.stringArray("Spotify album IDs.", { minItems: 1, maxItems: 20 }),
    artistIds: s.stringArray("Spotify artist IDs.", { minItems: 1, maxItems: 50 }),
    trackIds: s.stringArray("Spotify track IDs.", { minItems: 1, maxItems: 50 }),
    episodeIds: s.stringArray("Spotify episode IDs.", { minItems: 1, maxItems: 50 }),
    showIds: s.stringArray("Spotify show IDs.", { minItems: 1, maxItems: 50 }),
    audiobookIds: s.stringArray("Spotify audiobook IDs.", { minItems: 1, maxItems: 50 }),
    chapterIds: s.stringArray("Spotify chapter IDs.", { minItems: 1, maxItems: 50 }),
    ids: s.stringArray("Spotify artist or user IDs.", { minItems: 1, maxItems: 50 }),
    userIds: s.stringArray("Spotify user IDs.", { minItems: 1, maxItems: 50 }),
    uris: s.stringArray("Spotify URIs in the order Spotify should use.", { minItems: 1, maxItems: 100 }),
    items: s.array(
      "Playlist item removal targets.",
      s.looseObject(
        { uri: s.nonEmptyString("Spotify URI of the playlist item to remove.") },
        { description: "Playlist item removal target." },
      ),
      { minItems: 1 },
    ),
    name: s.nonEmptyString("Playlist name."),
    description: s.string("Playlist description."),
    public: s.boolean("Whether the playlist should be public."),
    collaborative: s.boolean("Whether the playlist should be collaborative."),
    market: s.string("An ISO 3166-1 alpha-2 country code or from_token to apply market filtering."),
    country: s.string("An ISO 3166-1 alpha-2 country code.", { minLength: 2, maxLength: 2 }),
    locale: s.string("Locale code such as en_US used by Spotify browse endpoints.", { minLength: 2 }),
    limit: s.integer("Maximum number of items to return.", { minimum: 1, maximum: 50 }),
    offset: s.integer("Zero-based index of the first item to return.", { minimum: 0 }),
    timeRange: s.stringEnum("Spotify top-items time range.", ["short_term", "medium_term", "long_term"]),
    includeGroups: s.stringArray("Album groups to include.", { minItems: 1 }),
    seedArtists: s.stringArray("Artist seeds used by Spotify recommendations.", { minItems: 1, maxItems: 5 }),
    seedTracks: s.stringArray("Track seeds used by Spotify recommendations.", { minItems: 1, maxItems: 5 }),
    seedGenres: s.stringArray("Genre seeds used by Spotify recommendations.", { minItems: 1, maxItems: 5 }),
    includeExternalAudio: s.boolean("Whether externally hosted audio should be included in search results."),
    position: s.integer("Zero-based playlist insert position.", { minimum: 0 }),
    rangeStart: s.integer("The position of the first item to reorder.", { minimum: 0 }),
    insertBefore: s.integer("The position where the reordered items should be inserted.", { minimum: 0 }),
    rangeLength: s.integer("The number of items to reorder.", { minimum: 1 }),
    snapshotId: s.string("Playlist snapshot ID."),
    type: s.stringEnum("Whether the follow target is an artist or user.", ["artist", "user"]),
    after: s.integer("Unix timestamp in milliseconds or cursor after which to return items.", { minimum: 0 }),
    before: s.integer("Unix timestamp in milliseconds before which to return items.", { minimum: 0 }),
    deviceId: s.string("Spotify Connect device ID."),
    state: s.string("Playback repeat or shuffle state."),
    volumePercent: s.integer("Volume percentage from 0 to 100.", { minimum: 0, maximum: 100 }),
    positionMs: s.integer("Playback position in milliseconds.", { minimum: 0 }),
    deviceIds: s.stringArray("Spotify Connect device IDs.", { minItems: 1, maxItems: 100 }),
    play: s.boolean("Whether playback should start after transfer."),
    uri: s.nonEmptyString("Spotify URI."),
    contextUri: s.string("Spotify context URI to play."),
    additionalTypes: s.stringArray("Additional item types for playback endpoints.", { minItems: 1 }),
    timestamp: s.string("ISO timestamp for featured playlist lookup."),
    timestampedTrackIds: s.array(
      "Timestamped track IDs for saved-track import.",
      s.looseObject(
        { trackId: s.nonEmptyString("Spotify track ID."), addedAt: s.dateTime("When the track was added.") },
        { description: "Timestamped track item." },
      ),
      { minItems: 1 },
    ),
  };
  const required = requiredFields(actionName);
  const optional = optionalFields(actionName);
  const properties = Object.fromEntries(
    Object.entries(fields).filter(([key]) => required.includes(key) || optional.includes(key)),
  );
  return s.object(properties, {
    required,
    optional,
    additionalProperties: true,
    description: "Input for Spotify action " + actionName + ".",
  });
}

function spotifyOutputSchema(actionName: SpotifyActionName): JsonSchema {
  if (
    [
      "change_playlist_details",
      "follow_playlist",
      "unfollow_playlist",
      "save_albums_for_current_user",
      "remove_users_saved_albums",
      "save_audiobooks_for_current_user",
      "remove_user_s_saved_audiobooks",
      "save_episodes_for_current_user",
      "remove_user_s_saved_episodes",
      "save_shows_for_current_user",
      "remove_user_s_saved_shows",
      "save_tracks_for_current_user",
      "remove_user_s_saved_tracks",
      "follow_artists_or_users",
      "unfollow_artists_or_users",
      "start_resume_playback",
      "pause_playback",
      "seek_to_position",
      "set_repeat_mode",
      "set_playback_volume",
      "skip_to_next",
      "skip_to_previous",
      "toggle_playback_shuffle",
      "transfer_playback",
      "add_item_to_playback_queue",
    ].includes(actionName)
  )
    return successOutput;
  if (["add_items_to_playlist", "update_playlist_items", "remove_playlist_items"].includes(actionName))
    return snapshotOutput;
  if (actionName.startsWith("check_"))
    return s.actionOutput(
      {
        results: s.array(
          "Boolean results returned by Spotify in the original order.",
          s.boolean("One boolean result."),
        ),
      },
      "Spotify boolean result list.",
    );
  return rawObject;
}

function requiredFields(actionName: SpotifyActionName): string[] {
  const requiredByAction: Partial<Record<SpotifyActionName, string[]>> = {
    search_items: ["query", "types"],
    get_playlist: ["playlistId"],
    get_playlist_items: ["playlistId"],
    get_playlist_cover_image: ["playlistId"],
    create_playlist: ["userId", "name"],
    change_playlist_details: ["playlistId"],
    add_items_to_playlist: ["playlistId", "uris"],
    update_playlist_items: ["playlistId"],
    remove_playlist_items: ["playlistId", "items"],
    follow_playlist: ["playlistId"],
    unfollow_playlist: ["playlistId"],
    check_users_follow_playlist: ["playlistId", "userIds"],
    get_album: ["albumId"],
    get_album_tracks: ["albumId"],
    get_artist: ["artistId"],
    get_artist_albums: ["artistId"],
    get_artist_related_artists: ["artistId"],
    get_artist_top_tracks: ["artistId", "market"],
    get_track: ["trackId"],
    get_track_audio_features: ["trackId"],
    get_track_audio_analysis: ["trackId"],
    get_several_tracks: ["trackIds"],
    get_several_artists: ["artistIds"],
    get_several_albums: ["albumIds"],
    get_several_track_audio_features: ["trackIds"],
    get_show: ["showId"],
    get_show_episodes: ["showId"],
    get_episode: ["episodeId"],
    get_several_episodes: ["episodeIds"],
    get_audiobook: ["audiobookId"],
    get_audiobook_chapters: ["audiobookId"],
    get_chapter: ["chapterId"],
    get_several_audiobooks: ["audiobookIds"],
    get_several_chapters: ["chapterIds"],
    get_several_shows: ["showIds"],
    get_browse_category: ["categoryId"],
    get_category_playlists: ["categoryId"],
    get_user_profile: ["userId"],
    get_user_playlists: ["userId"],
    save_albums_for_current_user: ["albumIds"],
    remove_users_saved_albums: ["albumIds"],
    save_audiobooks_for_current_user: ["audiobookIds"],
    remove_user_s_saved_audiobooks: ["audiobookIds"],
    save_episodes_for_current_user: ["episodeIds"],
    remove_user_s_saved_episodes: ["episodeIds"],
    save_shows_for_current_user: ["showIds"],
    remove_user_s_saved_shows: ["showIds"],
    save_tracks_for_current_user: ["trackIds"],
    remove_user_s_saved_tracks: ["trackIds"],
    check_saved_albums: ["albumIds"],
    check_saved_audiobooks: ["audiobookIds"],
    check_saved_episodes: ["episodeIds"],
    check_saved_shows: ["showIds"],
    check_saved_tracks: ["trackIds"],
    follow_artists_or_users: ["type", "ids"],
    unfollow_artists_or_users: ["type", "ids"],
    check_user_follows_artists_or_users: ["type", "ids"],
    seek_to_position: ["positionMs"],
    set_repeat_mode: ["state"],
    set_playback_volume: ["volumePercent"],
    transfer_playback: ["deviceIds"],
    add_item_to_playback_queue: ["uri"],
  };
  return requiredByAction[actionName] ?? [];
}

function optionalFields(actionName: SpotifyActionName): string[] {
  const common = [
    "market",
    "country",
    "locale",
    "limit",
    "offset",
    "timeRange",
    "includeGroups",
    "seedArtists",
    "seedTracks",
    "seedGenres",
    "includeExternalAudio",
    "position",
    "rangeStart",
    "insertBefore",
    "rangeLength",
    "snapshotId",
    "after",
    "before",
    "deviceId",
    "state",
    "volumePercent",
    "positionMs",
    "play",
    "contextUri",
    "uris",
    "additionalTypes",
    "timestamp",
    "timestampedTrackIds",
    "description",
    "public",
    "collaborative",
  ];
  if (
    actionName.includes("playlist") ||
    actionName.includes("album") ||
    actionName.includes("track") ||
    actionName.includes("show") ||
    actionName.includes("episode") ||
    actionName.includes("audiobook") ||
    actionName.includes("chapter") ||
    actionName.includes("playback") ||
    actionName.includes("queue") ||
    actionName.includes("devices") ||
    actionName.includes("repeat") ||
    actionName.includes("volume") ||
    actionName.includes("shuffle") ||
    actionName.includes("transfer") ||
    actionName.includes("seek")
  )
    return common;
  if (
    actionName.startsWith("get_user_top") ||
    actionName.includes("browse") ||
    actionName.includes("featured") ||
    actionName.includes("new_releases")
  )
    return ["country", "locale", "timestamp", "limit", "offset", "timeRange"];
  return ["market", "limit", "offset"];
}
