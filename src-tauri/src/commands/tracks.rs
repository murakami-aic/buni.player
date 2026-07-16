use crate::models::track::Track;
use crate::services::{database, i18n, lastfm_client, ytdlp};
use chrono::Utc;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_store::StoreExt;

static CANCEL_FLAG: Mutex<Option<Arc<AtomicBool>>> = Mutex::new(None);
static CHILD_SLOT: Mutex<Option<CommandChild>> = Mutex::new(None);

#[tauri::command]
pub async fn get_tracks(
    app: AppHandle,
    filter_mode: Option<String>,
    search_query: Option<String>,
    sort_by: Option<String>,
    sort_order: Option<String>,
) -> Result<Vec<Track>, String> {
    database::get_tracks(&app, filter_mode, search_query, sort_by, sort_order)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_track(app: AppHandle, source_url: String) -> Result<Vec<Track>, String> {
    let cancel_flag = Arc::new(AtomicBool::new(false));
    *CANCEL_FLAG.lock().unwrap() = Some(cancel_flag.clone());

    let no_playlist = source_url.contains("list=RD");
    let metadata_list = match ytdlp::get_metadata(&app, &source_url, &CHILD_SLOT, no_playlist).await {
        Ok(list) => list,
        Err(e) => {
            *CANCEL_FLAG.lock().unwrap() = None;
            if cancel_flag.load(Ordering::Relaxed) {
                return Err("cancelled".to_string());
            }
            return Err(e);
        }
    };

    let total = metadata_list.len() as i64;
    if total == 0 {
        *CANCEL_FLAG.lock().unwrap() = None;
        return Err(i18n::t("error.ytdlp.generic"));
    }

    let _ = app.emit("track:add-start", serde_json::json!({ "total": total }));

    let now = Utc::now().timestamp();
    let mut tracks: Vec<Track> = Vec::new();
    let mut current: i64 = 0;
    let mut skipped: i64 = 0;

    for metadata in metadata_list {
        current += 1;

        if cancel_flag.load(Ordering::Relaxed) {
            break;
        }

        if database::track_exists(&app, &metadata.source_url).map_err(|e| e.to_string())? {
            skipped += 1;
            let _ = app.emit(
                "track:add-progress",
                serde_json::json!({ "current": current, "total": total }),
            );
            continue;
        }

        let mut track = Track {
            id: 0,
            title: metadata.title,
            artist: metadata.artist,
            album: None,
            album_artist: None,
            duration: metadata.duration,
            genre_tags: None,
            thumbnail: None,
            source_url: metadata.source_url,
            source_site: metadata.source_site,
            stream_url: None,
            stream_url_ts: None,
            file_path: None,
            mode: "streaming".to_string(),
            play_count: 0,
            last_played: None,
            lastfm_url: None,
            lastfm_id: None,
            musicbrainz_id: None,
            has_video: metadata.has_video,
            created_at: now,
            updated_at: now,
        };

        let id = database::insert_track(&app, &track).map_err(|e| e.to_string())?;
        track.id = id;

        if let Some(url) = metadata.thumbnail_url {
            match ytdlp::download_thumbnail(&app, &url, id).await {
                Ok(path) => {
                    let _ = database::update_track_thumbnail(&app, id, &path);
                    track.thumbnail = Some(path);
                }
                Err(err) => eprintln!("Thumbnail download failed: {}", err),
            }
        }

        if let Ok(store) = app.store("settings.json") {
            let enabled = store
                .get("lastfmEnabled")
                .and_then(|v| v.as_str().map(|s| s.to_string()))
                .unwrap_or_else(|| "true".to_string());
            if enabled == "true" {
                let artist = track.artist.as_deref().unwrap_or("");
                match lastfm_client::enrich_metadata(&app, id, &track.title, artist).await {
                    Ok(enriched) => {
                        let _ = database::enrich_track(&app, id, &enriched);
                        track.title = enriched.title;
                        track.artist = Some(enriched.artist);
                        track.album = enriched.album;
                        track.album_artist = enriched.album_artist;
                        track.genre_tags = enriched.genre_tags;
                        track.lastfm_url = enriched.lastfm_url;
                        track.lastfm_id = enriched.lastfm_id;
                        let _ = app.emit("track:enriched", serde_json::json!({ "trackId": id, "disc": false }));
                    }
                    Err(e) => {
                        eprintln!("Last.fm enrichment failed for #{}: {e}", id);
                        let _ = app.emit("track:enrich-error", serde_json::json!({ "trackId": id, "error": e }));
                    }
                }
            }
        }

        let _ = app.emit("track:added", serde_json::json!({ "trackId": track.id }));
        let _ = app.emit(
            "track:add-progress",
            serde_json::json!({ "current": current, "total": total }),
        );

        tracks.push(track);
    }

    *CANCEL_FLAG.lock().unwrap() = None;

    let added = tracks.len() as i64;
    let _ = app.emit(
        "track:add-complete",
        serde_json::json!({ "added": added, "skipped": skipped, "total": total }),
    );

    Ok(tracks)
}

#[tauri::command]
pub async fn delete_track(app: AppHandle, track_id: i64) -> Result<(), String> {
    let tracks = database::get_tracks(&app, None, None, None, None).map_err(|e| e.to_string())?;
    let track = tracks
        .into_iter()
        .find(|t| t.id == track_id)
        .ok_or_else(|| i18n::t("error.track.not_found"))?;

    if let Some(file_path) = &track.file_path {
        let _ = std::fs::remove_file(file_path);
    }

    database::delete_track(&app, track_id).map_err(|e| e.to_string())?;
    let _ = app.emit("track:deleted", serde_json::json!({ "trackId": track_id }));
    Ok(())
}

#[tauri::command]
pub async fn delete_local_file(app: AppHandle, track_id: i64) -> Result<(), String> {
    let tracks = database::get_tracks(&app, None, None, None, None).map_err(|e| e.to_string())?;
    let track = tracks
        .into_iter()
        .find(|t| t.id == track_id)
        .ok_or_else(|| i18n::t("error.track.not_found"))?;

    if let Some(file_path) = &track.file_path {
        match std::fs::remove_file(file_path) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => {
                eprintln!("Failed to delete file: {}", e);
                return Err(i18n::t("error.file.delete_failed"));
            }
        }
    }

    database::delete_local_file(&app, track_id).map_err(|e| e.to_string())?;
    let _ = app.emit("library:updated", serde_json::json!({}));
    Ok(())
}

