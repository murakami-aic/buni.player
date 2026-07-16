import { ListMusic } from "lucide-react";

export function PlaylistMosaic() {
  return (
    <div className="flex h-full w-full items-center justify-center rounded bg-accent/80">
      <ListMusic className="text-muted w-full h-full aspect-square" fill="currentColor" />
    </div>
  );
}
