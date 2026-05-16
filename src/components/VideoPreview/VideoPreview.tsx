import { forwardRef } from "react";
import {
  Film,
  Play,
  Pause,
  Volume2,
  Volume1,
  VolumeX,
  Repeat,
} from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { formatHMSms } from "@/lib/time";
import type { VideoInfo } from "@/types/video";

type VideoPreviewProps = {
  video: VideoInfo | null;
  isPlaying: boolean;
  currentTime: number;
  volume: number;
  loopMode: boolean;
  onTogglePlay: () => void;
  onTimeUpdate: (t: number) => void;
  onLoadedMetadata: () => void;
  onVolumeChange: (v: number) => void;
  onToggleMute: () => void;
  onSetIn: () => void;
  onSetOut: () => void;
  onToggleLoop: () => void;
};

export const VideoPreview = forwardRef<HTMLVideoElement, VideoPreviewProps>(
  function VideoPreview(
    {
      video,
      isPlaying,
      currentTime,
      volume,
      loopMode,
      onTogglePlay,
      onTimeUpdate,
      onLoadedMetadata,
      onVolumeChange,
      onToggleMute,
      onSetIn,
      onSetOut,
      onToggleLoop,
    },
    ref,
  ) {
    if (!video) {
      return (
        <div className="flex flex-1 items-center justify-center bg-bg-base p-6">
          <div className="flex aspect-video w-full max-w-3xl flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-bg-surface text-fg-subtle">
            <Film className="h-10 w-10 opacity-50" />
            <p className="mt-3 text-sm">Drop a video here</p>
            <p className="mt-1 text-xs text-fg-subtle">
              mp4, mov, mkv, avi, webm, m4v · or click{" "}
              <span className="text-fg-muted">Open</span>
            </p>
          </div>
        </div>
      );
    }

    const src = convertFileSrc(video.path);
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-bg-base">
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4">
          <video
            ref={ref}
            src={src}
            className="block max-h-full max-w-full rounded object-contain shadow-2xl"
            onTimeUpdate={(e) => onTimeUpdate(e.currentTarget.currentTime)}
            onLoadedMetadata={onLoadedMetadata}
            preload="auto"
          />
        </div>
        <div className="flex shrink-0 items-center gap-2 border-t border-border bg-bg-surface px-4 py-2">
          <button
            type="button"
            onClick={onTogglePlay}
            className="flex h-9 w-9 items-center justify-center rounded-md bg-bg-elevated text-fg transition hover:bg-bg-hover"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="ml-0.5 h-4 w-4" />
            )}
          </button>

          <MarkButton
            kind="in"
            onClick={onSetIn}
            title="Mark IN at playhead (I)"
          />
          <MarkButton
            kind="out"
            onClick={onSetOut}
            title="Mark OUT at playhead (O)"
          />

          <button
            type="button"
            onClick={onToggleLoop}
            title="Loop between IN and OUT (L)"
            aria-label="Toggle loop between IN and OUT"
            aria-pressed={loopMode}
            className={`flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-xs font-bold transition ${
              loopMode
                ? "border-accent bg-accent/15 text-accent"
                : "border-border bg-bg-elevated text-fg-muted hover:bg-bg-hover hover:text-fg"
            }`}
          >
            <Repeat className="h-3.5 w-3.5" />
            <span className="font-mono uppercase tracking-wider">loop</span>
          </button>

          <div className="ml-2 font-mono text-xs text-fg-muted text-mono-tabular">
            {formatHMSms(currentTime)} / {formatHMSms(video.duration)}
          </div>

          <VolumeControl
            volume={volume}
            onVolumeChange={onVolumeChange}
            onToggleMute={onToggleMute}
          />

          <div className="ml-auto text-[10px] font-mono uppercase tracking-wider text-fg-subtle">
            Space · I · O · L · ←/→
          </div>
        </div>
      </div>
    );
  },
);

function MarkButton({
  kind,
  onClick,
  title,
}: {
  kind: "in" | "out";
  onClick: () => void;
  title: string;
}) {
  const isIn = kind === "in";
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`group flex h-9 items-center gap-1.5 rounded-md border bg-bg-elevated px-2.5 text-xs font-bold transition hover:bg-bg-hover ${
        isIn
          ? "border-in/30 text-in hover:border-in/60"
          : "border-out/30 text-out hover:border-out/60"
      }`}
    >
      <BracketIcon side={kind} />
      <span className="font-mono uppercase tracking-wider">
        {isIn ? "in" : "out"}
      </span>
    </button>
  );
}

function BracketIcon({ side }: { side: "in" | "out" }) {
  // Square-bracket icons matching common NLE conventions:
  // IN  →  ▌▔▔   (vertical bar on left + top/bottom edges going right)
  // OUT →  ▔▔▐   (vertical bar on right + top/bottom edges going left)
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
    >
      {side === "in" ? (
        <path d="M4 3 L4 13 M4 3 L9 3 M4 13 L9 13" />
      ) : (
        <path d="M12 3 L12 13 M12 3 L7 3 M12 13 L7 13" />
      )}
    </svg>
  );
}

function VolumeControl({
  volume,
  onVolumeChange,
  onToggleMute,
}: {
  volume: number;
  onVolumeChange: (v: number) => void;
  onToggleMute: () => void;
}) {
  const muted = volume === 0;
  const Icon = muted ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const percent = Math.round(volume * 100);
  return (
    <div className="ml-3 flex items-center gap-2">
      <button
        type="button"
        onClick={onToggleMute}
        className={`flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-bg-hover ${
          muted ? "text-danger" : "text-fg-muted hover:text-fg"
        }`}
        aria-label={muted ? "Unmute" : "Mute"}
        title={muted ? "Unmute" : `Mute (${percent}%)`}
      >
        <Icon className="h-4 w-4" />
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={volume}
        onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
        className="h-1 w-24 cursor-pointer accent-accent"
        aria-label="Preview volume"
        title={`Volume ${percent}%`}
      />
    </div>
  );
}
