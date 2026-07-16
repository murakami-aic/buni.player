# Buni Player

Un reproductor de música (proximamente video) simple y rápido. Introduce una URL y escucha al instante, o descarga para escuchar sin conexión. Sin anuncios, sin suscripciones.

## Primeros pasos

### Agregá tu primera canción

1. Copiá la URL de una canción de cualquiera de los cientos de sitios soportados
2. Pegala en la barra de búsqueda de la app y presioná Enter
3. La app obtiene título, artista, carátula y álbum automáticamente. Dale play.

### Metadatos enriquecidos (opcional)

Conectá tu cuenta de Last.fm para mejorar los metadatos de cada track:

1. Andá a **Ajustes** > **Last.fm**
2. Pegá tu [API key gratuita](https://www.last.fm/api)
3. Probá la conexión y activá el enriquecimiento

La app completa automáticamente tags de género, carátulas HD e info del artista.

### Mantenete al día

yt-dlp se actualiza seguido para mantenerse compatible con los sitios. Cada tanto, entrá a **Ajustes** > **Actualizar yt-dlp** para tener la última versión. Si alguna URL falla al agregarse, probablemente necesite una actualización.

## Qué hace

- **Agregá música desde cualquier plataforma** — soporta cientos de sitios. Pegá una URL y la app obtiene título, artista, álbum y carátula automáticamente
- **Streaming instantáneo** — escuchá sin descargar
- **Descarga offline** — bajá tus tracks en un clic, escuchalos sin conexión
- **Enriquecimiento con Last.fm** — metadatos mejorados, tags de género, carátulas HD, info del artista
- **Interfaz en español e inglés** — cambia de idioma desde Ajustes
- **Cola de reproducción** — arrastrá y reordená, shuffle, repetición
- **Sin anuncios, sin tracking** — es solo tu música

## Próximamente

- Scrobbling a Last.fm
- Soporte mp3
- Estadísticas de escucha
- Modo descubrimiento por artistas similares
- Soporte para más fuentes de audio

## Instalación

### Windows

Copia y pega esto en el Terminal:

```powershell
$url = "https://github.com/murakami-aic/buni.player/releases/latest/download/buni-x86_64-pc-windows-msvc.zip"
$dir = "$env:LOCALAPPDATA\buni"
Invoke-WebRequest -Uri $url -OutFile "$env:TEMP\buni.zip"
Expand-Archive -Force "$env:TEMP\buni.zip" -DestinationPath $dir
Start-Process "$dir\buni.player.exe"
```

Después de la primera vez, ejecuta `$env:LOCALAPPDATA\buni\buni.player.exe` para abrir la app.

### macOS

Apple Silicon:

```bash
curl -Lo /tmp/buni.zip "https://github.com/murakami-aic/buni.player/releases/latest/download/buni-aarch64-apple-darwin.zip"
unzip -o /tmp/buni.zip -d /Applications/
xattr -cr /Applications/buni.player.app
open /Applications/buni.player.app
```

Intel:

```bash
curl -Lo /tmp/buni.zip "https://github.com/murakami-aic/buni.player/releases/latest/download/buni-x86_64-apple-darwin.zip"
unzip -o /tmp/buni.zip -d /Applications/
xattr -cr /Applications/buni.player.app
open /Applications/buni.player.app
```

### Linux

AppImage (recomendado):

```bash
curl -Lo buni "https://github.com/murakami-aic/buni.player/releases/latest/download/buni-x86_64-unknown-linux-gnu.AppImage"
chmod +x buni && ./buni
```

O con deb:

```bash
curl -LO "https://github.com/murakami-aic/buni.player/releases/latest/download/buni-x86_64-unknown-linux-gnu.deb"
sudo dpkg -i buni-x86_64-unknown-linux-gnu.deb
```

## Desarrollo

```bash
git clone https://github.com/murakami-aic/buni.player.git
cd buni.player
npm install
npm run tauri dev
```

Requiere [yt-dlp](https://github.com/yt-dlp/yt-dlp) como sidecar. Ejecutá `bash scripts/download-ytdlp.sh` para descargar los binarios de cada plataforma.
