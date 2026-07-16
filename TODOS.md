# Buni Player — Todos

> **Fecha:** 2026-06-22  
> **Propósito:** Única fuente de verdad para el progreso del proyecto.  
> PLAN.md es el documento de referencia y especificación.

---

## Convenciones

- `[x]` — completado
- `[~]` — parcial / implementado con diferencias respecto al plan
- `[ ]` — pendiente
- `[–]` — no aplica / cancelado

---

## Fase 1 — Esqueleto funcional

- [x] Crear proyecto Tauri v2 + React + Vite + TypeScript
- [x] Tailwind CSS v4 configurado
- [x] Plugins Tauri instalados: shell, store, deep-link, single-instance, opener
- [x] yt-dlp como sidecar en `tauri.conf.json`
- [x] Script `scripts/download-ytdlp.sh`
- [x] Sidecar Windows presente (`yt-dlp-x86_64-pc-windows-msvc.exe`)
- [x] Esquema SQLite + migración inicial (`migrations/001_init.sql`)
- [x] `add_track(url)`: metadata de yt-dlp, thumbnail, SQLite insert
- [x] `get_tracks()` con filtro modo, búsqueda y ordenamiento
- [x] `delete_track()`: borra archivo local + registro SQLite
- [x] `delete_local_file()`: borra archivo, vuelve a modo streaming
- [x] UI básica: input URL, top nav, track list, sidebar álbumes
- [x] Zustand stores: libraryStore, playerStore, settingsStore
- [x] Deep link `Buni Player://add?url=...` configurado y funcional
- [x] Detección de duplicados por `source_url`
- [x] **Eventos Tauri**: `track:added`, `track:deleted`, `track:download-error`, `track:stream-resolved`, `library:updated` emitidos desde Rust; hook `useTauriEvent` escucha y actualiza stores sin polling
- [x] **Manejo de errores**: mensajes traducidos vía i18n (es/en), stderr separado de mensajes al usuario
  - [~] URL no soportada — `has_video` y `source_site` clasifican contenido, pendiente `update_ytdlp` (Fase 5)
  - [x] Playlists rechazadas: `--no-playlist` + detección por conteo de líneas
  - [x] yt-dlp desactualizado — requiere `update_ytdlp` (Fase 5)
  - [x] yt-dlp binary no encontrado — mensaje amigable traducido

---

## Fase 2 — Reproductor y streaming

- [x] `download_track()`: descarga m4a con progreso vía eventos
- [x] Hook `useAudio`: carga, reproduce, eventos de audio
- [x] Player UI: play/pause, progreso, volumen, anterior/siguiente
- [x] Streaming: `get_stream_url` ? HTML5 `<audio>`
- [x] Local: `convertFileSrc()` ? HTML5 `<audio>`
- [x] Botón "Descargar" en tracks streaming
- [x] Progreso de descarga en UI (inline en TrackList)
- [x] Cola de reproducción: setQueue, addToQueue, removeFromQueue, moveInQueue
- [x] playerStore: shuffle, repeat (none/all/one), next/previous
- [x] Persistencia de cola en settings
- [x] `track_started` backend (Rust)
- [x] **Cache de stream URL**: `get_stream_url` chequea `streamUrlCacheHours` desde settings (default 5h). Frontend pre-resuelve 3 tracks siguientes con guard `preloadingRef`
- [x] **`track_started` desde frontend**: `useAudio` invoca `invokeTrackStarted` cuando `audio.currentTime >= 30` (vía `timeupdate`), una vez por track. Tracks < 30s cuentan al terminar (`ended`). Evento `track:played` actualiza `playCount` y `lastPlayed` en la UI en vivo
- [x] **Manejo errores de reproducción**: reintento para `MEDIA_ERR_NETWORK` (1x por track), offline detection (`navigator.onLine`), toast para errores permanentes, `loadSource` fallback con skip al siguiente, track local con archivo perdido ? cae a streaming automáticamente
- [–] **Centralizar inicio de reproducción en `useAudio`** — cancelado. El patrón actual (componentes setean store ? hook reacciona) es correcto. Los motivos originales (track_started, errores, cache) ya están cubiertos en useAudio.

---

## Fase 3 — Biblioteca completa ?

