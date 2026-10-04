use crate::models::track::Track;
use crate::services::innertube::VideoMetadata;
use crate::services::{database, i18n, innertube, lastfm_client};
use chrono::Utc;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::LazyLock;
use std::sync::{Arc, Mutex};
use std::{collections::HashMap, time::Duration};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_store::StoreExt;

static CANCEL_FLAG: Mutex<Option<Arc<AtomicBool>>> = Mutex::new(None);
static DOWNLOAD_CANCEL_FLAGS: LazyLock<Mutex<HashMap<i64, Arc<AtomicBool>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

struct DownloadCancellationGuard(i64);

impl Drop for DownloadCancellationGuard {
    fn drop(&mut self) {
        if let Ok(mut flags) = DOWNLOAD_CANCEL_FLAGS.lock() {
            flags.remove(&self.0);
        }
    }
}

async fn wait_until_cancelled(flag: Arc<AtomicBool>) {
    while !flag.load(Ordering::Relaxed) {
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
}

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
    let use_flat_playlist = app
        .store("settings.json")
        .ok()
        .and_then(|s| s.get("lastfmApiKey"))
        .and_then(|v| v.as_str().map(|s| !s.is_empty()))
        .unwrap_or(false);
    let metadata_result = tokio::select! {
        _ = wait_until_cancelled(cancel_flag.clone()) => Err("cancelled".to_string()),
        result = innertube::get_metadata(&source_url, no_playlist, use_flat_playlist) => result,
    };

    let metadata_list = match metadata_result {
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
        return Err(i18n::t("error.innertube.no_results"));
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
            match innertube::download_thumbnail(&app, &url, id).await {
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
                        track.duration = track.duration.or(enriched.duration);
                        track.lastfm_url = enriched.lastfm_url;
                        track.lastfm_id = enriched.lastfm_id;
                        let _ = app.emit(
                            "track:enriched",
                            serde_json::json!({ "trackId": id, "disc": false }),
                        );
                    }
                    Err(e) => {
                        eprintln!("Last.fm enrichment failed for #{}: {e}", id);
                        let _ = app.emit(
                            "track:enrich-error",
                            serde_json::json!({ "trackId": id, "error": e }),
                        );
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
    let cancel_flag = Arc::new(AtomicBool::new(false));
    {
        let mut flags = DOWNLOAD_CANCEL_FLAGS.lock().map_err(|e| e.to_string())?;
        if flags.contains_key(&track_id) {
            return Err("This track is already downloading".to_string());
        }
        flags.insert(track_id, cancel_flag.clone());
    }
    let _guard = DownloadCancellationGuard(track_id);

    match download_track_inner(&app, track_id, cancel_flag).await {
        Ok(file_path) => {
            database::update_track_file(&app, track_id, &file_path).map_err(|e| e.to_string())?;
            let _ = app.emit(
                "track:download-complete",
                serde_json::json!({ "trackId": track_id, "filePath": file_path }),
            );
            Ok(())
        }
        Err(error) if error == "cancelled" => {
            let _ = app.emit(
                "track:download-cancelled",
                serde_json::json!({ "trackId": track_id }),
            );
            Ok(())
        }
        Err(error) => {
            let _ = app.emit(
                "track:download-error",
                serde_json::json!({ "trackId": track_id, "error": error }),
            );
            Err(error)
        }
    }
}

async fn download_track_inner(
    app: &AppHandle,
    track_id: i64,
    cancel_flag: Arc<AtomicBool>,
) -> Result<String, String> {
    let track = database::get_tracks(&app, None, None, None, None)
        .map_err(|e| e.to_string())?
        .into_iter()
        .find(|t| t.id == track_id)
        .ok_or_else(|| i18n::t("error.track.not_found"))?;

    let download_folder = resolve_download_folder(&app)?;
    std::fs::create_dir_all(&download_folder).map_err(|e| e.to_string())?;

    let mut filename = sanitize_filename::sanitize(&track.title);
    filename = filename.chars().take(120).collect();
    if filename.trim().is_empty() {
        filename = format!("track-{}", track.id);
    }

    let mut destination = download_folder.join(format!("{filename}.m4a"));
    let mut suffix = 1;
    while destination.exists() {
        destination = download_folder.join(format!("{filename} ({suffix}).m4a"));
        suffix += 1;
    }

    let mut resolved = innertube::resolve(&track.source_url).await?;
    for attempt in 0..3 {
        match innertube::download(
            app,
            &resolved.stream_url,
            &destination,
            track_id,
            resolved.bytes,
            resolved.user_agent,
            cancel_flag.clone(),
        )
        .await
        {
            Ok(_) => break,
            Err(error) if error.contains("HTTP 403") && attempt < 2 => {
                resolved =
                    innertube::resolve_after(&track.source_url, resolved.client_name).await?;
            }
            Err(error) => return Err(error),
        }
    }

    destination
        .to_str()
        .map(str::to_owned)
        .ok_or_else(|| "Invalid download path".to_string())
}

#[tauri::command]
pub async fn get_stream_url(app: AppHandle, track_id: i64) -> Result<String, String> {
    get_direct_stream_url(&app, track_id).await?;
    Ok(format!("buni-audio://localhost/{track_id}"))
}

pub(crate) async fn get_direct_stream_url(
    app: &AppHandle,
    track_id: i64,
) -> Result<String, String> {
    let track = database::get_tracks(&app, None, None, None, None)
        .map_err(|e| e.to_string())?
        .into_iter()
        .find(|t| t.id == track_id)
        .ok_or_else(|| i18n::t("error.track.not_found"))?;

    let now = Utc::now().timestamp();
    if let (Some(url), Some(ts)) = (&track.stream_url, track.stream_url_ts) {
        if innertube::is_supported_stream_url(url) && innertube::cached_url_is_fresh(url, ts, now) {
            return Ok(url.clone());
        }
    }

    let resolved = innertube::resolve(&track.source_url).await?;
    let stream_url = resolved.stream_url.clone();
    database::update_track_stream_url(&app, track_id, &stream_url).map_err(|e| e.to_string())?;
    Ok(stream_url)
}

pub(crate) async fn get_direct_stream_url_after_client(
    app: &AppHandle,
    track_id: i64,
    client_name: &str,
) -> Result<String, String> {
    let track = database::get_tracks(app, None, None, None, None)
        .map_err(|e| e.to_string())?
        .into_iter()
        .find(|track| track.id == track_id)
        .ok_or_else(|| i18n::t("error.track.not_found"))?;
    let resolved = innertube::resolve_after(&track.source_url, client_name).await?;
    database::update_track_stream_url(app, track_id, &resolved.stream_url)
        .map_err(|e| e.to_string())?;
    Ok(resolved.stream_url)
}

#[tauri::command]
pub async fn invalidate_stream_url(app: AppHandle, track_id: i64) -> Result<(), String> {
    database::invalidate_track_stream_url(&app, track_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_track(
    app: AppHandle,
    track_id: i64,
    title: String,
    artist: Option<String>,
    album: Option<String>,
    duration: Option<i64>,
) -> Result<Track, String> {
    database::update_track_metadata(
        &app,
        track_id,
        &title,
        artist.as_deref(),
        album.as_deref(),
        duration,
    )
    .map_err(|e| e.to_string())?;

    let updated = database::get_tracks(&app, None, None, None, None)
        .map_err(|e| e.to_string())?
        .into_iter()
        .find(|t| t.id == track_id)
        .ok_or_else(|| i18n::t("error.track.not_found"))?;

    let _ = app.emit("library:updated", serde_json::json!({}));
    Ok(updated)
}

#[tauri::command]
pub async fn search_youtube(
    query: String,
    limit: Option<u32>,
) -> Result<Vec<VideoMetadata>, String> {
    let limit = limit.unwrap_or(10);
    let results = innertube::search(&query, limit).await?;
    Ok(results)
}

#[tauri::command]
pub fn cancel_add_track() -> Result<(), String> {
    if let Some(flag) = CANCEL_FLAG.lock().unwrap().as_ref() {
        flag.store(true, Ordering::SeqCst);
    }
    Ok(())
}

#[tauri::command]
pub fn cancel_download(track_id: i64) -> Result<(), String> {
    if let Some(flag) = DOWNLOAD_CANCEL_FLAGS
        .lock()
        .map_err(|e| e.to_string())?
        .get(&track_id)
    {
        flag.store(true, Ordering::SeqCst);
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
