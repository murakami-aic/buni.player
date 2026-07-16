import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLibraryStore } from "../stores/libraryStore";

function DownloadListItem({ trackId }: { trackId: number }) {
  const { t } = useTranslation();
  const downloads = useLibraryStore((state) => state.downloads);
  const track = useLibraryStore((state) =>
    state.tracks.find((t) => t.id === trackId),
  );
  const downloadTrack = useLibraryStore((state) => state.downloadTrack);

  const d = downloads.get(trackId);
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    if (!d || d.status !== "downloading") return;
    setPercent(0);
    const id = setInterval(() => {
      setPercent((p) => {
        const increment =
          p < 60 ? 3 + Math.random() * 8 : 0.15 + Math.random() * 0.5;
        const next = Math.min(p + increment, 95);
        return next;
      });
    }, 500);
    return () => clearInterval(id);
  }, [d?.status]);

  if (!d) return null;

  return (
    <div className="rounded-md bg-accent/50 p-2">
      <p className="truncate text-xs font-medium text-foreground">
        {track?.title ?? d.trackId}
      </p>
      <p className="truncate text-[10px] text-neutral mb-1">
        {track?.artist ?? t("downloads.unknown_track")}
      </p>
      {d.status === "downloading" ? (
        <div>
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded-full bg-neutral/30 overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.min(percent, 100)}%` }}
              />
            </div>
            <span className="text-[10px] text-neutral tabular-nums w-8 text-right">
              {Math.round(percent)}%
            </span>
          </div>

        </div>
      ) : d.status === "error" ? (
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-red-400 truncate max-w-[60%]">
            {d.error ?? t("downloads.unknown_error")}
          </span>
          <button
            type="button"
            onClick={() => downloadTrack(d.trackId)}
            className="rounded px-2 py-0.5 text-[10px] text-foreground bg-accent hover:bg-accent-list cursor-pointer transition"
          >
            {t("downloads.retry")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function DownloadList() {
  const { t } = useTranslation();
  const downloads = useLibraryStore((state) => state.downloads);

  const items = Array.from(downloads.values()).sort((a, b) => {
    if (a.status === "error" && b.status !== "error") return 1;
    if (b.status === "error" && a.status !== "error") return -1;
    return b.percent - a.percent;
  });

  if (items.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-neutral">{t("downloads.no_active")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 px-4 py-2">
      {items.map((d) => (
        <DownloadListItem key={d.trackId} trackId={d.trackId} />
      ))}
    </div>
  );
}