- [x] TrackList (vista compacta con columnas: #, título, artista, álbum, scrobbles, modo, duración)
- [x] Búsqueda por título, artista, álbum (con `useDeferredValue`)
- [x] Filtros: Todos / Streaming / Local
- [x] Ordenamiento: fecha (asc/desc), último reproducido, artista (A-Z/Z-A), álbum
- [x] Toast notifications (toastStore)
- [x] Dropdown genérico reutilizable (Dropdown.tsx)
- [x] QueuePanel (reordenable, auto-scroll, eliminar individual)
- [x] ~~AlbumNav~~ PlaylistSidebar (sidebar con playlists: global "Biblioteca" + custom, crear inline, imagen auto del primer track, X para borrar)
- [x] Persistencia de UI (filter/sort state en settings)
- [x] **Panel de información del track** (TrackInfo en RightPanel, accesible desde imagen en Player)
- [x] **Vista descargas activas** (DownloadList en RightPanel, botón ? en TopNav con badge)
- [–] **TrackGrid** — reemplazado por AlbumGrid (Fase 6)
- [–] **Botón "Refrescar metadatos"** — descartado (requiere Last.fm, pendiente scrobbling)

---

## Last.fm — Enriquecimiento de metadatos ?

**Objetivo:** Mejorar metadatos de tracks agregados (título, artista, álbum, tags, carátula) usando la API de Last.fm.

- [x] **Rust: `models/lastfm.rs`** — structs para respuestas de la API (LastfmTrackInfo, LastfmArtistInfo, LastfmAlbumInfo)
- [x] **Rust: `services/lastfm_client.rs`** — cliente HTTP con rate limit (~200ms entre requests) + cache en `lastfm_cache`
- [x] **Rust: `services/database.rs`** — funciones `get_cache()`, `set_cache()` para `lastfm_cache`
- [x] **Rust: `commands/lastfm.rs`** — `lastfm_enrich_track` + `enrich_metadata` interno
- [x] **Rust: `commands/tracks.rs`** — `add_track` llama a `enrich_metadata` después de yt-dlp si `lastfm_enabled` y hay API key
- [x] **i18n** — mensajes de error para Last.fm (sin API key, sin resultados, timeout)
- [x] **Config** — validación de API key en settings, botón "Probar conexión"
- [x] **Frontend**: hook `useLastfmArtistInfo`, servicio `lastfm.ts`, UI de artista en TrackInfo

---

## Fase 5 — Pulido y empaquetado

- [–] **Cola de descargas concurrentes** (max 3 simultáneas, planificado en `max_concurrent_downloads`)
- [x] **Actualización de yt-dlp desde la app** — comando directo (GitHub API ? download ? reemplazar sidecar)
- [x] **Settings UI**: panel Last.fm + yt-dlp + carpeta descargas + selector idioma con i18n frontend completo
- [x] **Sidecars multiplataforma**: macOS (x64 + ARM), Linux (gnu + musl)
- [x] **Animaciones y transiciones** en la UI
- [x] **Edge cases**: archivos eliminados del disco (cae a streaming reactivamente), yt-dlp no encontrado en runtime (i18n)
- [x] **Build**: Windows (ZIP portable), macOS (ZIP .app), Linux (.AppImage + .deb) — config + CI + README
- [~] **Iconos y branding** de la app — placeholders de Tauri existen, falta artwork custom y metadatos de producto

---

## Fase 6 — Futuro (post-MVP)

- [x] Integración Last.fm completa (enriquecimiento de metadatos)
- [ ] Scrobbling a Last.fm (requiere OAuth)
- [ ] Soporte mp3 con ffmpeg
- [ ] Listas de reproducción personalizadas
- [ ] Importar/exportar biblioteca
- [ ] MusicBrainz Cover Art Archive para carátulas HD
- [ ] Modo "Descubrir" basado en artistas similares
- [ ] Soporte para más sitios (vía yt-dlp)
- [ ] Temas personalizados
- [ ] Estadísticas de escucha
- [ ] Backup automático de BD

---

## Instalaciones pendientes

### Frontend (npm)

| Paquete | Propósito | Prioridad |
|---|---|---|
| `lucide-react` | Iconos (hoy se usan emojis/unicode) | Media |
| `@tauri-apps/plugin-fs` | Acceso a sistema de archivos | Baja (Fase 5) |
| `i18next` + `react-i18next` | i18n frontend (es/en) | Hecho |

### Backend (Cargo)

| Paquete | Propósito | Prioridad |
|---|---|---|
| `tauri-plugin-fs` | Acceso a sistema de archivos | Baja (Fase 5) |

---

## Métricas de éxito del MVP

| Métrica | Objetivo | Estado actual |
|---|---|---|
| Agregar track desde URL | < 5s | ? ~2-3s |
| Reproducir track streaming | < 3s desde clic | ? ~1-2s |
| Descargar track | Progreso visible | ? |
| Cambio streaming ? local | Sin interrupción | ? |
| Búsqueda en biblioteca | < 200ms / 1000 tracks | ? instantáneo |
| Memoria en reposo | < 150MB | ? |
| Tamaño instalador | < 30MB (sin yt-dlp) | ? |