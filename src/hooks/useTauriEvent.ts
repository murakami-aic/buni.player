import { useEffect } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { DownloadProgress } from "../types/download";
import { useLibraryStore } from "../stores/libraryStore";
import { usePlaylistStore } from "../stores/playlistStore";
import { useToastStore } from "../stores/toastStore";

export function useTauriEvent() {
  const addTrack = useLibraryStore((state) => state.addTrack);
  const fetchTracks = useLibraryStore((state) => state.fetchTracks);
  const setDownloadProgress = useLibraryStore((state) => state.setDownloadProgress);
  const applyDownloadComplete = useLibraryStore((state) => state.applyDownloadComplete);
  const applyDownloadError = useLibraryStore((state) => state.applyDownloadError);
  const applyTrackRemoved = useLibraryStore((state) => state.applyTrackRemoved);
  const applyTrackPlayed = useLibraryStore((state) => state.applyTrackPlayed);

  useEffect(() => {
    let mounted = true;
    const unlisteners: UnlistenFn[] = [];

    function safeListen<T>(event: string, cb: (payload: T) => void) {
      listen<T>(event, (e) => {
        if (mounted) cb(e.payload);
      }).then((fn) => {
        if (mounted) unlisteners.push(fn);
        else fn();
      });
    }

    safeListen<string>("deep-link:add", (url) => {
      if (url) addTrack(url);
    });

    safeListen<{ total: number }>("track:add-start", ({ total }) => {
      useLibraryStore.getState().setAddProgress({ current: 0, total });
    });

    safeListen<{ current: number; total: number }>("track:add-progress", (payload) => {
      useLibraryStore.getState().setAddProgress({ current: payload.current, total: payload.total });
    });

    safeListen<DownloadProgress>("track:download-progress", (payload) => {
      setDownloadProgress(payload);
    });

    safeListen<{ trackId: number; filePath: string }>("track:download-complete", (payload) => {
      applyDownloadComplete(payload.trackId, payload.filePath);
      usePlaylistStore.getState().updateTrackLocally(payload.trackId, { mode: "local", filePath: payload.filePath });
      usePlaylistStore.getState().fetchPlaylists();
    });

    safeListen<{ trackId: number; error: string }>("track:download-error", (payload) => {
      applyDownloadError(payload.trackId, payload.error);
    });

    safeListen<{ trackId: number }>("track:deleted", (payload) => {
      applyTrackRemoved(payload.trackId);
      usePlaylistStore.getState().removeTrackLocally(payload.trackId);
      usePlaylistStore.getState().fetchPlaylists();
    });

    safeListen<{ trackId: number }>("track:played", (payload) => {
      applyTrackPlayed(payload.trackId);
      const track = useLibraryStore.getState().tracks.find((t) => t.id === payload.trackId);
      if (track) {
        usePlaylistStore.getState().updateTrackLocally(payload.trackId, {
          playCount: track.playCount,
          lastPlayed: track.lastPlayed,
        });
      }
    });

    safeListen("library:updated", () => {
      fetchTracks();
      usePlaylistStore.getState().fetchPlaylists();
    });

    safeListen<{ trackId: number; streamUrl: string }>("track:stream-resolved", () => {
      // stream URL is cached per-track in useAudio via invoke; no UI update needed
    });

    safeListen<{ trackId: number; error: string }>("track:enrich-error", (payload) => {
      useToastStore.getState().addToast("error", payload.error);
    });

    return () => {
      mounted = false;
      unlisteners.forEach((fn) => fn());
    };
  }, [addTrack, fetchTracks, setDownloadProgress, applyDownloadComplete, applyDownloadError, applyTrackRemoved, applyTrackPlayed]);
}
