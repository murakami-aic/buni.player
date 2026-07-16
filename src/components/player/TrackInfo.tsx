import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, ExternalLink, RefreshCw, Loader2 } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { usePlayerStore } from "../../stores/playerStore";
import { useLibraryStore } from "../../stores/libraryStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { formatTime, getThumbnailUrl } from "../../utils/format";
import { invokeLastfmEnrichTrack } from "../../services/tauri";

export function TrackInfo() {
  const { t } = useTranslation();
  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const setCurrentTrack = usePlayerStore((state) => state.setCurrentTrack);
  const artistInfo = usePlayerStore((state) => state.artistInfo);
  const lastfmEnabled = useSettingsStore((state) => state.lastfmEnabled);
  const libraryTrack = useLibraryStore((state) =>
    currentTrack ? state.tracks.find((t) => t.id === currentTrack.id) : null,
  );
  const displayTrack = libraryTrack ?? currentTrack;
  const [enriching, setEnriching] = useState(false);
  const [bioExpanded, setBioExpanded] = useState(false);

  const handleRefreshMetadata = async () => {
    if (!currentTrack) return;
    setEnriching(true);
    try {
      const enriched = await invokeLastfmEnrichTrack(currentTrack.id);
      setCurrentTrack(enriched);
    } catch (err) {
      console.error("Failed to enrich track:", err);
    } finally {
      setEnriching(false);
    }
  };

  if (!currentTrack) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-neutral">{t("trackinfo.no_track")}</p>
      </div>
    );
  }

  const bioTruncated = !bioExpanded && artistInfo?.bio && artistInfo.bio.length > 150;

  return (
    <div className="flex flex-col gap-4 px-4 pt-2">
      <div className="flex justify-center">
        <img
          src={getThumbnailUrl(currentTrack.thumbnail) ?? undefined}
          alt={currentTrack.title}
          className="w-55 h-55 rounded-md bg-neutral object-cover"
        />
      </div>

      <div className="flex content-center justify-between">
        <div>
          <h3 className="text-xl font-semibold text-foreground">{currentTrack.title}</h3>
        </div>
        {lastfmEnabled && (
          <div className="flex content-center text-neutral">
            <button
              type="button"
              onClick={handleRefreshMetadata}
              disabled={enriching}
              className="flex items-center gap-1 text-xs text-neutral cursor-pointer hover:text-foreground transition disabled:opacity-50"
            >
              {enriching ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <RefreshCw size={15} />
              )}
            </button>
          </div>
        )}
      </div>

      <div className="space-y-1 text-sm layout-component p-2">
        {currentTrack.album && (
          <div className="flex justify-between gap-x-2">
            <span className="text-neutral font-medium">{t("trackinfo.album")}</span>
            <span className="text-foreground truncate">{currentTrack.album}</span>
          </div>
        )}

        {currentTrack.artist && (
          <div className="flex justify-between gap-x-2">
            <span className="text-neutral font-medium">{t("trackinfo.artist")}</span>
            <span className="text-foreground truncate">{currentTrack.artist}</span>
          </div>
        )}

        <div className="flex justify-between gap-x-2">
          <span className="text-neutral font-medium">{t("trackinfo.my_scrobbles")}</span>
          <span className="text-foreground">{displayTrack!.playCount.toLocaleString()}</span>
        </div>

        {currentTrack.duration && (
          <div className="flex justify-between gap-x-2">
            <span className="text-neutral font-medium">{t("trackinfo.duration")}</span>
            <span className="text-foreground truncate">{formatTime(currentTrack.duration)}</span>
          </div>
        )}


      </div>

      <div className="layout-component flex flex-col items-center p-2 gap-2">

        {artistInfo && (
          <div className="space-y-2">
            {artistInfo.bio && (
              <div>
                <p className="text-xs text-neutral leading-relaxed">
                  {bioTruncated ? `${artistInfo.bio.slice(0, 150)}...` : artistInfo.bio}
                </p>
                {(bioTruncated || bioExpanded) && (
                  <button
                    type="button"
                    onClick={() => setBioExpanded(!bioExpanded)}
                    className="inline-flex items-center gap-1 text-xs text-neutral hover:text-foreground mt-1 cursor-pointer transition"
                  >
                    {bioExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    {bioExpanded ? t("trackinfo.show_less") : t("trackinfo.read_more")}
                  </button>
                )}
              </div>
            )}

            {artistInfo.tags.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-1">
                {artistInfo.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-1.5 py-0.5 text-[10px] rounded bg-accent-list text-neutral"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {artistInfo.similar.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-[10px] text-neutral">{t("trackinfo.similar")}</span>
                {artistInfo.similar.map((a) => (
                  <button
                    key={a.name}
                    type="button"
                    onClick={() => openUrl(a.url)}
                    className="inline-flex items-center gap-0.5 text-[10px] text-neutral hover:text-foreground cursor-pointer transition"
                  >
                    {a.name}
                    <ExternalLink size={10} />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
