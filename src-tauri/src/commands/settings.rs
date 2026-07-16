use crate::services::i18n;
use tauri::{AppHandle, Manager};
use tauri_plugin_store::StoreExt;

#[tauri::command]
pub async fn get_setting(app: AppHandle, key: String) -> Result<String, String> {
    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    let value = store
        .get(&key)
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_default();
    Ok(value)
}

#[tauri::command]
pub async fn set_setting(app: AppHandle, key: String, value: String) -> Result<(), String> {
    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    store.set(key, serde_json::Value::String(value));
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn set_language(app: AppHandle, lang: String) -> Result<(), String> {
    if lang != "es" && lang != "en" {
        return Err(format!("Idioma no soportado: {}", lang));
    }
    i18n::set_language(&lang);
    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    store.set("lang".to_string(), serde_json::Value::String(lang));
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_platform() -> String {
    if cfg!(target_os = "macos") {
        "darwin".to_string()
    } else if cfg!(target_os = "windows") {
        "win32".to_string()
    } else {
        "linux".to_string()
    }
}

#[tauri::command]
pub fn get_default_download_folder(app: AppHandle) -> Result<String, String> {
    let dir = app
        .path()
        .audio_dir()
        .map(|d| d.join("buni-player"))
        .or_else(|_| {
            app.path()
                .app_data_dir()
                .map(|d| d.join("downloads"))
        })
        .map_err(|e| e.to_string())?;

    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    dir.to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Invalid download path".to_string())
}