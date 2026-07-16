import { useEffect, useRef } from "react";
import { usePlayerStore } from "../stores/playerStore";
import { useSettingsStore } from "../stores/settingsStore";
import { fetchArtistInfo } from "../services/lastfm";
import type { LastfmArtistDisplay } from "../types/lastfm";

const cache = new Map<string, LastfmArtistDisplay>();

function cacheKey(artist: string, lang: string) {
  return `${artist}::${lang}`;
}

export function useLastfmArtistInfo() {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const setArtistInfo = usePlayerStore((s) => s.setArtistInfo);
  const lastfmApiKey = useSettingsStore((s) => s.lastfmApiKey);
  const lastfmEnabled = useSettingsStore((s) => s.lastfmEnabled);
  const lang = useSettingsStore((s) => s.lang);
  const ready = usePlayerStore((s) => s.currentTime >= 3 && s.isPlaying);

  const doneRef = useRef<number | null>(null);

  useEffect(() => {
    doneRef.current = null;
    setArtistInfo(null);

    if (!currentTrack?.artist || !lastfmEnabled || !lastfmApiKey) return;

    const cached = cache.get(cacheKey(currentTrack.artist, lang));
    if (cached) {
      setArtistInfo(cached);
      doneRef.current = currentTrack.id;
    }
  }, [currentTrack?.id]);

  useEffect(() => {
    if (!ready || !currentTrack?.artist || !lastfmApiKey) return;
    if (doneRef.current === currentTrack.id) return;

    doneRef.current = currentTrack.id;
    const artist = currentTrack.artist;

    fetchArtistInfo(lastfmApiKey, artist, lang).then((data) => {
      if (data) {
        setArtistInfo(data);
        cache.set(cacheKey(artist, lang), data);
      }
    });
  }, [ready, currentTrack?.id]);
}
