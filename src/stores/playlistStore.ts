import { create } from "zustand";
import type { Track } from "../types/track";
import type { Playlist } from "../types/playlist";
import {
  invokeGetPlaylists,
  invokeCreatePlaylist,
  invokeDeletePlaylist,
  invokeUpdatePlaylist,
  invokeAddToPlaylist,
  invokeRemoveFromPlaylist,
  invokeGetPlaylistTracks,
} from "../services/tauri";
import { useToastStore } from "./toastStore";
import { errorMessage } from "../utils/error";

export const GLOBAL_PLAYLIST_ID = 0;

interface PlaylistState {
  playlists: Playlist[];
  currentPlaylistId: number;
  previousPlaylistId: number;
  playlistTracks: Track[];
  loading: boolean;

  fetchPlaylists: () => Promise<void>;
  selectPlaylist: (id: number) => Promise<void>;
  createPlaylist: (name: string) => Promise<void>;
  deletePlaylist: (id: number) => Promise<void>;
  updatePlaylist: (id: number, name?: string, image?: string) => Promise<void>;
  addToPlaylist: (playlistId: number, trackId: number) => Promise<void>;
  removeFromPlaylist: (playlistId: number, trackId: number) => Promise<void>;
  removeTrackLocally: (trackId: number) => void;
  updateTrackLocally: (trackId: number, patch: Partial<Track>) => void;
}

export const usePlaylistStore = create<PlaylistState>((set) => ({
  playlists: [],
  currentPlaylistId: GLOBAL_PLAYLIST_ID,
  previousPlaylistId: GLOBAL_PLAYLIST_ID,
  playlistTracks: [],
  loading: false,

  fetchPlaylists: async () => {
    set({ loading: true });
    try {
      const playlists = await invokeGetPlaylists();
      set({ playlists, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  selectPlaylist: async (id) => {
    set((state) => ({
      previousPlaylistId: state.currentPlaylistId,
      currentPlaylistId: id,
      playlistTracks: [],
    }));
    if (id !== GLOBAL_PLAYLIST_ID) {
      try {
        const tracks = await invokeGetPlaylistTracks(id);
        set({ playlistTracks: tracks });
      } catch {
        // keep empty on error
      }
    }
  },

  createPlaylist: async (name) => {
    try {
      const playlist = await invokeCreatePlaylist(name);
      set((state) => ({
        playlists: [...state.playlists, playlist],
        currentPlaylistId: playlist.id,
        playlistTracks: [],
      }));
    } catch (err) {
      const msg = errorMessage(err, "Error al crear playlist.");
      useToastStore.getState().addToast("error", msg);
    }
  },

  deletePlaylist: async (id) => {
    try {
      await invokeDeletePlaylist(id);
      set((state) => ({
        playlists: state.playlists.filter((p) => p.id !== id),
        currentPlaylistId:
          state.currentPlaylistId === id ? GLOBAL_PLAYLIST_ID : state.currentPlaylistId,
        playlistTracks:
          state.currentPlaylistId === id ? [] : state.playlistTracks,
      }));
    } catch (err) {
      const msg = errorMessage(err, "Error al borrar playlist.");
      useToastStore.getState().addToast("error", msg);
    }
  },

  updatePlaylist: async (id, name, image) => {
    try {
      const updated = await invokeUpdatePlaylist(id, name, image);
      set((state) => ({
        playlists: state.playlists.map((p) => (p.id === id ? updated : p)),
      }));
    } catch (err) {
      const msg = errorMessage(err, "Error al actualizar playlist.");
      useToastStore.getState().addToast("error", msg);
    }
  },

  addToPlaylist: async (playlistId, trackId) => {
    try {
      await invokeAddToPlaylist(playlistId, trackId);
      await usePlaylistStore.getState().fetchPlaylists();
      useToastStore.getState().addToast("success", "Anadido a la playlist")

    } catch (err) {
      const msg = errorMessage(err, "Error al añadir track.");
      useToastStore.getState().addToast("error", msg);
    }
  },

  removeFromPlaylist: async (playlistId, trackId) => {
    try {
      await invokeRemoveFromPlaylist(playlistId, trackId);
      set((state) => {
        if (state.currentPlaylistId === playlistId) {
          return {
            playlistTracks: state.playlistTracks.filter((t) => t.id !== trackId),
          };
        }
        return state;
      });
      await usePlaylistStore.getState().fetchPlaylists();
    } catch (err) {
      const msg = errorMessage(err, "Error al quitar track.");
      useToastStore.getState().addToast("error", msg);
    }
  },

  removeTrackLocally: (trackId) => {
    set((state) => ({
      playlistTracks: state.playlistTracks.filter((t) => t.id !== trackId),
    }));
  },

  updateTrackLocally: (trackId, patch) => {
    set((state) => ({
      playlistTracks: state.playlistTracks.map((t) =>
        t.id === trackId ? { ...t, ...patch } : t,
      ),
    }));
  },
}));
