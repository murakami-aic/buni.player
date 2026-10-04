import { useState, memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ChevronRight, Download, HardDrive, MoreHorizontal, Pause, Pencil, Play, Plus, X, Cloud } from "lucide-react";
import type { Track } from "../../types/track";
import { useLibraryStore } from "../../stores/libraryStore";
import { usePlayerStore } from "../../stores/playerStore";
import { usePlaylistStore, GLOBAL_PLAYLIST_ID } from "../../stores/playlistStore";
import { useFilteredTracks } from "../../hooks/useFilteredTracks";
import { formatDuration, getThumbnailUrl } from "../../utils/format";
import { Dropdown } from "../ui/Dropdown";
import type { DropdownItem } from "../ui/Dropdown";

export interface TrackRowProps {
  track: Track;
  index: number;
  isCurrent: boolean;
  isPlaying: boolean;
  onEdit?: (track: Track) => void;
}

export const TrackRow = memo(function TrackRow({ track, index, isCurrent, isPlaying, onEdit }: TrackRowProps) {
  const { t } = useTranslation();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const { filtered } = useFilteredTracks();

  const downloadTrack = useLibraryStore((state) => state.downloadTrack);
  const deleteTrack = useLibraryStore((state) => state.deleteTrack);
  const deleteLocalFile = useLibraryStore((state) => state.deleteLocalFile);
  const addToQueue = usePlayerStore((state) => state.addToQueue);
  const download = useLibraryStore((state) => state.downloads.get(track.id));
  const playlists = usePlaylistStore((state) => state.playlists);
  const addToPlaylist = usePlaylistStore((state) => state.addToPlaylist);
  const removeFromPlaylist = usePlaylistStore((state) => state.removeFromPlaylist);

  const currentPlaylistId = usePlaylistStore((state) => state.currentPlaylistId);
  const queuePlaylistId = usePlayerStore((state) => state.queuePlaylistId);
  const setQueuePlaylistId = usePlayerStore((state) => state.setQueuePlaylistId);
  const isViewingPlaying = currentPlaylistId === queuePlaylistId;
  const setQueue = usePlayerStore((state) => state.setQueue);
  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const pause = usePlayerStore((state) => state.pause);
  const resume = usePlayerStore((state) => state.resume);

  const handlePlay = useCallback(() => {
    if (track.id === currentTrack?.id && isViewingPlaying) {
      if (isPlaying) pause();
      else resume();
    } else {
      setQueue(filtered, index);
      setQueuePlaylistId(currentPlaylistId);
    }
  }, [track, index, filtered, setQueue, setQueuePlaylistId, currentPlaylistId, currentTrack, isPlaying, pause, resume, isViewingPlaying]);

  const menuItems: DropdownItem[] = [];
  if (!track.pending) {
    menuItems.push({
      label: t("track.edit_info"),
      icon: <Pencil size={14} />,
      onClick: () => onEdit?.(track),
    });
  }
  if (track.mode === "streaming" && !track.pending) {
    menuItems.push({
      label: t("track.download"),
      icon: <Download size={14} />,
      onClick: () => downloadTrack(track.id),
    });
  }
  if (!track.pending) {
    menuItems.push({
      label: t("track.add_to_queue"),
      icon: <Plus size={14} />,
      onClick: () => addToQueue(track),
    });
  }
  if (!track.pending && playlists.length > 0) {
    const targetPlaylists = playlists.filter(p => p.id !== currentPlaylistId);
    if (targetPlaylists.length > 0) {
      menuItems.push({
        label: t("track.add_to_playlist"),
        icon: <ChevronRight size={14} />,
        submenu: targetPlaylists.map((p) => ({
          label: p.name,
          onClick: () => addToPlaylist(p.id, track.id),
        })),
      });
    }
  }
  if (!track.pending && currentPlaylistId !== GLOBAL_PLAYLIST_ID) {
    menuItems.push({
      label: t("track.remove_from_playlist"),
      icon: <X size={14} />,
      onClick: () => removeFromPlaylist(currentPlaylistId, track.id),
    });
  }
  if (track.mode === "local") {
    menuItems.push({
      label: t("track.delete_local"),
      icon: <X size={14} />,
      onClick: () => deleteLocalFile(track.id),
    });
  }
  if (!track.pending) {
    menuItems.push({
      label: t("track.delete"),
      icon: <X size={14} />,
      danger: true,
      onClick: () => deleteTrack(track.id),
    });
  }

  return (
    <div
      className={`text-neutral py-2 mx-2 group grid rounded-md grid-cols-[auto_2fr_2fr_auto_auto_auto] @[600px]:grid-cols-[auto_2fr_2fr_2fr_auto_auto_auto] @[900px]:grid-cols-[auto_1fr_1fr_1fr_auto_auto_auto_auto] transition hover:bg-accent-list ${dropdownOpen ? "bg-accent-list" : ""}`}>
      <span className="flex text-sm  font-medium tabular-nums w-8 items-center justify-center">
        {index + 1}
      </span>

      <div className="flex gap-x-1.5 col-span-2 items-center">
        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded bg-neutral text-xs font-medium -foreground">
          {track.pending ? (
            <div className="h-full w-full animate-pulse" />
          ) : track.thumbnail ? (
            <img
              src={getThumbnailUrl(track.thumbnail) ?? undefined}
              alt={track.title}
              className="h-full w-full rounded object-cover"
            />
          ) : (
            track.title.slice(0, 1).toUpperCase()
          )}
          {!track.pending && (
            <button
              onClick={handlePlay}
              className={`opacity-0 absolute cursor-pointer w-full h-full group-hover:opacity-100 -foreground inline-flex items-center justify-center ${isCurrent && isViewingPlaying ? "opacity-100" : ""}`}>
              {!isCurrent ? <Play size={20} fill="currentColor" /> : (isViewingPlaying ? (isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />) : <Play size={20} fill="currentColor" />)}
            </button>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className={`truncate text-sm font-medium ${isCurrent ? 'text-muted' : ''} ${track.pending ? "animate-pulse" : ""}`}>
            {track.title}
          </p>
          <p className="truncate text-xs">{track.artist ?? t("track.unknown_artist")}</p>
        </div>
      </div>

      <div className="hidden @[600px]:flex min-w-0 items-center">
        <p className="truncate text-sm ">
          {track.album ?? t("track.unknown_album")}
        </p>
      </div>

      <div className="hidden @[900px]:flex min-w-0 w-20 items-center">
        <p className="truncate text-sm ">
          {track.playCount.toLocaleString()}
        </p>
      </div>

      <div className="min-w-0 w-8 text-xs flex items-center justify-center">
        {track.pending ? (
          <span className=" animate-pulse">...</span>
        ) : track.mode === "local" ? (
          <HardDrive size={14} className="text-green-300" aria-label={t("tracklist.local")} />
        ) : download && download.status === "error" ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); downloadTrack(track.id); }}
            className="text-red-400 hover:text-red-300 transition cursor-pointer"
            title={download.error ?? t("track.error")}
          >
            <AlertTriangle size={14} />
          </button>
        ) : download ? (
          <span className=" animate-pulse" title={t("track.downloading")}>...</span>
        ) : (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); downloadTrack(track.id); }}
            className=" transition cursor-pointer"
            title={t("track.download")}
          >
            <Cloud size={14} />
          </button>
        )}
      </div>

      <div className="min-w-0 flex items-center">
        <p className="text-sm  w-10 truncate text-center">
          {track.pending ? "—" : track.duration != null ? formatDuration(track.duration) : "--:--"}
        </p>
      </div>

      <div className={`opacity-0 group-hover:opacity-100 min-w-0 w-6 text-xs flex items-center justify-center ${dropdownOpen ? "opacity-100!" : ""}`}>
        <Dropdown
          align="right"
          onOpenChange={setDropdownOpen}
          trigger={<MoreHorizontal size={14} className="cursor-pointer" />}
          items={menuItems}
        />
      </div>
    </div>
  );
});
