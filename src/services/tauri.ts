import { invoke } from "@tauri-apps/api/core";
import type { Track } from "../types/track";
import type { Playlist } from "../types/playlist";
import type { LastfmSearchResult } from "../types/lastfm";

import type { SearchResult } from "../types/search";

export async function invokeAddTrack(sourceUrl: string): Promise<Track[]> {
  return invoke<Track[]>("add_track", { sourceUrl });
}

export async function invokeCancelAddTrack(): Promise<void> {
  return invoke("cancel_add_track");
}

export async function invokeCancelDownload(trackId: number): Promise<void> {
  return invoke("cancel_download", { trackId });
}

export async function invokeGetTracks(
  filterMode?: "all" | "streaming" | "local",
  searchQuery?: string,
  sortBy?: "created_at" | "last_played" | "artist" | "album",
  sortOrder?: "asc" | "desc",
): Promise<Track[]> {
  return invoke<Track[]>("get_tracks", { filterMode, searchQuery, sortBy, sortOrder });
}

export async function invokeDeleteTrack(trackId: number): Promise<void> {
  return invoke("delete_track", { trackId });
}

export async function invokeDeleteLocalFile(trackId: number): Promise<void> {
  return invoke("delete_local_file", { trackId });
}

export async function invokeDownloadTrack(trackId: number): Promise<void> {
  return invoke("download_track", { trackId });
}

export async function invokeGetStreamUrl(trackId: number): Promise<string> {
  return invoke<string>("get_stream_url", { trackId });
}

export async function invokeInvalidateStreamUrl(trackId: number): Promise<void> {
  return invoke("invalidate_stream_url", { trackId });
}

export async function invokeTrackStarted(trackId: number): Promise<void> {
  return invoke("track_started", { trackId });
}

export async function invokeGetSetting(key: string): Promise<string> {
  return invoke<string>("get_setting", { key });
}

export async function invokeSetSetting(key: string, value: string): Promise<void> {
  return invoke("set_setting", { key, value });
}

export async function invokeSetLanguage(lang: string): Promise<void> {
  return invoke("set_language", { lang });
}

export async function invokeGetPlatform(): Promise<string> {
  return invoke<string>("get_platform");
}

export async function invokeGetPlaylists(): Promise<Playlist[]> {
  return invoke<Playlist[]>("get_playlists");
}

export async function invokeCreatePlaylist(name: string, image?: string): Promise<Playlist> {
  return invoke<Playlist>("create_playlist", { name, image: image ?? null });
}

export async function invokeUpdatePlaylist(playlistId: number, name?: string, image?: string): Promise<Playlist> {
  return invoke<Playlist>("update_playlist", { playlistId, name: name ?? null, image: image ?? null });
}

export async function invokeDeletePlaylist(playlistId: number): Promise<void> {
  return invoke("delete_playlist", { playlistId });
}

export async function invokeAddToPlaylist(playlistId: number, trackId: number): Promise<void> {
  return invoke("add_to_playlist", { playlistId, trackId });
}

export async function invokeRemoveFromPlaylist(playlistId: number, trackId: number): Promise<void> {
  return invoke("remove_from_playlist", { playlistId, trackId });
}

export async function invokeGetPlaylistTracks(playlistId: number): Promise<Track[]> {
  return invoke<Track[]>("get_playlist_tracks", { playlistId });
}

export async function invokeLastfmEnrichTrack(trackId: number): Promise<Track> {
  return invoke<Track>("lastfm_enrich_track", { trackId });
}

export async function invokeLastfmSearchTrack(title: string, artist?: string): Promise<LastfmSearchResult> {
  return invoke<LastfmSearchResult>("lastfm_search_track", { title, artist: artist ?? null });
}

export async function invokeUpdateTrack(
  trackId: number,
  title: string,
  artist?: string,
  album?: string,
  duration?: number,
): Promise<Track> {
  return invoke<Track>("update_track", {
    trackId,
    title,
    artist: artist ?? null,
    album: album ?? null,
    duration: duration ?? null,
  });
}

export async function invokeGetDefaultDownloadFolder(): Promise<string> {
  return invoke<string>("get_default_download_folder");
}

export async function invokeSearch(query: string, limit?: number): Promise<SearchResult[]> {
  return invoke<SearchResult[]>("search_youtube", { query, limit: limit ?? null });
}
