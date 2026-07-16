import { useState, useEffect } from "react";
import { ArrowLeft, ExternalLink, Check, X, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../../stores/settingsStore";
import { invokeGetYtdlpVersion, invokeUpdateYtdlp, invokeGetDefaultDownloadFolder } from "../../services/tauri";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";

interface YtdlpUpdateStatus {
  status: "checking" | "downloading" | "installing" | "complete" | "error";
  message: string;
}

export function Settings() {
  const { t } = useTranslation();
  const lastfmApiKey = useSettingsStore((s) => s.lastfmApiKey);
  const lastfmEnabled = useSettingsStore((s) => s.lastfmEnabled);
  const lang = useSettingsStore((s) => s.lang);
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const setMainView = useSettingsStore((s) => s.setMainView);
  const downloadFolder = useSettingsStore((s) => s.downloadFolder);

  const [testStatus, setTestStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [testMessage, setTestMessage] = useState("");

  const [ytdlpVersion, setYtdlpVersion] = useState<string | null>(null);
  const [ytdlpStatus, setYtdlpStatus] = useState<YtdlpUpdateStatus | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [folderDisplay, setFolderDisplay] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const unlisteners: UnlistenFn[] = [];

    if (!downloadFolder || downloadFolder.startsWith("$")) {
      invokeGetDefaultDownloadFolder()
        .then((p) => { if (mounted) setFolderDisplay(p); })
        .catch(() => { });
    } else {
      setFolderDisplay(downloadFolder);
    }

    listen<YtdlpUpdateStatus>("ytdlp:update-status", (e) => {
      if (mounted) {
        setYtdlpStatus(e.payload);
        if (e.payload.status === "complete" || e.payload.status === "error") {
          setIsUpdating(false);
        }
      }
    }).then((fn) => unlisteners.push(fn));

    invokeGetYtdlpVersion()
      .then((v) => { if (mounted) setYtdlpVersion(v); })
      .catch(() => { });

    return () => {
      mounted = false;
      unlisteners.forEach((fn) => fn());
    };
  }, [downloadFolder]);

  const handleUpdateYtdlp = async () => {
    setIsUpdating(true);
    setYtdlpStatus(null);
    try {
      const result = await invokeUpdateYtdlp();
      const newVersion = result.match(/[\d]+\.[\d]+\.[\d]+/)?.[0] ?? result;
      setYtdlpVersion(newVersion);
    } catch (e) {
      setYtdlpStatus({ status: "error", message: String(e) });
      setIsUpdating(false);
    }
  };

  const handlePickFolder = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") {
      await updateSetting("downloadFolder", selected);
      setFolderDisplay(selected);
    }
  };

  const handleTestConnection = async () => {
    if (!lastfmApiKey.trim()) {
      setTestStatus("error");
      setTestMessage(t("settings.enter_api_key"));
      return;
    }
    setTestStatus("loading");
    setTestMessage("");
    try {
      const res = await fetch(
        `https://ws.audioscrobbler.com/2.0/?method=track.search&track=test&api_key=${lastfmApiKey}&format=json`,
      );
      const data = await res.json() as { error?: number; message?: string };
      if (data.error) {
        setTestStatus("error");
        setTestMessage(data.message ?? t("settings.unknown_error"));
      } else {
        setTestStatus("success");
        setTestMessage(t("settings.connection_success"));
      }
    } catch {
      setTestStatus("error");
      setTestMessage(t("settings.connection_error"));
    }
  };

  return (
    <div className="flex-1 overflow-auto layout-component scroll-area cursor-default overflow-x-hidden overflow-y-auto">
      <div className="max-w-lg mx-auto px-4 py-6 space-y-8">
        <button
          type="button"
          onClick={() => setMainView("library")}
          className="cursor-pointer hover:scale-110 flex items-center gap-1.5 text-sm text-neutral hover:text-foreground transition"
        >
          <ArrowLeft size={16} />
          {t("settings.back")}
        </button>

        <div className="space-y-6">
          <h2 className="text-lg font-semibold text-foreground">{t("settings.language")}</h2>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setLanguage("es")}
              className={`px-4 py-1.5 text-xs rounded transition cursor-pointer ${lang === "es"
                ? "bg-accent text-white"
                : "bg-accent-list text-foreground hover:bg-accent"
                }`}
            >
              {t("settings.spanish")}
            </button>
            <button
              type="button"
              onClick={() => setLanguage("en")}
              className={`px-4 py-1.5 text-xs rounded transition cursor-pointer ${lang === "en"
                ? "bg-accent text-white"
                : "bg-accent-list text-foreground hover:bg-accent"
                }`}
            >
              {t("settings.english")}
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-lg font-semibold text-foreground">{t("settings.lastfm")}</h2>

          <div className="space-y-2">
            <label className="text-sm text-neutral">{t("settings.api_key")}</label>
            <input
              type="text"
              value={lastfmApiKey}
              onChange={(e) => updateSetting("lastfmApiKey", e.currentTarget.value)}
              placeholder={t("settings.api_key_placeholder")}
              className="w-full rounded-md px-3 py-1.5 h-9 text-sm text-foreground bg-accent-list border border-transparent focus:outline-none focus:ring-2 focus:ring-accent-foreground placeholder:text-neutral"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testStatus === "loading"}
                className="px-3 py-1 text-xs rounded bg-accent-list hover:bg-accent text-foreground transition disabled:opacity-50"
              >
                {testStatus === "loading" && <Loader2 size={12} className="inline animate-spin mr-1" />}
                {t("settings.test_connection")}
              </button>
              {testStatus === "success" && (
                <span className="flex items-center gap-1 text-xs text-green-500">
                  <Check size={12} /> {testMessage}
                </span>
              )}
              {testStatus === "error" && (
                <span className="flex items-center gap-1 text-xs text-red-400">
                  <X size={12} /> {testMessage}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-neutral">{t("settings.enable_lastfm")}</span>
            <button
              type="button"
              role="switch"
              aria-checked={lastfmEnabled}
              onClick={() => updateSetting("lastfmEnabled", !lastfmEnabled)}
              className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-accent-foreground ${lastfmEnabled ? "bg-accent-foreground" : "bg-accent-list"
                }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform ring-0 transition-transform ${lastfmEnabled ? "translate-x-4" : "translate-x-0"
                  }`}
              />
            </button>
          </div>

          <a
            href="https://www.last.fm/api"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-neutral hover:text-foreground transition"
          >
            <ExternalLink size={12} />
            {t("settings.get_api_key")}
          </a>
        </div>

        <div className="space-y-6">
          <h2 className="text-lg font-semibold text-foreground">{t("settings.downloads")}</h2>

          <div className="space-y-2">
            <label className="text-sm text-neutral">{t("settings.download_folder")}</label>
            <div className="flex items-center gap-2">
              <span className="flex-1 truncate text-xs text-neutral bg-accent-list rounded px-2 py-1.5">
                {folderDisplay ?? "..."}
              </span>
              <button
                type="button"
                onClick={handlePickFolder}
                className="px-3 py-1 text-xs rounded bg-accent-list hover:bg-accent text-foreground transition"
              >
                {t("settings.change")}
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-lg font-semibold text-foreground">{t("settings.ytdlp")}</h2>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-neutral">
                {ytdlpVersion ? `v${ytdlpVersion}` : "..."}
              </span>
              <button
                type="button"
                onClick={handleUpdateYtdlp}
                disabled={isUpdating}
                className="px-3 py-1 text-xs rounded bg-accent-list hover:bg-accent text-foreground transition disabled:opacity-50"
              >
                {isUpdating && <Loader2 size={12} className="inline animate-spin mr-1" />}
                {t("settings.update")}
              </button>
            </div>
            {ytdlpStatus && (
              <div className="flex items-center gap-1.5">
                {(ytdlpStatus.status === "checking" || ytdlpStatus.status === "downloading" || ytdlpStatus.status === "installing") && (
                  <Loader2 size={12} className="animate-spin text-neutral" />
                )}
                {ytdlpStatus.status === "complete" && <Check size={12} className="text-green-500" />}
                {ytdlpStatus.status === "error" && <X size={12} className="text-red-400" />}
                <span className={`text-xs ${ytdlpStatus.status === "error" ? "text-red-400" : ytdlpStatus.status === "complete" ? "text-green-500" : "text-neutral"}`}>
                  {ytdlpStatus.message}
                </span>
              </div>
            )}
          </div>
        </div>


      </div>
    </div>
  );
}