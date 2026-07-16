mod commands;
mod models;
mod services;

use services::i18n;
use tauri::{Emitter, Manager};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_store::StoreExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
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
            services::ytdlp_update::get_ytdlp_version,
            services::ytdlp_update::update_ytdlp,
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