import { useState, useRef, useEffect, memo } from "react";
import { useTranslation } from "react-i18next";
import { Pause, Play, X } from "lucide-react";
import { usePlayerStore } from "../stores/playerStore";
import { formatDuration, getThumbnailUrl } from "../utils/format";
import type { Track } from "../types/track";

export function QueuePanel() {
  const { t } = useTranslation();
  const queue = usePlayerStore((state) => state.queue);
  const queueIndex = usePlayerStore((state) => state.queueIndex);
  const clearQueue = usePlayerStore((state) => state.clearQueue);
  const removeFromQueue = usePlayerStore((state) => state.removeFromQueue);
  const moveInQueue = usePlayerStore((state) => state.moveInQueue);
  const playIndex = usePlayerStore((state) => state.playIndex);
  const pause = usePlayerStore((state) => state.pause);
  const resume = usePlayerStore((state) => state.resume);
  const isPlaying = usePlayerStore((state) => state.isPlaying);

  const visibleQueue = queue.slice(queueIndex);

  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const dragYRef = useRef(0);
  const scrollRafRef = useRef<number | null>(null);

  useEffect(() => {
    const parent = rootRef.current?.parentElement ?? null;
    if (parent) {
      const style = getComputedStyle(parent);
      if (/auto|scroll/.test(style.overflowY)) {
        scrollContainerRef.current = parent;
      }
    }
    return () => {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
      }
    };
  }, []);

  const stopAutoScroll = () => {
    if (scrollRafRef.current !== null) {
      cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = null;
    }
  };

  const autoScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) {
      scrollRafRef.current = null;
      return;
    }
    const rect = container.getBoundingClientRect();
    const threshold = 40;
    const speed = 8;
    const y = dragYRef.current;

    if (y < rect.top + threshold && container.scrollTop > 0) {
      container.scrollTop -= speed;
      scrollRafRef.current = requestAnimationFrame(autoScroll);
    } else if (
      y > rect.bottom - threshold &&
      container.scrollTop < container.scrollHeight - container.clientHeight
    ) {
      container.scrollTop += speed;
      scrollRafRef.current = requestAnimationFrame(autoScroll);
    } else {
      scrollRafRef.current = null;
    }
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.dataTransfer.setData("text/plain", String(index));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
    dragYRef.current = e.clientY;
    if (scrollRafRef.current === null) {
      scrollRafRef.current = requestAnimationFrame(autoScroll);
    }
  };

  const handleDragEnd = () => {
    stopAutoScroll();
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, toIndex: number) => {
    e.preventDefault();
    stopAutoScroll();
    const fromIndex = Number(e.dataTransfer.getData("text/plain"));
    if (!isNaN(fromIndex) && fromIndex !== toIndex) {
      moveInQueue(fromIndex, toIndex);
    }
    setDragOverIndex(null);
  };

  return (
    <div ref={rootRef} className="flex h-full flex-col text-neutral">
      {queue.length > 0 && (
        <div className="flex justify-between px-4 py-1">
          {queueIndex > 0 && (
            <p className="text-[10px]  self-center">
              {t("queue.previous_count", { count: queueIndex })}
            </p>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={clearQueue}
            className="rounded px-2 py-1 text-xs  hover:text-red-400 transition cursor-pointer"
          >
            {t("queue.clear_all")}
          </button>
        </div>
      )}

      {visibleQueue.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm ">{t("queue.empty")}</p>
        </div>
      ) : (
        <div
          className="flex-1 my-1"
          onDragLeave={(e) => {
            const related = e.relatedTarget as Node | null;
            if (related === null) return;
            if (!e.currentTarget.contains(related)) {
              stopAutoScroll();
              setDragOverIndex(null);
            }
          }}
          onDragEnd={handleDragEnd}
        >
          {visibleQueue.map((track, i) => (
            <div key={`${track.id}-${i}`}>
              <QueueRow
                track={track}
                index={i}
                isCurrent={i === 0}
                isDropTarget={dragOverIndex === i}
                isPlaying={isPlaying}
                onPlay={() => playIndex(queueIndex + i)}
                onResume={resume}
                onPause={pause}
                onRemove={() => removeFromQueue(queueIndex + i)}
                onDragStart={(e) => handleDragStart(e, queueIndex + i)}
                onDragOver={(e) => handleDragOver(e, i)}
                onDrop={(e) => handleDrop(e, i)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface QueueRowProps {
  track: Track;
  index: number;
  isCurrent: boolean;
  isDropTarget: boolean;
  isPlaying: boolean;
  onPlay: () => void;
  onResume: () => void;
  onPause: () => void;
  onRemove: () => void;
  onDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
}

const QueueRow = memo(function QueueRow({
  track,
  isCurrent,
  isDropTarget,
  isPlaying,
  onPlay,
  onResume,
  onPause,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
}: QueueRowProps) {
  const { t } = useTranslation();
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`group grid mx-2 px-2 py-2 gap-3 rounded-md grid-cols-[auto_1fr_auto_auto] items-center cursor-pointer transition-all border-t-2 ${isDropTarget ? "rounded-none" : ""}  ${isCurrent ? "bg-accent-list" : "hover:bg-accent-list"}`}
      style={{ borderTopColor: isDropTarget ? "hsl(var(--accent))" : "transparent" }}
    >

      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded bg-neutral text-xs font-medium -foreground">
        {track.thumbnail ? (
          <img
            src={getThumbnailUrl(track.thumbnail) ?? undefined}
            alt={track.title}
            className="h-full w-full rounded object-cover"
            draggable={false}
          />
        ) : (
          track.title.slice(0, 1).toUpperCase()
        )}
        <button onClick={isCurrent ? (isPlaying ? onPause : onResume) : onPlay} className={`opacity-0 absolute cursor-pointer w-full h-full group-hover:opacity-100 -foreground inline-flex items-center justify-center ${isCurrent ? "opacity-100" : ""}`}>
          {isCurrent && isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
        </button>

      </div>

      <div className="min-w-0 text-accent-foreground">
        <p className="truncate text-sm font-medium">{track.title}</p>
        <p className="truncate text-xs ">
          {track.artist ?? t("track.unknown_artist")}
        </p>
      </div>

      <span className="text-xs  tabular-nums w-10 text-right">
        {track.duration != null ? formatDuration(track.duration) : "--:--"}
      </span>

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="rounded p-1 text-xs  hover:text-red-400 transition cursor-pointer grid place-items-center"
        title={t("queue.remove")}
      >
        <X size={14} />
      </button>
    </div>
  );
});
