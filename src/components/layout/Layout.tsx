import { PlaylistSidebar } from "../playlist/PlaylistSidebar";
import { Player } from "../player/Player";
import { RightPanel } from "./RightPanel";
import { Settings } from "../user/Settings";
import { TopNav } from "./TopNav";
import { TrackList } from "../track/TrackList";
import { ToastContainer } from "../ui/Toast";
import { useSettingsStore } from "../../stores/settingsStore";

export function Layout() {
  const panelView = useSettingsStore((state) => state.panelView);
  const setPanelView = useSettingsStore((state) => state.setPanelView);
  const mainView = useSettingsStore((state) => state.mainView);

  return (
    <div className="flex w-full h-screen flex-col overflow-hidden bg-background text-foreground glass">

      <TopNav />

      <div className="flex flex-1 gap-2 overflow-hidden ml-2 py-2">
        <PlaylistSidebar />

        {mainView === "settings" ? <Settings /> : <TrackList />}

        <aside
          className={`shrink-0 overflow-hidden rounded-md ${panelView ? "w-(--rightpanel-w)" : "w-10 hover:bg-accent-list"}`}>
          <RightPanel view={panelView} onClose={() => setPanelView(null)} />
        </aside>
      </div>

      <Player />
      <ToastContainer />
    </div>
  );
}
