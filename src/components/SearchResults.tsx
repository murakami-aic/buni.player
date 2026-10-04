import { useTranslation } from "react-i18next";
import { Loader2, Plus, X } from "lucide-react";
import { useLibraryStore } from "../stores/libraryStore";
import { useSettingsStore } from "../stores/settingsStore";
import { formatDuration, getThumbnailUrl } from "../utils/format";

export function SearchResults() {
  const { t } = useTranslation();
  const results = useLibraryStore((state) => state.searchResults);
  const loading = useLibraryStore((state) => state.searchResultsLoading);
  const clearSearchResults = useLibraryStore((state) => state.clearSearchResults);
  const addTrack = useLibraryStore((state) => state.addTrack);
  const setMainView = useSettingsStore((state) => state.setMainView);

  const handleAdd = (sourceUrl: string) => {
    addTrack(sourceUrl);
  };

  return (
    <section className="@container text-neutral flex flex-1 flex-col pt-0 min-w-90 layout-component scroll-area cursor-default overflow-x-hidden overflow-y-auto">

      <div className="flex flex-col gap-4 px-4 py-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { clearSearchResults(); setMainView("library"); }}
            className="grid place-items-center h-8 w-8 rounded cursor-pointer transition hover:bg-accent-list"
          >
            <X size={16} />
          </button>
          <h1 className="text-2xl font-bold">Search Results</h1>
        </div>
      </div>

      <div className="px-4 py-2 ml-2 sticky top-0 z-10 glass-sticky rounded-md grid grid-cols-[auto_2fr_2fr_auto_auto] @[600px]:grid-cols-[auto_2fr_2fr_2fr_auto_auto] items-center">
        <h2 className="text-xs font-medium w-8 text-center">#</h2>
        <h2 className="col-span-2 text-xs font-medium">{t("tracklist.title")}</h2>
        <h2 className="hidden @[600px]:block text-xs font-medium">{t("tracklist.album")}</h2>
        <h2 className="text-xs font-medium text-center w-10 truncate">{t("trackinfo.duration")}</h2>
        <h2 className="w-6"></h2>
      </div>

      <div className="flex mx-4 border-b border-accent" />

      <div className="flex-1 my-3">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={24} className="animate-spin text-muted" />
          </div>
        ) : results.length === 0 ? (
          <p className="text-center text-sm text-muted py-8">{t("search.no_results")}</p>
        ) : (
          results.map((result, i) => (
            <div
              key={i}
              className="text-neutral py-2 mx-2 group grid rounded-md grid-cols-[auto_2fr_2fr_auto_auto] @[600px]:grid-cols-[auto_2fr_2fr_2fr_auto_auto] transition hover:bg-accent-list"
            >
              <span className="flex text-sm font-medium tabular-nums w-8 items-center justify-center">
                {i + 1}
              </span>

              <div className="flex gap-x-1.5 col-span-2 items-center">
                <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded bg-neutral text-xs font-medium">
                  {result.thumbnailUrl ? (
                    <img
                      src={getThumbnailUrl(result.thumbnailUrl) ?? undefined}
                      alt={result.title}
                      className="h-full w-full rounded object-cover"
                    />
                  ) : (
                    result.title.slice(0, 1).toUpperCase()
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{result.title}</p>
                  <p className="truncate text-xs">{result.artist ?? t("track.unknown_artist")}</p>
                </div>
              </div>

              <div className="hidden @[600px]:flex min-w-0 items-center">
                <p className="truncate text-sm">—</p>
              </div>

              <div className="min-w-0 flex items-center">
                <p className="text-sm w-10 truncate text-center">
                  {result.duration != null ? formatDuration(result.duration) : "--:--"}
                </p>
              </div>

              <div className="opacity-0 group-hover:opacity-100 min-w-0 w-6 text-xs flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => handleAdd(result.sourceUrl)}
                  className="grid place-items-center h-6 w-6 rounded cursor-pointer transition hover:bg-accent-list"
                  title="Add to library"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
