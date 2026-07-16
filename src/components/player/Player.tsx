import { useRef, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { List, Pause, Play, Repeat, Repeat1, SkipBack, SkipForward, Volume1, Volume2, VolumeX } from "lucide-react";
import { usePlayerStore } from "../../stores/playerStore";
import { usePlaylistStore, GLOBAL_PLAYLIST_ID } from "../../stores/playlistStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useAudio } from "../../hooks/useAudio";
import { formatTime, getThumbnailUrl } from "../../utils/format";

export function Player() {
  const { t } = useTranslation();
  const audioRef = useAudio();

  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const currentTime = usePlayerStore((state) => state.currentTime);
  const duration = usePlayerStore((state) => state.duration);
  const volume = usePlayerStore((state) => state.volume);
  const pause = usePlayerStore((state) => state.pause);
  const resume = usePlayerStore((state) => state.resume);
  const seek = usePlayerStore((state) => state.seek);
  const setVolume = usePlayerStore((state) => state.setVolume);
  const next = usePlayerStore((state) => state.next);
  const previous = usePlayerStore((state) => state.previous);
  const repeatMode = usePlayerStore((state) => state.repeatMode);
  const toggleRepeat = usePlayerStore((state) => state.toggleRepeat);
  const queuePlaylistId = usePlayerStore((state) => state.queuePlaylistId);
  const playlists = usePlaylistStore((state) => state.playlists);
  const queuePlaylistName = queuePlaylistId === GLOBAL_PLAYLIST_ID
    ? t("player.library")
    : playlists.find(p => p.id === queuePlaylistId)?.name ?? t("player.library");

  const panelView = useSettingsStore((state) => state.panelView);
  const setPanelView = useSettingsStore((state) => state.setPanelView);

  const updateSetting = useSettingsStore((state) => state.updateSetting);

  const prevVolumeRef = useRef(volume);

  const updateVolume = (v: number) => {
    setVolume(v);
    updateSetting("volume", v);
  };

  const handleMuteToggle = () => {
    if (volume > 0) {
      prevVolumeRef.current = volume;
      updateVolume(0);
    } else {
      updateVolume(prevVolumeRef.current || 0.8);
    }
  };

  const handlePlayPause = () => {
    if (!currentTrack) return;
    if (isPlaying) pause();
    else resume();
  };

  const handlePrevious = () => {
    if (currentTime > 4) {
      if (audioRef.current) audioRef.current.currentTime = 0;
      seek(0);
    } else {
      previous();
    }
  };

  const handleNext = () => {
    if (audioRef.current) audioRef.current.currentTime = 0;
    next()
  }

  const VolumeIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const RepeatIcon = repeatMode === "one" ? Repeat1 : Repeat;
  const isRepeatOff = repeatMode === "none";
  const repeatTitle = repeatMode === "one" ? t("player.repeat_one") : repeatMode === "all" ? t("player.repeat_all") : t("player.no_repeat");
  const maxTime = duration || 0;
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const volumePercent = volume * 100;

  return (
    <footer className="text-neutral grid h-(--player-h) shrink-0 grid-cols-[1fr_1fr_1fr] items-center gap-3 px-4 layout-component mx-2 mb-2 cursor-default">

      <div className="flex gap-2 items-center justify-self-start">

        <img
          src={getThumbnailUrl(currentTrack?.thumbnail) ?? undefined}
          alt={currentTrack?.title ?? ""}
          onClick={() => setPanelView("details")}
          className="h-[calc(var(--player-h)-1rem)] aspect-square shrink-0 rounded-md bg-neutral object-cover cursor-pointer hover:opacity-80 transition"
        />
        <div className=" min-w-0 w-36 shrink-0">
          <p className="truncate font-medium text-muted">
            {currentTrack?.title ?? t("player.no_track")}
          </p>
          <p className="truncate text-md">
            {currentTrack?.artist ?? "—"}
          </p>
          <p className="truncate text-xs">
            {currentTrack ? queuePlaylistName : ""}
          </p>
        </div>

      </div>

      <div className="flex flex-col-reverse items-center justify-center">
        <div className="flex items-center gap-1 shrink-0 justify-self-end">
          <button
            type="button"
            onClick={handlePrevious}
            className="p-1.5 cursor-pointer hover:scale-110"
            aria-label={t("player.previous")}
          >
            <SkipBack size={22} />
          </button>
          <button
            type="button"
            onClick={handlePlayPause}
            className="p-1.5 cursor-pointer hover:scale-110"
            aria-label={isPlaying ? t("player.pause") : t("player.play")}
          >
            {isPlaying ? <Pause size={22} /> : <Play size={22} />}
          </button>
          <button
            type="button"
            onClick={handleNext}
            className="p-1.5 cursor-pointer hover:scale-110"
            aria-label={t("player.next")}
          >
            <SkipForward size={22} />
          </button>
        </div>

        <div className="flex w-full max-w-120 items-center gap-1">
          <span className="w-9 text-right text-xs font-medium tabular-nums">
            {formatTime(currentTime)}
          </span>
          <input
            type="range"
            min={0}
            max={maxTime}
            step={1}
            value={currentTime}
            onChange={(e) => {
              const time = Number(e.currentTarget.value);
              if (audioRef.current) audioRef.current.currentTime = time;
              seek(time);
            }}
            className="progress-slider min-w-0 flex-1 cursor-pointer"
            style={{ "--progress": `${progressPercent}%` } as CSSProperties}
            aria-label={t("player.progress")}
          />
          <span className="w-9 text-xs font-medium tabular-nums ">
            {formatTime(duration)}
          </span>
        </div>

      </div>

      <div className="flex justify-end items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={() => setPanelView("queue")}
          className={`p-1 cursor-pointer hover:scale-110 ${panelView === 'queue' ? 'text-muted' : ''}`}
          title={panelView === "queue" ? t("player.close_queue") : t("player.open_queue")}
        >
          <List size={16} />
        </button>
        <button
          type="button"
          onClick={toggleRepeat}
          className={`p-1 cursor-pointer hover:scale-110`}
          title={repeatTitle}
        >
          <RepeatIcon size={16} className={isRepeatOff ? "opacity-40" : undefined} />
        </button>
        <button
          type="button"
          onClick={handleMuteToggle}
          className="p-1 cursor-pointer hover:scale-110"
          aria-label={volume === 0 ? t("player.unmute") : t("player.mute")}
        >
          <VolumeIcon size={16} />
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => updateVolume(Number(e.currentTarget.value))}
          className="progress-slider w-25 cursor-pointer"
          style={{ "--progress": `${volumePercent}%`, "--track-height": "4px" } as CSSProperties}
          aria-label={t("player.volume")}
        />
      </div>
    </footer>
  );
}
