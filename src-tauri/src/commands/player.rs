use crate::services::database;
use tauri::{AppHandle, Emitter};

#[tauri::command]
pub async fn track_started(app: AppHandle, track_id: i64) -> Result<(), String> {
    database::track_started(&app, track_id).map_err(|e| e.to_string())?;
    let _ = app.emit("track:played", serde_json::json!({ "trackId": track_id }));
    Ok(())
}
