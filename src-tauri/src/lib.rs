mod commands;
mod models;
mod services;

use services::i18n;
use tauri::{Emitter, Manager};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_store::StoreExt;

const AUDIO_PROXY_MAX_ATTEMPTS: usize = 4;

fn audio_protocol_error(
    status: tauri::http::StatusCode,
    message: &str,
) -> tauri::http::Response<Vec<u8>> {
    tauri::http::Response::builder()
        .status(status)
        .header(
            tauri::http::header::CONTENT_TYPE,
            "text/plain; charset=utf-8",
        )
        .header(tauri::http::header::CACHE_CONTROL, "no-store")
        .body(message.as_bytes().to_vec())
        .unwrap_or_else(|_| tauri::http::Response::new(Vec::new()))
}

async fn serve_track_audio(
    app: &tauri::AppHandle,
    track_id: i64,
    request: &tauri::http::Request<Vec<u8>>,
) -> tauri::http::Response<Vec<u8>> {
    let mut stream_url = match commands::tracks::get_direct_stream_url(app, track_id).await {
        Ok(url) => url,
        Err(error) => {
            return audio_protocol_error(tauri::http::StatusCode::BAD_GATEWAY, &error);
        }
    };

    for attempt in 0..AUDIO_PROXY_MAX_ATTEMPTS {
        let response = services::innertube::audio_protocol_response(&stream_url, request).await;
        let upstream_403 = response.status() == tauri::http::StatusCode::BAD_GATEWAY
            && String::from_utf8_lossy(response.body()).contains("HTTP 403");
        if !upstream_403 || attempt + 1 == AUDIO_PROXY_MAX_ATTEMPTS {
            return response;
        }

        if attempt == 0 {
            let _ = services::database::invalidate_track_stream_url(app, track_id);
            match commands::tracks::get_direct_stream_url(app, track_id).await {
                Ok(url) => stream_url = url,
                Err(_) => return response,
            }
        } else {
            let client = services::innertube::client_name_for_stream_url(&stream_url);
            match commands::tracks::get_direct_stream_url_after_client(app, track_id, client).await
            {
                Ok(url) => stream_url = url,
                Err(_) => return response,
            }
        }
    }

    audio_protocol_error(
        tauri::http::StatusCode::BAD_GATEWAY,
        "Audio stream could not be resolved",
    )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .register_asynchronous_uri_scheme_protocol("buni-audio", |context, request, responder| {
            let app = context.app_handle().clone();
            tauri::async_runtime::spawn(async move {
                let track_id = request.uri().path().trim_matches('/').parse::<i64>();
                let response = match track_id {
                    Ok(track_id) => {
                        let response = serve_track_audio(&app, track_id, &request).await;
                        if response.status() == tauri::http::StatusCode::BAD_GATEWAY {
                            let error = String::from_utf8_lossy(response.body()).to_string();
                            let _ = app.emit(
                                "track:stream-proxy-error",
                                serde_json::json!({ "trackId": track_id, "error": error }),
                            );
                        }
                        response
                    }
                    Err(_) => audio_protocol_error(
                        tauri::http::StatusCode::BAD_REQUEST,
                        "Invalid track ID",
                    ),
                };
                responder.respond(response);
            });
        })
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = app
                .get_webview_window("main")
                .expect("no main window")
                .set_focus();
        }))
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            commands::tracks::get_tracks,
            commands::tracks::add_track,
            commands::tracks::delete_track,
            commands::tracks::delete_local_file,
            commands::tracks::download_track,
            commands::tracks::get_stream_url,
            commands::tracks::invalidate_stream_url,
            commands::tracks::cancel_add_track,
            commands::tracks::cancel_download,
            commands::tracks::update_track,
            commands::tracks::search_youtube,
            services::innertube::innertube_diagnose,
            commands::player::track_started,
            commands::playlists::get_playlists,
            commands::playlists::create_playlist,
            commands::playlists::delete_playlist,
            commands::playlists::add_to_playlist,
            commands::playlists::remove_from_playlist,
            commands::playlists::get_playlist_tracks,
            commands::playlists::update_playlist,
            commands::settings::get_setting,
            commands::settings::set_setting,
            commands::settings::set_language,
            commands::settings::get_platform,
            commands::settings::get_default_download_folder,
            commands::lastfm::lastfm_enrich_track,
            commands::lastfm::lastfm_search_track,
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            let lang = app
                .handle()
                .store("settings.json")
                .ok()
                .and_then(|store| store.get("lang"))
                .and_then(|v| v.as_str().map(|s| s.to_string()))
                .unwrap_or_else(|| "es".to_string());
            i18n::set_language(&lang);

            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    if url.scheme() == "buni" && url.host_str() == Some("add") {
                        if let Some((_, source_url)) =
                            url.query_pairs().find(|(key, _)| key == "url")
                        {
                            let _ = handle.emit("deep-link:add", source_url.to_string());
                        }
                    }
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
