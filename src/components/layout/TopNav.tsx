import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Loader2, Maximize2, Minus, Settings, User, X, Search } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useLibraryStore } from "../../stores/libraryStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { PLATFORM } from "../../utils/platform";

export function TopNav() {
  const { t } = useTranslation();
  const addTrack = useLibraryStore((state) => state.addTrack);
  const downloads = useLibraryStore((state) => state.downloads);
  const adding = useLibraryStore((state) => state.adding);
  const addProgress = useLibraryStore((state) => state.addProgress);
  const cancelAddTrack = useLibraryStore((state) => state.cancelAddTrack);
  const [url, setUrl] = useState("");
  const appWindow = getCurrentWindow();

  const panelView = useSettingsStore((state) => state.panelView);
  const setPanelView = useSettingsStore((state) => state.setPanelView);
  const mainView = useSettingsStore((state) => state.mainView);
  const setMainView = useSettingsStore((state) => state.setMainView);

  const activeDownloads = Array.from(downloads.values()).filter(d => d.status === "downloading").length;

  const handleSubmit = (e: React.SubmitEvent) => {
    e.preventDefault();
    if (!url.trim() || adding) return;
    addTrack(url.trim());
    setUrl("");
  };

  return (
    <header className="pb-4">
      <div data-tauri-drag-region className="h-10 border-green-50 flex justify-between">
        <div data-tauri-no-drag className="flex h-full pl-5">
          <button
            type="button"
            onClick={() => setPanelView("downloads")}
            className={`relative h-8 aspect-square  transition hover:scale-110 ${panelView === "downloads" ? "text-accent" : ""}`}
            title={t("topnav.downloads")}
          >
            <Download size={16} />
            {activeDownloads > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-[8px] font-bold text-black">

              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setMainView(mainView === "settings" ? "library" : "settings")}
            className={`h-8 aspect-square transition hover:scale-110 ${mainView === "settings" ? "text-accent" : ""}`}
            title={t("topnav.settings")}
          >
            <Settings size={16} />
          </button>

          <button
            type="button"
            className={`h-8 aspect-square  text-sm transition hover:scale-115 opacity-40`}
            title={t("topnav.profile")}
          >
            <User size={16} />
          </button>
        </div>

        <img data-tauri-no-drag src="logo.svg" className="font-semibold tracking-tight text-foreground h-8 w-15  grida place-content-center my-auto" />



        {PLATFORM !== "darwin" && (
          <div data-tauri-no-drag className="flex h-full">
            <button
              type="button"
              onClick={() => appWindow.minimize()}
              className="h-full aspect-square text-neutral hover:bg-accent rounded transition grid place-items-center"
              title={t("topnav.minimize")}
            >
              <Minus size={14} />
            </button>
            <button
              type="button"
              onClick={() => appWindow.toggleMaximize()}
              className="h-full aspect-square  text-neutral hover:text-foreground hover:bg-accent rounded transition grid place-items-center"
              title={t("topnav.maximize")}
            >
              <Maximize2 size={14} />
            </button>
            <button
              type="button"
              onClick={() => appWindow.close()}
              className="h-full aspect-square  text-neutral hover:text-white hover:bg-red-500 rounded transition grid place-items-center"
              title={t("topnav.close")}
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>
      <div className="flex justify-center">
        <div className="items-center justify-center gap-2 my-auto">
          <form data-tauri-no-drag onSubmit={handleSubmit} className="flex">
            {adding && (
              <div className="flex items-center gap-1 mr-2 text-accent-foreground text-xs">
                {addProgress ? (
                  <span>+{addProgress.current}/{addProgress.total}</span>
                ) : (
                  <Loader2 size={14} className="animate-spin" />
                )}
                <button
                  type="button"
                  onClick={cancelAddTrack}
                  className="grid place-items-center h-5 w-5 rounded cursor-pointer transition hover:bg-accent-list"
                  title={t("topnav.cancel")}
                >
                  <X size={12} />
                </button>
              </div>
            )}
            <div className="relative">
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.currentTarget.value)}
                disabled={adding}
                placeholder={t("topnav.input_placeholder")}
                className="rounded-md w-80 pl-2 pr-8 h-8 text-sm text-accent-foreground placeholder:text-accent-foreground/70 focus:outline-none focus:ring-2 focus:ring-accent-foreground disabled:opacity-50"
              />
              {url && !adding && (
                <button
                  type="button"
                  onClick={() => setUrl("")}
                  className="absolute right-1 top-1/2 -translate-y-1/2 grid place-items-center h-6 w-6 rounded cursor-pointer transition hover:bg-accent-list"
                  title={t("topnav.clear")}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={adding}
              className="px-2 hover:scale-105 h-8 aspect-square disabled:opacity-50 disabled:hover:scale-100"
            >
              <Search />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
