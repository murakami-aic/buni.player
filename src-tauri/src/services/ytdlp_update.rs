use crate::services::i18n;
use serde::Deserialize;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_store::StoreExt;

#[cfg(target_os = "windows")]
const ASSET_NAME: &str = "yt-dlp.exe";

#[cfg(target_os = "macos")]
const ASSET_NAME: &str = "yt-dlp_macos";

#[cfg(target_os = "linux")]
const ASSET_NAME: &str = "yt-dlp";

fn sidecar_filename() -> &'static str {
    if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        "yt-dlp-x86_64-pc-windows-msvc.exe"
    } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        "yt-dlp-x86_64-apple-darwin"
    } else if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        "yt-dlp-aarch64-apple-darwin"
    } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        "yt-dlp-x86_64-unknown-linux-gnu"
    } else {
        "yt-dlp"
    }
}

#[derive(Deserialize)]
struct GithubRelease {
    tag_name: String,
    assets: Vec<GithubAsset>,
}

#[derive(Deserialize)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
}

#[tauri::command]
pub async fn get_ytdlp_version(app: AppHandle) -> Result<String, String> {
    let sidecar = app
        .shell()
        .sidecar("yt-dlp")
        .map_err(|_| i18n::t("error.ytdlp.not_found"))?;

    let output = sidecar
        .args(["--version"])
        .output()
        .await
        .map_err(|_| i18n::t("error.ytdlp.execute_failed"))?;

    if !output.status.success() {
        return Err(i18n::t("error.ytdlp.generic"));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[tauri::command]
pub async fn update_ytdlp(app: AppHandle) -> Result<String, String> {
    emit_status(&app, "checking", i18n::t("ytdlp.update.checking"));

    let current = get_version_inner(&app).await?;

    let release = fetch_latest_release().await.map_err(|e| {
        let msg = i18n::t("ytdlp.update.api_error");
        emit_status(&app, "error", msg.clone());
        replace_placeholder(msg, &e)
    })?;

    if current == release.tag_name {
        let msg = i18n::t("ytdlp.update.up_to_date");
        emit_status(&app, "complete", msg.clone());
        return Ok(msg);
    }

    let asset = release
        .assets
        .iter()
        .find(|a| a.name == ASSET_NAME)
        .ok_or_else(|| {
            let msg = i18n::t("ytdlp.update.no_asset");
            emit_status(&app, "error", msg.clone());
            msg
        })?;

    emit_status(
        &app,
        "downloading",
        replace_placeholder(i18n::t("ytdlp.update.downloading"), &release.tag_name),
    );

    let temp_path = download_binary(&asset.browser_download_url).await.map_err(|e| {
        emit_status(&app, "error", e.clone());
        e
    })?;

    emit_status(&app, "installing", i18n::t("ytdlp.update.installing"));

    let sidecar_path = find_sidecar_path().map_err(|e| {
        emit_status(&app, "error", e.clone());
        e
    })?;

    replace_binary(&temp_path, &sidecar_path).map_err(|e| {
        emit_status(&app, "error", e.clone());
        e
    })?;

    if let Ok(store) = app.store("settings.json") {
        store.set(
            "ytdlpVersion".to_string(),
            serde_json::Value::String(release.tag_name.clone()),
        );
        let _ = store.save();
    }

    let msg = replace_placeholder(i18n::t("ytdlp.update.complete"), &release.tag_name);
    emit_status(&app, "complete", msg.clone());
    Ok(msg)
}

fn emit_status(app: &AppHandle, status: &str, message: String) {
    let _ = app.emit(
        "ytdlp:update-status",
        serde_json::json!({ "status": status, "message": message }),
    );
}

fn replace_placeholder(template: String, value: &str) -> String {
    template.replacen("{}", value, 1)
}

async fn get_version_inner(app: &AppHandle) -> Result<String, String> {
    let sidecar = app
        .shell()
        .sidecar("yt-dlp")
        .map_err(|_| i18n::t("error.ytdlp.not_found"))?;

    let output = sidecar
        .args(["--version"])
        .output()
        .await
        .map_err(|_| i18n::t("error.ytdlp.execute_failed"))?;

    if !output.status.success() {
        return Err(i18n::t("error.ytdlp.generic"));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

async fn fetch_latest_release() -> Result<GithubRelease, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("http: {}", e))?;

    let resp = client
        .get("https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest")
        .header("User-Agent", "buni-player")
        .header("Accept", "application/vnd.github.v3+json")
        .send()
        .await
        .map_err(|e| format!("api: {}", e))?;

    resp.json::<GithubRelease>()
        .await
        .map_err(|e| format!("json: {}", e))
}

async fn download_binary(url: &str) -> Result<PathBuf, String> {
    let response = reqwest::get(url)
        .await
        .map_err(|e| format!("download: {}", e))?;

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("bytes: {}", e))?;

    let temp_dir = std::env::temp_dir().join("buni-player");
    std::fs::create_dir_all(&temp_dir).map_err(|e| format!("tempdir: {}", e))?;

    let temp_path = temp_dir.join(sidecar_filename());
    std::fs::write(&temp_path, &bytes).map_err(|e| format!("write: {}", e))?;

    Ok(temp_path)
}

fn find_sidecar_path() -> Result<PathBuf, String> {
    let filename = sidecar_filename();

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let bundled = dir.join(filename);
            if bundled.exists() {
                return Ok(bundled);
            }
        }
    }

    let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("binaries")
        .join(filename);
    if dev_path.exists() {
        return Ok(dev_path);
    }

    Err(format!("{} not found", filename))
}

fn replace_binary(src: &PathBuf, dest: &PathBuf) -> Result<(), String> {
    let old = {
        let stem = dest.file_stem().unwrap_or_default().to_string_lossy();
        let ext = dest
            .extension()
            .map(|e| format!(".{}", e.to_string_lossy()))
            .unwrap_or_default();
        dest.with_file_name(format!("{}.old{}", stem, ext))
    };

    if dest.exists() {
        if old.exists() {
            let _ = std::fs::remove_file(&old);
        }
        std::fs::rename(dest, &old)
            .map_err(|e| format!("Cannot rename old binary: {}", e))?;
    }

    std::fs::copy(src, dest)
        .map_err(|e| format!("Cannot copy new binary: {}", e))?;

    #[cfg(not(target_os = "windows"))]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(dest)
            .map_err(|e| format!("Cannot read metadata: {}", e))?
            .permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(dest, perms)
            .map_err(|e| format!("Cannot set permissions: {}", e))?;
    }

    let _ = std::fs::remove_file(&old);
    let _ = std::fs::remove_file(src);

    Ok(())
}
