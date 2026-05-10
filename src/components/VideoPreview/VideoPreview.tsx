import { forwardRef } from "react";
import { Film, Play, Pause } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { formatHMSms } from "@/lib/time";
import type { VideoInfo } from "@/types/video";

type VideoPreviewProps = {
  video: VideoInfo | null;
  isPlaying: boolean;
  currentTime: number;
  onTogglePlay: () => void;
  onTimeUpdate: (t: number) => void;
  onLoadedMetadata: () => void;
};

export const VideoPreview = forwardRef<HTMLVideoElement, VideoPreviewProps>(
  function VideoPreview(
    { video, isPlaying, currentTime, onTogglePlay, onTimeUpdate, onLoadedMetadata },
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
          <div className="ml-auto text-[10px] font-mono uppercase tracking-wider text-fg-subtle">
            Space play/pause · I = IN · O = OUT
          </div>
        </div>
      </div>
    );
  },
);
