import { FolderOpen, Settings } from "lucide-react";
import type { VideoInfo } from "@/types/video";

type NvencState = "checking" | "available" | "unavailable" | "error";

type TopBarProps = {
  nvenc: NvencState;
  video: VideoInfo | null;
  onOpen: () => void;
};

export function TopBar({ nvenc, video, onOpen }: TopBarProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-bg-surface px-5">
      <div className="flex min-w-0 items-center gap-4">
        <h1 className="shrink-0 text-base font-semibold tracking-tight">
          <span className="text-accent">Shorts</span> Maker
        </h1>
        <div className="min-w-0 truncate text-sm">
          {video ? (
            <span className="font-medium text-fg">{video.filename}</span>
          ) : (
            <span className="text-fg-muted">no video loaded</span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <NvencBadge state={nvenc} />
        <button
          type="button"
          aria-label="Settings"
          className="rounded-md p-2 text-fg-muted transition hover:bg-bg-hover hover:text-fg"
        >
          <Settings className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onOpen}
          className="flex items-center gap-2 rounded-md border border-border bg-bg-elevated px-3 py-1.5 text-sm text-fg transition hover:border-border-strong hover:bg-bg-hover"
        >
          <FolderOpen className="h-4 w-4" />
          <span>Open</span>
        </button>
      </div>
    </header>
  );
}

function NvencBadge({ state }: { state: NvencState }) {
  const label =
    state === "checking"
      ? "probing…"
      : state === "available"
        ? "NVENC"
        : state === "unavailable"
          ? "x264"
          : "NVENC ?";
  const tone =
    state === "available"
      ? "text-success"
      : state === "unavailable"
        ? "text-warning"
        : state === "error"
          ? "text-danger"
          : "text-fg-muted";
  return (
    <span
      className={`rounded border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-wider ${tone}`}
      title={`Encoder probe: ${state}`}
    >
      {label}
    </span>
  );
}
