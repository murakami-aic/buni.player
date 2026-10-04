import { create } from "zustand";
import { invokeGetSetting, invokeSetSetting, invokeSetLanguage } from "../services/tauri";

export type Theme = "light" | "dark";
export type Lang = "es" | "en";
export type PanelView = "queue" | "downloads" | "details";
export type MainView = "library" | "settings" | "search_results";

interface SettingsState {
  mainView: MainView;
  downloadFolder: string;
  audioFormat: string;
  audioQuality: string;
  lastfmApiKey: string;
  lastfmEnabled: boolean;
  maxConcurrentDownloads: number;
  theme: Theme;
  lang: Lang;
  panelView: PanelView | null;
  volume: number;

  loadSettings: () => Promise<void>;
  updateSetting: <K extends keyof Omit<SettingsState, "loadSettings" | "updateSetting" | "setPanelView" | "setLanguage" | "setMainView">>(
    key: K,
    value: SettingsState[K],
  ) => Promise<void>;
  setLanguage: (lang: Lang) => Promise<void>;
  setPanelView: (view: PanelView | null) => void;
  setMainView: (view: MainView) => void;
}

const DEFAULTS = {
  downloadFolder: "$MUSIC/buni-player",
  audioFormat: "m4a",
  audioQuality: "best",
  lastfmApiKey: "",
  lastfmEnabled: true,
  maxConcurrentDownloads: 3,
  theme: "dark" as Theme,
  lang: "es" as Lang,
  panelView: null as PanelView | null,
  volume: 0.8,
  mainView: "library" as MainView,
};

const KEYS = Object.keys(DEFAULTS) as (keyof typeof DEFAULTS)[];

function parseValue<K extends keyof typeof DEFAULTS>(key: K, raw: string): (typeof DEFAULTS)[K] {
  if (raw === "") return DEFAULTS[key];
  switch (key) {
    case "lastfmEnabled":
      return (raw === "true") as unknown as (typeof DEFAULTS)[K];
    case "maxConcurrentDownloads":
      return (Number(raw) || DEFAULTS[key]) as unknown as (typeof DEFAULTS)[K];
    case "volume":
      return (isNaN(Number(raw)) ? DEFAULTS[key] : Number(raw)) as unknown as (typeof DEFAULTS)[K];
    case "panelView":
      if (raw === "") return null as unknown as (typeof DEFAULTS)[K];
      return (raw || null) as unknown as (typeof DEFAULTS)[K];
    default:
      return raw as unknown as (typeof DEFAULTS)[K];
  }
}

export const useSettingsStore = create<SettingsState>((set) => ({
  ...DEFAULTS,

  loadSettings: async () => {
    try {
      const values = await Promise.all(KEYS.map((key) => invokeGetSetting(key)));
      const loaded = Object.fromEntries(
        KEYS.map((key, i) => [key, parseValue(key, values[i])]),
      ) as typeof DEFAULTS;
      set(loaded);
    } catch (err) {
      console.error("Failed to load settings:", err);
    }
  },

  updateSetting: async (key, value) => {
    set({ [key]: value } as Partial<SettingsState>);
    try {
      await invokeSetSetting(key, String(value));
    } catch (err) {
      console.error("Failed to save setting:", err);
    }
  },

  setPanelView: (view) => {
    set((state) => {
      if (view === null) {
        return state.panelView === "details" ? { panelView: null } : { panelView: "details" };
      }
      if (state.panelView === view) {
        return view === "details" ? { panelView: null } : { panelView: "details" };
      }
      return { panelView: view };
    });
  },

  setMainView: (view) => set({ mainView: view }),

  setLanguage: async (lang) => {
    set({ lang });
    try {
      await invokeSetLanguage(lang);
    } catch (err) {
      console.error("Failed to set language:", err);
    }
  },
}));

useSettingsStore.subscribe((state, prevState) => {
  if (state.panelView !== prevState.panelView) {
    invokeSetSetting("panelView", state.panelView ?? "").catch(() => {});
  }
});
