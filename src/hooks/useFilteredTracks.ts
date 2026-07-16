import { useMemo, useDeferredValue } from "react";
import { useLibraryStore } from "../stores/libraryStore";
import { usePlaylistStore, GLOBAL_PLAYLIST_ID } from "../stores/playlistStore";

export function useFilteredTracks() {
  const allTracks = useLibraryStore((state) => state.tracks);
  const currentPlaylistId = usePlaylistStore((state) => state.currentPlaylistId);
  const playlistTracks = usePlaylistStore((state) => state.playlistTracks);
  const searchQuery = useLibraryStore((state) => state.searchQuery);
  const deferredQuery = useDeferredValue(searchQuery);
  const isPending = searchQuery !== deferredQuery;
  const sortBy = useLibraryStore((state) => state.sortBy);
  const sortOrder = useLibraryStore((state) => state.sortOrder);
  const filterMode = useLibraryStore((state) => state.filterMode);

  const tracks = currentPlaylistId === GLOBAL_PLAYLIST_ID ? allTracks : playlistTracks;

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    let result = q
      ? tracks.filter(
          (t) =>
            t.title.toLowerCase().includes(q) ||
            t.artist?.toLowerCase().includes(q) ||
            t.album?.toLowerCase().includes(q),
        )
      : [...tracks];

    if (filterMode !== "all") {
      result = result.filter((t) => t.mode === filterMode);
    }

    const dir = sortOrder === "asc" ? 1 : -1;
    result.sort((a, b) => {
      switch (sortBy) {
        case "created_at":
          return (a.createdAt - b.createdAt) * dir;
        case "last_played":
          return ((a.lastPlayed ?? 0) - (b.lastPlayed ?? 0)) * dir;
        case "artist":
          return (a.artist ?? "").localeCompare(b.artist ?? "") * dir;
        case "album":
          return (a.album ?? "").localeCompare(b.album ?? "") * dir;
        default:
          return 0;
      }
    });

    return result;
  }, [tracks, deferredQuery, sortBy, sortOrder, filterMode]);

  return { filtered, isPending };
}
