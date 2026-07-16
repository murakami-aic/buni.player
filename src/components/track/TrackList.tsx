import { useCallback, useMemo, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Pause, Play, Download, Shuffle, Clock, X, Search, Heart } from "lucide-react";
import { useLibraryStore } from "../../stores/libraryStore";
import { usePlayerStore } from "../../stores/playerStore";
import { usePlaylistStore, GLOBAL_PLAYLIST_ID } from "../../stores/playlistStore";
import { useFilteredTracks } from "../../hooks/useFilteredTracks";
import type { SortBy, SortOrder } from "../../stores/libraryStore";
import { useSticky } from "../../hooks/useSticky";
import { Dropdown } from "../ui/Dropdown";
import { PlaylistMosaic } from "../playlist/PlaylistMosaic";
import { TrackRow } from "./TrackRow";

export function TrackList() {
  const { t } = useTranslation();

  const sortOptions = useMemo(() => [
    { label: t("tracklist.most_recent"), value: "created_at_desc" },
    { label: t("tracklist.oldest"), value: "created_at_asc" },
    { label: t("tracklist.most_played"), value: "last_played_desc" },
    { label: t("tracklist.artist_az"), value: "artist_asc" },
    { label: t("tracklist.artist_za"), value: "artist_desc" },
    { label: t("tracklist.album_az"), value: "album_asc" },
  ], [t]);

  const parsedSortOptions = useMemo(() => sortOptions.map(opt => {
    const index = opt.value.lastIndexOf("_")
    return { label: opt.label, by: opt.value.slice(0, index) as SortBy, order: opt.value.slice(index + 1) as SortOrder }
  }), [sortOptions]);

  const currentPlaylistId = usePlaylistStore((state) => state.currentPlaylistId);
  const playlists = usePlaylistStore((state) => state.playlists);
  const deletePlaylist = usePlaylistStore((state) => state.deletePlaylist);
  const updatePlaylist = usePlaylistStore((state) => state.updatePlaylist);

  const { filtered, isPending } = useFilteredTracks();

  const searchQuery = useLibraryStore((state) => state.searchQuery);
  const setSearch = useLibraryStore((state) => state.setSearch);
  const sortBy = useLibraryStore((state) => state.sortBy);
  const sortOrder = useLibraryStore((state) => state.sortOrder);
  const setSort = useLibraryStore((state) => state.setSort);
  const filterMode = useLibraryStore((state) => state.filterMode);
  const setFilter = useLibraryStore((state) => state.setFilter);
  const downloadTrack = useLibraryStore((state) => state.downloadTrack);
  const shuffle = usePlayerStore((state) => state.shuffle);
  const toggleShuffle = usePlayerStore((state) => state.toggleShuffle);

  const handleShuffleToggle = () => {
    if (!shuffle) {
      toggleShuffle();
      usePlayerStore.getState().shuffleQueue();
    } else {
      toggleShuffle();
      if (isViewingPlaying) {
        const idx = filtered.findIndex(t => t.id === currentTrack?.id);
        if (idx >= 0) setQueue(filtered, idx);
      } else {
        usePlayerStore.getState().unshuffleQueue();
      }
    }
  };

  const setQueue = usePlayerStore((state) => state.setQueue);
  const setQueuePlaylistId = usePlayerStore((state) => state.setQueuePlaylistId);
  const queuePlaylistId = usePlayerStore((state) => state.queuePlaylistId);
  const queue = usePlayerStore((state) => state.queue);

  const [sentinelRef, isStuck] = useSticky();

  const isViewingPlaying = currentPlaylistId === queuePlaylistId;

  const [editingName, setEditingName] = useState(false);
  const [editValue, setEditValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const openSearch = () => {
    setSearchOpen(true);
    setTimeout(() => searchInputRef.current?.focus(), 0);
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setSearch("");
  };

  const clearSearch = () => {
    setSearch("");
    searchInputRef.current?.focus();
  };

  const handleSearchBlur = () => {
    if (!searchQuery) setSearchOpen(false);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.currentTarget.blur();
      closeSearch();
    }
  };

  const handleStartEditName = (currentName: string) => {
    setEditValue(currentName);
    setEditingName(true);
    setTimeout(() => editInputRef.current?.focus(), 0);
  };

  const handleSaveName = () => {
    if (editValue.trim() && currentPlaylistId !== GLOBAL_PLAYLIST_ID) {
      updatePlaylist(currentPlaylistId, editValue.trim());
    }
    setEditingName(false);
  };

  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const pause = usePlayerStore((state) => state.pause);
  const resume = usePlayerStore((state) => state.resume);
  const currentTrack = usePlayerStore((state) => state.currentTrack)

  const sortValue = `${sortBy}_${sortOrder}`;

  const filterLabel = filterMode === "all" ? t("tracklist.all")
    : filterMode === "streaming" ? t("tracklist.streaming") : t("tracklist.local");
  const sortLabel = sortOptions.find((o) => o.value === sortValue)?.label ?? t("tracklist.most_recent");
  const triggerText = `${filterLabel} · ${sortLabel}`;

  const streamingTracks = useMemo(
    () => filtered.filter((t) => t.mode === "streaming" && !t.pending),
    [filtered],
  );

  const handleDownloadAllStreaming = useCallback(async () => {
    for (const t of streamingTracks) {
      await downloadTrack(t.id);
    }
  }, [streamingTracks, downloadTrack]);

  return (
    <section className="@container text-neutral flex flex-1 flex-col pt-0 min-w-90 layout-component scroll-area cursor-default overflow-x-hidden overflow-y-auto ">

      <div className="flex flex-col gap-4 px-4 py-4">
        <div className="flex gap-2">

          {currentPlaylistId === GLOBAL_PLAYLIST_ID ? (
            <>
              <div className="flex h-35 aspect-square items-center justify-center rounded bg-accent/60">
                <Heart className="text-muted w-full h-full aspect-square" fill="currentColor" />
              </div>
              <div className="flex flex-col">
                <p className="text-sm">{t("tracklist.playlist")}</p>
                <h1 className="text-5xl font-bold">{t("tracklist.library")}</h1>
                <p className="text-sm">{t("tracklist.tracks_count", { count: filtered.length ?? 0 })}</p>
              </div>
            </>
          ) : (
            <>
              {(() => {
                const pl = playlists.find(p => p.id === currentPlaylistId);
                return (
                  <>
                    <div className="flex h-35 aspect-square">
                      <PlaylistMosaic />
                    </div>
                    <div className="flex w-full justify-between">
                      <div className="flex flex-col">
                        <p className="text-sm">{t("tracklist.playlist")}</p>
                        {editingName ? (
                          <input ref={editInputRef}
                            value={editValue}
                            onChange={(e) => setEditValue(e.currentTarget.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") handleSaveName(); if (e.key === "Escape") setEditingName(false); }}
                            onBlur={handleSaveName}
                            className="text-5xl font-bold bg-transparent border-b border-primary outline-none w-full"
                            autoFocus
                          />
                        ) : (
                          <h1 className="text-5xl font-bold cursor-pointer hover:opacity-70 transition"
                            onClick={() => handleStartEditName(pl?.name ?? "")}>
                            {pl?.name ?? ""}
                          </h1>
                        )}
                        <p className="text-sm">{t("tracklist.tracks_count", { count: pl?.trackCount ?? 0 })}</p>
                      </div>
                    </div>
                  </>
                );
              })()}
            </>
          )}

        </div>

        <div className="flex justify-between gap-2">
          <div className="flex justify-between items-center gap-1">

            <button className={`cursor-pointer hover:scale-105 grid place-items-center`}
              onClick={() => {
                if (!isViewingPlaying) {
                  setQueue(filtered);
                  setQueuePlaylistId(currentPlaylistId);
                } else if (queue.length === 0) {
                  setQueue(filtered);
                  setQueuePlaylistId(currentPlaylistId);
                } else if (isPlaying) pause();
                else resume()
              }}
            >
              {isPlaying ? (isViewingPlaying ? <Pause size={30} fill="currentColor" /> : <Play size={30} fill="currentColor" />) : <Play size={30} fill="currentColor" />}
            </button>


            <button
              type="button"
              onClick={handleShuffleToggle}
              className={`rounded px-2 py-1 text-xs font-medium transition hover:scale-105 cursor-pointer ${shuffle ? 'text-muted' : ''}`}
            >
              <Shuffle size={30} />
            </button>
            <button
              type="button"
              onClick={handleDownloadAllStreaming}
              disabled={streamingTracks.length === 0}
              title={streamingTracks.length.toString()}
              className="gap-1 transition cursor-pointer hover:scale-105 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Download size={30} />
            </button>
            {currentPlaylistId === GLOBAL_PLAYLIST_ID ? ("") : (
              <Dropdown
                align="right"
                trigger={
                  <div typeof="button" className="cursor-pointer grid place-items-center h-6 w-6">
                    <ChevronDown size={16} />
                  </div>
                }
                items={[
                  {
                    label: t("tracklist.delete"),
                    icon: <X size={14} />,
                    onClick: () => deletePlaylist(currentPlaylistId),
                  },
                ]}
              />
            )}
          </div>
          <div className="gap-1 flex items-center">
            <button
              type="button"
              onClick={searchOpen ? () => searchInputRef.current?.focus() : openSearch}
              className="grid place-items-center h-6 w-6 rounded cursor-pointer transition hover:bg-accent-list shrink-0"
              title={t("tracklist.search")}
            >
              <Search size={16} />
            </button>

            <div className={`flex items-center gap-1 transition-all ${searchOpen ? "w-40 opacity-100" : "w-0 opacity-0"}`}>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearch(e.currentTarget.value)}
                onBlur={handleSearchBlur}
                onKeyDown={handleSearchKeyDown}
                placeholder={t("tracklist.search_placeholder")}
                className="rounded-md flex-1 text-sm p-1 min-w-0 text-accent-foreground placeholder:text-accent-foreground  focus:outline-none focus:ring-1 focus:ring-accent-foreground"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="grid place-items-center h-5 w-5 rounded cursor-pointer transition hover:bg-accent-list shrink-0"
                  title={t("tracklist.clear")}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <Dropdown
              align="right"
              trigger={
                <span className="flex items-center gap-1 py-1 truncate text-sm font-medium cursor-pointer">
                  {triggerText}
                  <ChevronDown size={14} />
                </span>
              }
              items={[
                {
                  label: t("tracklist.filter"),
                  icon: <ChevronDown size={14} />,
                  submenu: [
                    {
                      label: t("tracklist.all"),
                      active: filterMode === "all",
                      onClick: () => setFilter("all"),
                    },
                    {
                      label: t("tracklist.streaming"),
                      active: filterMode === "streaming",
                      onClick: () => setFilter("streaming"),
                    },
                    {
                      label: t("tracklist.local"),
                      active: filterMode === "local",
                      onClick: () => setFilter("local"),
                    },
                  ],
                },
                { separator: true, label: "" },
                ...parsedSortOptions.map((opt) => ({
                  label: opt.label,
                  active: sortBy === opt.by && sortOrder === opt.order,
                  onClick: () => setSort(opt.by, opt.order)
                }))
              ]}
            />
          </div>
        </div>
      </div>

      <div ref={sentinelRef} style={{ height: 1 }}></div>

      <div className={`ml-2 pr-2 py-2 sticky top-0 z-10 ${isStuck ? 'glass-sticky rounded-md' : 'bg-transparent'} grid grid-cols-[auto_2fr_2fr_auto_auto_auto]  @[600px]:grid-cols-[auto_2fr_2fr_2fr_auto_auto_auto] @[900px]:grid-cols-[auto_1fr_1fr_1fr_auto_auto_auto_auto] items-center`}>
        <h2 className="text-xs font-medium w-6 text-center">#</h2>
        <h2 className="col-span-2 text-xs font-medium">{t("tracklist.title")}</h2>
        <h2 className="hidden @[600px]:block text-xs font-medium">{t("tracklist.album")}</h2>
        <h2 className="hidden @[900px]:block text-xs w-20 font-medium">{t("tracklist.scrobbles")}</h2>
        <h2 className="w-8"></h2>
        <h2 className="text-xs font-medium text-center w-10 truncate"> <Clock size={16} /> </h2>
        <h2 className="w-6"></h2>
      </div>

      <div className="flex mx-4 border-b border-accent">
      </div>

      <div className={`flex-1 my-3 ${isPending ? 'opacity-50' : ''}`}>
        {filtered.map((track, index) => (
          <TrackRow
            key={track.id}
            track={track}
            index={index}
            isCurrent={track.id === currentTrack?.id}
            isPlaying={isPlaying && track.id === currentTrack?.id}
          />
        ))}
      </div>

    </section>
  );
}
