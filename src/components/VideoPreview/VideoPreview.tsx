import { forwardRef } from "react";
import { Film, Play, Pause, Volume2, Volume1, VolumeX } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { formatHMSms } from "@/lib/time";
import type { VideoInfo } from "@/types/video";

type VideoPreviewProps = {
  video: VideoInfo | null;
  isPlaying: boolean;
  currentTime: number;
  volume: number;
  onTogglePlay: () => void;
  onTimeUpdate: (t: number) => void;
  onLoadedMetadata: () => void;
  onVolumeChange: (v: number) => void;
  onToggleMute: () => void;
};

export const VideoPreview = forwardRef<HTMLVideoElement, VideoPreviewProps>(
  function VideoPreview(
    {
      video,
      isPlaying,
      currentTime,
      volume,
      onTogglePlay,
      onTimeUpdate,
      onLoadedMetadata,
      onVolumeChange,
      onToggleMute,
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
        <div className="flex shrink-0 items-center gap-3 border-t border-border bg-bg-surface px-4 py-2">
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
          <div className="font-mono text-xs text-fg-muted text-mono-tabular">
            {formatHMSms(currentTime)} / {formatHMSms(video.duration)}
          </div>

          <VolumeControl
            volume={volume}
            onVolumeChange={onVolumeChange}
            onToggleMute={onToggleMute}
          />

          <div className="ml-auto text-[10px] font-mono uppercase tracking-wider text-fg-subtle">
            Space play/pause · I = IN · O = OUT
          </div>
        </div>
      </div>
    );
  },
);

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
