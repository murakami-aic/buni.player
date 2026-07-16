import { useEffect, useMemo } from "react";
import { Layout } from "./components/layout/Layout";
import { useLibraryStore } from "./stores/libraryStore";
import { usePlaylistStore } from "./stores/playlistStore";
import { useSettingsStore } from "./stores/settingsStore";
import { usePlayerStore } from "./stores/playerStore";
import { useTauriEvent } from "./hooks/useTauriEvent";
import { useLastfmArtistInfo } from "./hooks/useLastfmArtistInfo";
import { initPlatform } from "./utils/platform";
import { getThumbnailUrl } from "./utils/format";
import { useTrackPalette } from "./hooks/useTrackPalette";
import i18next from "./i18n";

function App() {
  const loadSettings = useSettingsStore((state) => state.loadSettings);
  const fetchTracks = useLibraryStore((state) => state.fetchTracks);
  const loadLibraryUI = useLibraryStore((state) => state.loadLibraryUI);
  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const lang = useSettingsStore((state) => state.lang);

  useTauriEvent();
  useLastfmArtistInfo();

  useEffect(() => {
    const init = async () => {
      await initPlatform();
      await loadSettings();
      const { volume } = useSettingsStore.getState();
      usePlayerStore.getState().setVolume(volume);

      await useLibraryStore.getState().loadLibraryUI();
      await fetchTracks();
      await usePlaylistStore.getState().fetchPlaylists();
      const { tracks } = useLibraryStore.getState();
      await usePlayerStore.getState().loadQueue(tracks);
    };
    init();
  }, [loadSettings, loadLibraryUI, fetchTracks]);

  useEffect(() => {
    i18next.changeLanguage(lang);
  }, [lang]);

  const bgImage = useMemo(() => {
    if (!currentTrack?.thumbnail) return null;
    return getThumbnailUrl(currentTrack.thumbnail);
  }, [currentTrack?.thumbnail]);

  const palette = useTrackPalette(currentTrack?.thumbnail);

  const style: Record<string, string> = {};
  if (bgImage) {
    style.backgroundImage = `url(${bgImage})`;
    style.backgroundSize = "cover";
    style.backgroundPosition = "center";
    style.backgroundRepeat = "no-repeat";
  }
  if (palette) {
    style["--accent"] = palette.accentTriplet;
    style["--muted"] = palette.mutedTriplet;
    style["--accent-foreground"] = palette.accentFgTriplet;
    style["--theme-surface"] = palette.themeSurface;
    style["--theme-overlay"] = palette.themeOverlay;
    style["--overlay-opacity"] = String(palette.overlayOpacity);
  }

  return (
    <div
      className="h-screen w-screen overflow-hidden bg-black/90"
      style={Object.keys(style).length > 0 ? style as React.CSSProperties : undefined}
    >
      <Layout />
    </div>
  );
}

export default App;