use crate::services::lastfm_client;
use crate::services::{database, i18n};
use crate::models::{lastfm::LastfmSearchTrack, track::Track};
use tauri::{AppHandle, Emitter};
use tauri_plugin_store::StoreExt;

#[tauri::command]
pub async fn lastfm_enrich_track(app: AppHandle, track_id: i64) -> Result<Track, String> {
    let tracks = database::get_tracks(&app, None, None, None, None).map_err(|e| e.to_string())?;
    let track = tracks
        .into_iter()
        .find(|t| t.id == track_id)
        .ok_or_else(|| i18n::t("error.track.not_found"))?;

    let api_key: Option<String> = app
        .store("settings.json")
        .map_err(|e| e.to_string())?
        .get("lastfmApiKey")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .filter(|s| !s.is_empty());
    if api_key.is_none() {
        return Err(i18n::t("error.lastfm.no_api_key"));
    }

    let enabled = app
        .store("settings.json")
        .map_err(|e| e.to_string())?
        .get("lastfmEnabled")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| "true".to_string());
    if enabled != "true" {
        return Err(i18n::t("error.lastfm.disabled"));
    }

    let enriched = lastfm_client::enrich_track(&app, &track).await?;
    database::enrich_track(&app, track_id, &enriched).map_err(|e| e.to_string())?;

    let updated = database::get_tracks(&app, None, None, None, None)
        .map_err(|e| e.to_string())?
        .into_iter()
        .find(|t| t.id == track_id)
        .ok_or_else(|| i18n::t("error.track.not_found"))?;

    let _ = app.emit("track:enriched", serde_json::json!({ "trackId": track_id }));
    let _ = app.emit("library:updated", serde_json::json!({}));
    Ok(updated)
}

#[tauri::command]
pub async fn lastfm_search_track(
    app: AppHandle,
    title: String,
    artist: Option<String>,
) -> Result<LastfmSearchTrack, String> {
    let artist = artist.unwrap_or_default();
    let result = lastfm_client::search_track(&app, &title, &artist).await?;
    result.ok_or_else(|| i18n::t("error.lastfm.not_found"))
}
