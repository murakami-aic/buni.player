use crate::models::playlist::Playlist;
use crate::models::track::Track;
use crate::services::database;
use tauri::AppHandle;

#[tauri::command]
pub async fn get_playlists(app: AppHandle) -> Result<Vec<Playlist>, String> {
    database::get_playlists(&app).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_playlist(app: AppHandle, name: String, image: Option<String>) -> Result<Playlist, String> {
    database::create_playlist(&app, &name, image.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_playlist(app: AppHandle, playlist_id: i64) -> Result<(), String> {
    database::delete_playlist(&app, playlist_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_playlist(app: AppHandle, playlist_id: i64, name: Option<String>, image: Option<String>) -> Result<Playlist, String> {
    database::update_playlist(&app, playlist_id, name.as_deref(), image.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_to_playlist(app: AppHandle, playlist_id: i64, track_id: i64) -> Result<(), String> {
    database::add_to_playlist(&app, playlist_id, track_id)
}

#[tauri::command]
pub async fn remove_from_playlist(app: AppHandle, playlist_id: i64, track_id: i64) -> Result<(), String> {
    database::remove_from_playlist(&app, playlist_id, track_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_playlist_tracks(app: AppHandle, playlist_id: i64) -> Result<Vec<Track>, String> {
    database::get_playlist_tracks(&app, playlist_id).map_err(|e| e.to_string())
}
