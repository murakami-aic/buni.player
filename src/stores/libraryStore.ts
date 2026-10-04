import { create } from "zustand";
import type { Track, TrackMode } from "../types/track";
import type { DownloadProgress } from "../types/download";
import type { SearchResult } from "../types/search";
import {
  invokeAddTrack,
  invokeDeleteTrack,
  invokeDeleteLocalFile,
  invokeDownloadTrack,
  invokeGetTracks,
  invokeGetSetting,
  invokeSetSetting,
  invokeCancelAddTrack,
  invokeCancelDownload,
} from "../services/tauri";
import { useToastStore } from "./toastStore";
import { errorMessage } from "../utils/error";

export type FilterMode = "all" | TrackMode;
export type SortBy = "created_at" | "last_played" | "artist" | "album";
export type SortOrder = "asc" | "desc";

interface LibraryState {
  tracks: Track[];
  loading: boolean;
  error: string | null;
  filterMode: FilterMode;
  searchQuery: string;
  sortBy: SortBy;
  sortOrder: SortOrder;
  downloads: Map<number, DownloadProgress>;
  adding: boolean;
  addProgress: { current: number; total: number } | null;
  searchResults: SearchResult[];
  searchResultsLoading: boolean;

  fetchTracks: () => Promise<void>;
  addTrack: (url: string) => Promise<void>;
  downloadTrack: (id: number) => Promise<void>;
  cancelDownload: (id: number) => Promise<void>;
  deleteTrack: (id: number) => Promise<void>;
  deleteLocalFile: (id: number) => Promise<void>;
  setFilter: (mode: FilterMode) => void;
  setSearch: (query: string) => void;
  setSort: (by: SortBy, order: SortOrder) => void;
  setDownloadProgress: (progress: DownloadProgress) => void;
  applyDownloadComplete: (trackId: number, filePath: string) => void;
  applyDownloadError: (trackId: number, error: string) => void;
  applyDownloadCancelled: (trackId: number) => void;
  applyTrackRemoved: (trackId: number) => void;
  applyTrackUpdated: (updated: Track) => void;
  applyTrackPlayed: (trackId: number) => void;
  markAsStreaming: (trackId: number) => void;
  loadLibraryUI: () => Promise<void>;
  cancelAddTrack: () => void;
  setAddProgress: (progress: { current: number; total: number } | null) => void;
  setSearchResults: (results: SearchResult[]) => void;
  clearSearchResults: () => void;
  setSearchResultsLoading: (loading: boolean) => void;
}

