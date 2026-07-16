# Buni Player

A simple and fast music (and soon video) player. Drop a URL and listen instantly, or download for offline playback. No ads, no subscriptions.

## Getting Started

### Add your first song

1. Copy a song URL from any of the hundreds of supported sites (automatic generated playlists are not supported)
2. Paste it into the app's search bar and press Enter
3. The app automatically fetches the title, artist, cover art, and album. Hit play.

### Rich metadata (optional)

Connect your Last.fm account to enhance each track's metadata:

1. Go to **Settings** > **Last.fm**
2. Paste your [free API key](https://www.last.fm/api)
3. Test the connection and enable enrichment

The app automatically fills in genre tags, HD cover art, and artist info.

### Cookies & age-restricted content

Some YouTube videos require age verification. The app handles these automatically:

- **Auto-detection** — on startup, Buni detects your installed browsers (Chrome, Edge, Firefox, etc.) and uses their YouTube cookies to authenticate. This works as long as you've logged into YouTube in that browser at least once.
- **Playlists** — if a playlist contains an age-restricted video and cookies are unavailable, that video is skipped and the rest of the playlist is imported. A notification tells you how many were skipped.
- **Manual override** — you can pick a specific browser in **Settings** > **Cookies browser**, or disable cookies entirely. Use **Detect** to re-scan for browsers at any time.

### Stay up to date

yt-dlp is updated frequently to stay compatible with sites. From time to time, go to **Settings** > **Update yt-dlp** to get the latest version. If a URL fails to add, it probably needs an update.

## Features

- **Add music from any platform** — supports hundreds of sites. Paste a URL and the app automatically fetches title, artist, album, and cover art
- **Instant streaming** — listen without downloading
- **Offline download** — download your tracks in one click, listen offline
- **Last.fm enrichment** — improved metadata, genre tags, HD cover art, artist info
- **Spanish and English interface** — switch languages from Settings
- **Play queue** — drag to reorder, shuffle, repeat
- **No ads, no tracking** — just your music
- **Age-restricted videos** — automatic cookie detection from your browser to access restricted content

## Coming Soon

- Last.fm scrobbling, lists, profile
- Searching inside app
- More audio/video formats support
- Listening statistics
- Discovery mode by similar artists
- Mobile support

## Installation

### Windows

Paste this in your terminal:

```powershell
$url = "https://github.com/murakami-aic/buni.player/releases/latest/download/buni-x86_64-pc-windows-msvc.zip"
$dir = "$env:LOCALAPPDATA\buni"
Invoke-WebRequest -Uri $url -OutFile "$env:TEMP\buni.zip"
Expand-Archive -Force "$env:TEMP\buni.zip" -DestinationPath $dir
Start-Process "$dir\buni.player.exe"
```

After the first time, run `$env:LOCALAPPDATA\buni\buni.player.exe` to open the app.

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

AppImage (recommended):

```bash
curl -Lo buni "https://github.com/murakami-aic/buni.player/releases/latest/download/buni-x86_64-unknown-linux-gnu.AppImage"
chmod +x buni && ./buni
```

Or with deb:

```bash
curl -LO "https://github.com/murakami-aic/buni.player/releases/latest/download/buni-x86_64-unknown-linux-gnu.deb"
sudo dpkg -i buni-x86_64-unknown-linux-gnu.deb
```

## Development

```bash
git clone https://github.com/murakami-aic/buni.player.git
cd buni.player
npm install
npm run tauri dev
```

Requires [yt-dlp](https://github.com/yt-dlp/yt-dlp) as a sidecar. Run `bash scripts/download-ytdlp.sh` to download the platform-specific binaries.