#[tauri::command]
pub async fn download_track(app: AppHandle, track_id: i64) -> Result<(), String> {
    let track = database::get_tracks(&app, None, None, None, None)
        .map_err(|e| e.to_string())?
        .into_iter()
        .find(|t| t.id == track_id)
        .ok_or_else(|| i18n::t("error.track.not_found"))?;

    let download_folder = resolve_download_folder(&app)?;
    std::fs::create_dir_all(&download_folder).map_err(|e| e.to_string())?;

    let template = format!(
        "{}/%(title).120s.%(ext)s",
        download_folder.to_string_lossy()
    );

    let file_path = match ytdlp::download_audio(&app, &track.source_url, &template, track_id).await {
        Ok(path) => path,
        Err(e) => {
            let _ = app.emit("track:download-error", serde_json::json!({ "trackId": track_id, "error": e }));
            return Err(e);
        }
    };
    database::update_track_file(&app, track_id, &file_path).map_err(|e| e.to_string())?;
    let _ = app.emit(
        "track:download-complete",
        serde_json::json!({ "trackId": track_id, "filePath": file_path }),
    );
    Ok(())
}

#[tauri::command]
pub async fn get_stream_url(app: AppHandle, track_id: i64) -> Result<String, String> {
    let track = database::get_tracks(&app, None, None, None, None)
        .map_err(|e| e.to_string())?
        .into_iter()
        .find(|t| t.id == track_id)
        .ok_or_else(|| i18n::t("error.track.not_found"))?;

    let cache_hours: i64 = app
        .store("settings.json")
        .ok()
        .and_then(|s| s.get("streamUrlCacheHours"))
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(5);

    let now = Utc::now().timestamp();
    if let (Some(url), Some(ts)) = (&track.stream_url, track.stream_url_ts) {
        if now - ts < cache_hours * 3600 {
            return Ok(url.clone());
        }
    }

    let stream_url = ytdlp::get_stream_url(&app, &track.source_url).await?;
    database::update_track_stream_url(&app, track_id, &stream_url).map_err(|e| e.to_string())?;
    let _ = app.emit("track:stream-resolved", serde_json::json!({ "trackId": track_id, "streamUrl": stream_url }));
    Ok(stream_url)
}

#[tauri::command]
pub async fn invalidate_stream_url(app: AppHandle, track_id: i64) -> Result<(), String> {
    database::invalidate_track_stream_url(&app, track_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cancel_add_track() -> Result<(), String> {
    if let Some(flag) = CANCEL_FLAG.lock().unwrap().as_ref() {
        flag.store(true, Ordering::SeqCst);
    }
    if let Some(child) = CHILD_SLOT.lock().unwrap().take() {
        let _ = child.kill();
    }
    Ok(())
}

fn resolve_download_folder(app: &AppHandle) -> Result<PathBuf, String> {
    let stored = app
        .store("settings.json")
        .ok()
        .and_then(|s| s.get("downloadFolder"))
        .and_then(|v| v.as_str().map(|s| s.to_string()));

    match stored {
        Some(s) if !s.is_empty() && !s.starts_with('$') => Ok(PathBuf::from(s)),
        _ => app
            .path()
            .audio_dir()
            .map(|d| d.join("buni-player"))
            .or_else(|_| app.path().app_data_dir().map(|d| d.join("downloads")))
            .map_err(|e| e.to_string()),
    }
}