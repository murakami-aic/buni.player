import { useTranslation } from "react-i18next";
import type { PanelView } from "../../stores/settingsStore";
import { QueuePanel } from "../QueuePanel";
import { DownloadList } from "../DownloadList";
import { TrackInfo } from "../player/TrackInfo";

interface RightPanelProps {
  view: PanelView | null;
  onClose: () => void;
}

export function RightPanel({ view, onClose }: RightPanelProps) {
  const { t } = useTranslation();
  const isOpen = view !== null;

  return (
    <div
      className={`text-neutral flex h-full min-w-(--rightpanel-w) flex-col px-2 pt-2 ${!isOpen ? "cursor-pointer" : "cursor-default"}`}
      role={isOpen ? undefined : "button"}
      onClick={isOpen ? undefined : onClose}
    >
      <div className="flex justify-between items-center">
        <h3 className="text-sm px-4 font-medium">
          {view === "queue" ? t("panel.queue") : view === "downloads" ? t("panel.downloads") : t("panel.info")}
        </h3>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="flex items-center rounded h-7 w-7 p-1 text-neutral cursor-pointer font-medium transition hover:scale-110"
          aria-label={t("panel.close")}
        >
          X
        </button>
      </div>

      <div className={`flex-1 overflow-y-auto scroll-area ${!isOpen ? "pointer-events-none overflow-hidden" : ""}`}>
        {view === "queue" && <QueuePanel />}
        {view === "downloads" && <DownloadList />}
        {(view === "details" || view === null) && <TrackInfo />}
      </div>
    </div>
  );
}