export const useLibraryStore = create<LibraryState>((set) => ({
  tracks: [],
  loading: false,
  error: null,
  filterMode: "all",
  searchQuery: "",
  sortBy: "created_at",
  sortOrder: "desc",
  downloads: new Map(),
  adding: false,
  addProgress: null,
  searchResults: [],
  searchResultsLoading: false,

  fetchTracks: async () => {
    set({ loading: true, error: null });
    try {
      const tracks = await invokeGetTracks();
      set({ tracks, loading: false });
    } catch (err) {
      set({
        error: errorMessage(err, "Unknown error"),
        loading: false,
      });
    }
  },

  addTrack: async (url: string) => {
    set({ adding: true, addProgress: null });
    const tempId = -Date.now();
    const now = Date.now();
    const pendingTrack: Track = {
      id: tempId,
      title: "Procesando...",
      artist: null,
      album: null,
      albumArtist: null,
      duration: null,
      genreTags: null,
      thumbnail: null,
      sourceUrl: url,
      sourceSite: "unknown",
      streamUrl: null,
      streamUrlTs: null,
      filePath: null,
      mode: "streaming",
      playCount: 0,
      lastPlayed: null,
      lastfmUrl: null,
      lastfmId: null,
      musicbrainzId: null,
      hasVideo: false,
      createdAt: now,
      updatedAt: now,
      pending: true,
    };
    set((state) => ({ tracks: [pendingTrack, ...state.tracks] }));
    try {
      const tracks = await invokeAddTrack(url);
      set((state) => ({
        tracks: [...tracks, ...state.tracks.filter((t) => t.id !== tempId)],
        adding: false,
        addProgress: null,
      }));
    } catch (err) {
      const msg = errorMessage(err, "Unknown error");
      set((state) => ({
        tracks: state.tracks.filter((t) => t.id !== tempId),
        adding: false,
        addProgress: null,
        error: msg,
      }));
      if (msg !== "cancelled") {
        useToastStore.getState().addToast("error", msg);
      }
    }
  },

  downloadTrack: async (id: number) => {
    set((state) => {
      const downloads = new Map(state.downloads);
      downloads.set(id, {
        trackId: id,
        percent: 0,
        speed: "",
        eta: "",
        status: "downloading",
      });
      return { downloads };
    });
    try {
      await invokeDownloadTrack(id);
      // state update handled by track:download-complete / track:download-error events
    } catch (err) {
      const msg = errorMessage(err, "Unknown error");
      set((state) => {
        const downloads = new Map(state.downloads);
        downloads.set(id, {
          trackId: id,
          percent: 0,
          speed: "",
          eta: "",
          status: "error",
          error: msg,
        });
        return { downloads };
      });
      useToastStore.getState().addToast("error", msg);
    }
  },

  cancelDownload: async (id: number) => {
    try {
      await invokeCancelDownload(id);
    } catch (err) {
      const msg = errorMessage(err, "Unknown error");
      useToastStore.getState().addToast("error", msg);
    }
  },

  deleteTrack: async (id: number) => {
    try {
      await invokeDeleteTrack(id);
      // state update handled by track:deleted event
    } catch (err) {
      const msg = errorMessage(err, "Unknown error");
      set({ error: msg });
      useToastStore.getState().addToast("error", msg);
    }
  },

  deleteLocalFile: async (id: number) => {
    try {
      await invokeDeleteLocalFile(id);
      // state update handled by library:updated event
    } catch (err) {
      const msg = errorMessage(err, "Unknown error");
      set({ error: msg });
      useToastStore.getState().addToast("error", msg);
    }
  },

  setFilter: (mode) => set({ filterMode: mode }),
  setSearch: (query) => set({ searchQuery: query }),
  setSort: (by, order) => set({ sortBy: by, sortOrder: order }),

  setDownloadProgress: (progress: DownloadProgress) => {
    set((state) => {
      const downloads = new Map(state.downloads);
      downloads.set(progress.trackId, progress);
      return { downloads };
    });
  },

  applyDownloadComplete: (trackId: number, filePath: string) => {
    set((state) => {
      const downloads = new Map(state.downloads);
      downloads.delete(trackId);
      return {
        tracks: state.tracks.map((t) =>
          t.id === trackId ? { ...t, mode: "local", filePath } : t,
        ),
        downloads,
      };
    });
  },

  applyDownloadError: (trackId: number, error: string) => {
    set((state) => {
      const downloads = new Map(state.downloads);
      downloads.set(trackId, {
        trackId,
        percent: 0,
        speed: "",
        eta: "",
        status: "error",
        error,
      });
      return { downloads };
    });
  },

  applyDownloadCancelled: (trackId: number) => {
    set((state) => {
      const downloads = new Map(state.downloads);
      downloads.delete(trackId);
      return { downloads };
    });
  },

  applyTrackRemoved: (trackId: number) => {
    set((state) => ({
      tracks: state.tracks.filter((t) => t.id !== trackId),
    }));
  },

  applyTrackUpdated: (updated: Track) => {
    set((state) => ({
      tracks: state.tracks.map((t) =>
        t.id === updated.id ? { ...updated, pending: t.pending } : t,
      ),
    }));
  },

  applyTrackPlayed: (trackId: number) => {
    set((state) => ({
      tracks: state.tracks.map((t) =>
        t.id === trackId
          ? { ...t, playCount: t.playCount + 1, lastPlayed: Math.floor(Date.now() / 1000) }
          : t,
      ),
    }));
  },

  markAsStreaming: (trackId: number) => {
    set((state) => ({
      tracks: state.tracks.map((t) =>
        t.id === trackId
          ? { ...t, mode: "streaming", filePath: null }
          : t,
      ),
    }));
  },

  loadLibraryUI: async () => {
    try {
      const raw = await invokeGetSetting("library_ui_state");
      if (!raw) return;
      const snapshot: LibraryUISnapshot = JSON.parse(raw);
      set({
        filterMode: snapshot.filterMode ?? "all",
        sortBy: snapshot.sortBy ?? "created_at",
        sortOrder: snapshot.sortOrder ?? "desc",
      });
    } catch {
      // non-critical
    }
  },

  cancelAddTrack: () => {
    invokeCancelAddTrack().catch(() => {});
  },

  setAddProgress: (progress) => set({ addProgress: progress }),

  setSearchResults: (results) => set({ searchResults: results }),

  clearSearchResults: () => set({ searchResults: [], searchResultsLoading: false }),

  setSearchResultsLoading: (loading) => set({ searchResultsLoading: loading }),
}));

interface LibraryUISnapshot {
  filterMode: FilterMode;
  sortBy: SortBy;
  sortOrder: SortOrder;
}

async function persistLibraryUI(state: LibraryState) {
  const snapshot: LibraryUISnapshot = {
    filterMode: state.filterMode,
    sortBy: state.sortBy,
    sortOrder: state.sortOrder,
  };
  try {
    await invokeSetSetting("library_ui_state", JSON.stringify(snapshot));
  } catch {
    // non-critical
  }
}

useLibraryStore.subscribe((state, prevState) => {
  if (
    state.filterMode !== prevState.filterMode ||
    state.sortBy !== prevState.sortBy ||
    state.sortOrder !== prevState.sortOrder
  ) {
    persistLibraryUI(state);
  }
});
