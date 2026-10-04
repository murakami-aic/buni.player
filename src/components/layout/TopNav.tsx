import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Loader2, Maximize2, Minus, Settings, User, X, Search } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useLibraryStore } from "../../stores/libraryStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { PLATFORM } from "../../utils/platform";
import { invokeSearch } from "../../services/tauri";

const URL_RE = /^https?:\/\//;

export function TopNav() {
  const { t } = useTranslation();
  const addTrack = useLibraryStore((state) => state.addTrack);
  const downloads = useLibraryStore((state) => state.downloads);
  const adding = useLibraryStore((state) => state.adding);
  const addProgress = useLibraryStore((state) => state.addProgress);
  const cancelAddTrack = useLibraryStore((state) => state.cancelAddTrack);
  const setSearchResults = useLibraryStore((state) => state.setSearchResults);
  const setSearchResultsLoading = useLibraryStore((state) => state.setSearchResultsLoading);
  const [url, setUrl] = useState("");
  const appWindow = getCurrentWindow();

  const panelView = useSettingsStore((state) => state.panelView);
  const setPanelView = useSettingsStore((state) => state.setPanelView);
  const mainView = useSettingsStore((state) => state.mainView);
  const setMainView = useSettingsStore((state) => state.setMainView);

  const activeDownloads = Array.from(downloads.values()).filter(d => d.status === "downloading").length;

  const doFullSearch = async (query: string) => {
    console.log("[doFullSearch] starting query:", query);
    setSearchResultsLoading(true);
    setMainView("search_results");
    try {
      console.log("[doFullSearch] calling invokeSearch...");
      const results = await invokeSearch(query, 10);
      console.log("[doFullSearch] got results:", results.length, results);
      setSearchResults(results);
    } catch (err) {
      console.error("[doFullSearch] error:", err);
      setSearchResults([]);
    } finally {
      console.log("[doFullSearch] setting loading=false");
      setSearchResultsLoading(false);
    }
  };

  const handleSubmit = (e: React.SubmitEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed || adding) return;

    console.log("[handleSubmit] value:", trimmed, "isURL:", URL_RE.test(trimmed));

    if (URL_RE.test(trimmed)) {
      addTrack(trimmed);
      setUrl("");
    } else {
      doFullSearch(trimmed);
      setUrl("");
    }
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

        <img data-tauri-drag src="logo.svg" className="hidden font-semibold tracking-tight text-foreground h-8 w-15  grida place-content-center my-auto" />



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

/*
 * DROPDOWN (desactivado por rate-limiting sin cookies — reactivar cuando se implementen cookies)
 *

import { useEffect, useRef } from "react";
import { Plus } from "lucide-react";
import type { SearchResult } from "../../types/search";
import { formatDuration } from "../../utils/format";

const DEBOUNCE_MS = 300;

// --- estados extra (agregar al useState inicial) ---
//   const [dropdownResults, setDropdownResults] = useState<SearchResult[]>([]);
//   const [searching, setSearching] = useState(false);
//   const [showDropdown, setShowDropdown] = useState(false);
//   const debounceRef = useRef<number | null>(null);
//   const inputRef = useRef<HTMLInputElement>(null);
//   const dropdownRef = useRef<HTMLDivElement>(null);

// --- useEffect de debounce (despues de activeDownloads) ---
//   useEffect(() => {
//     const trimmed = url.trim();
//     if (!trimmed || URL_RE.test(trimmed) || adding) {
//       setDropdownResults([]);
//       setShowDropdown(false);
//       return;
//     }
//
//     setSearching(true);
//     clearTimeout(debounceRef.current ?? undefined);
//     debounceRef.current = window.setTimeout(async () => {
//       try {
//         const results = await invokeSearch(trimmed, 5);
//         setDropdownResults(results);
//         setShowDropdown(results.length > 0);
//       } catch {
//         setDropdownResults([]);
//       } finally {
//         setSearching(false);
//       }
//     }, DEBOUNCE_MS);
//
//     return () => clearTimeout(debounceRef.current ?? undefined);
//   }, [url, adding]);

// --- handlers del dropdown ---
//   const handleInputChange = (value: string) => {
//     setUrl(value);
//     if (!value.trim()) {
//       setShowDropdown(false);
//       setDropdownResults([]);
//     }
//   };
//
//   const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
//     if (e.key === "Escape") {
//       setShowDropdown(false);
//       e.currentTarget.blur();
//     }
//   };
//
//   const handleInputBlur = () => {
//     window.setTimeout(() => {
//       if (!document.activeElement || !dropdownRef.current?.contains(document.activeElement)) {
//         setShowDropdown(false);
//       }
//     }, 150);
//   };
//
//   const handleAddFromDropdown = (result: SearchResult) => {
//     addTrack(result.sourceUrl);
//     setShowDropdown(false);
//     setUrl("");
//   };

// --- cambios en el input (reemplazar onChange simple) ---
// onChange={(e) => handleInputChange(e.currentTarget.value)}
// onKeyDown={handleInputKeyDown}
// onBlur={handleInputBlur}
// onFocus={() => { if (dropdownResults.length > 0) setShowDropdown(true); }}
// ref={inputRef}

// --- cambios en doFullSearch (agregar al inicio) ---
// setShowDropdown(false);

// --- boton Search con spinner (reemplazar <Search />) ---
// {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}

// --- dropdown JSX (dentro del div.relative, despues del boton X) ---
// {showDropdown && dropdownResults.length > 0 && (
//   <div
//     ref={dropdownRef}
//     className="absolute top-full mt-1 left-0 right-0 z-50 rounded-md border border-accent bg-background shadow-lg max-h-80 overflow-y-auto"
//   >
//     {dropdownResults.map((result, i) => (
//       <button
//         key={i}
//         type="button"
//         onClick={() => handleAddFromDropdown(result)}
//         className="flex items-center gap-2 w-full px-2 py-1.5 text-left text-sm hover:bg-accent-list transition cursor-pointer"
//       >
//         <span className="text-xs text-muted w-5 shrink-0 text-center">{i + 1}</span>
//         <div className="min-w-0 flex-1">
//           <p className="truncate text-accent-foreground">{result.title}</p>
//           <p className="truncate text-xs text-muted">{result.artist ?? "\u2014"}</p>
//         </div>
//         <span className="text-xs text-muted shrink-0">
//           {result.duration != null ? formatDuration(result.duration) : ""}
//         </span>
//         <Plus size={14} className="shrink-0 text-accent-foreground" />
//       </button>
//     ))}
//   </div>
// )}

*/
