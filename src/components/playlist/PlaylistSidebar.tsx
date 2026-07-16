import { Plus, Heart } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePlaylistStore, GLOBAL_PLAYLIST_ID } from "../../stores/playlistStore";
import { Dropdown } from "../ui/Dropdown";
import { PlaylistMosaic } from "./PlaylistMosaic";

export function PlaylistSidebar() {
  const { t } = useTranslation();
  const playlists = usePlaylistStore((state) => state.playlists);
  const selectPlaylist = usePlaylistStore((state) => state.selectPlaylist);
  const createPlaylist = usePlaylistStore((state) => state.createPlaylist);


  const handleCreate = (name: string) => {
    if (name.trim()) {
      createPlaylist(name.trim());
    }
  };

  return (
    <div className="flex w-(--sidebar-w) flex-col layout-component transition-[width] duration-150">
      <div className="flex flex-col items-center py-2">
        <Dropdown
          align="right"
          trigger={
            <button type="button" className="flex items-center justify-center cursor-pointer h-10 aspect-square rounded-full bg-neutral text-neutral-foreground hover:scale-105">
              <Plus />
            </button>
          }
          items={[
            {
              label: t("sidebar.new_playlist"),
              icon: <Plus size={14} />,
              onClick: () => handleCreate(t("sidebar.new_playlist_default")),
            },
          ]}
        />

      </div>



      <nav className="flex flex-col gap-y-2 overflow-y-auto scroll-area py-2">

        <button
          type="button"
          onClick={() => selectPlaylist(GLOBAL_PLAYLIST_ID)}
          className={`cursor-pointer ml-3 mr-1 rounded-md w-[calc(100%-1rem)] aspect-square hover:scale-105 bg-accent/80`}
          title={t("sidebar.library")}
        >
          <Heart className="text-muted w-full h-full aspect-square" fill="currentColor" />
        </button>

        {playlists.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => selectPlaylist(p.id)}
            className={`cursor-pointer ml-3 mr-1 rounded-md w-[calc(100%-1rem)] aspect-square hover:scale-105`}
            title={`${p.name} (${p.trackCount})`}
          >
            <PlaylistMosaic />
          </button>
        ))}
      </nav>
    </div>
  );
}
