import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { TopBar } from "@/components/TopBar/TopBar";
import { VideoPreview } from "@/components/VideoPreview/VideoPreview";
import { Timeline } from "@/components/Timeline/Timeline";
import { BatchQueue } from "@/components/BatchQueue/BatchQueue";
import { Sidebar } from "@/components/Sidebar/Sidebar";
import { fromRaw, type RawVideoInfo, type VideoInfo } from "@/types/video";
import { newClipId, type Clip, type EncodeProgressEvent } from "@/types/clip";

type NvencState = "checking" | "available" | "unavailable" | "error";

const VIDEO_EXTENSIONS = ["mp4", "mov", "mkv", "avi", "webm", "m4v"];
const MIN_CLIP_DURATION = 0.05;
const STORAGE_PREFIX = "shorts-maker";
const CHANNEL_NAME_KEY = `${STORAGE_PREFIX}:channel-name`;
const VOLUME_KEY = `${STORAGE_PREFIX}:preview-volume`;
const HOOK_TEXT_KEY = `${STORAGE_PREFIX}:hook-text`;
const HOOK_DURATION_KEY = `${STORAGE_PREFIX}:hook-duration`;
const LOOP_MODE_KEY = `${STORAGE_PREFIX}:loop-mode`;
const WATERMARK_STYLE_KEY = `${STORAGE_PREFIX}:watermark-style`;
const DEFAULT_HOOK_DURATION = 2.5;

export type WatermarkStyle = "boxed" | "minimal" | "gold" | "outline";
const DEFAULT_WATERMARK_STYLE: WatermarkStyle = "boxed";
const WATERMARK_STYLES: WatermarkStyle[] = ["boxed", "minimal", "gold", "outline"];

function loadWatermarkStyle(): WatermarkStyle {
  try {
    const raw = localStorage.getItem(WATERMARK_STYLE_KEY);
    if (raw && (WATERMARK_STYLES as string[]).includes(raw)) {
      return raw as WatermarkStyle;
    }
  } catch {
    // ignore
  }
  return DEFAULT_WATERMARK_STYLE;
}

function loadVolume(): number {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    if (raw === null) return 1;
    const v = parseFloat(raw);
    if (!Number.isFinite(v)) return 1;
    return Math.max(0, Math.min(1, v));
  } catch {
    return 1;
  }
}

function loadHookDuration(): number {
  try {
    const raw = localStorage.getItem(HOOK_DURATION_KEY);
    if (raw === null) return DEFAULT_HOOK_DURATION;
    const v = parseFloat(raw);
    if (!Number.isFinite(v)) return DEFAULT_HOOK_DURATION;
    return Math.max(1, Math.min(5, v));
  } catch {
    return DEFAULT_HOOK_DURATION;
  }
}

function App() {
  const [nvenc, setNvenc] = useState<NvencState>("checking");
  const [video, setVideo] = useState<VideoInfo | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [inSeconds, setInSeconds] = useState(0);
  const [outSeconds, setOutSeconds] = useState(0);
  const [clips, setClips] = useState<Clip[]>([]);
  const [isEncoding, setIsEncoding] = useState(false);
  const [dragHover, setDragHover] = useState(false);
  const [channelName, setChannelName] = useState<string>(() => {
    try {
      return localStorage.getItem(CHANNEL_NAME_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [hookText, setHookText] = useState<string>(() => {
    try {
      return localStorage.getItem(HOOK_TEXT_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [hookDuration, setHookDuration] = useState<number>(loadHookDuration);
  const [watermarkStyle, setWatermarkStyle] =
    useState<WatermarkStyle>(loadWatermarkStyle);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [loopMode, setLoopMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem(LOOP_MODE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [volume, setVolume] = useState<number>(loadVolume);
  const lastVolumeRef = useRef<number>(volume > 0 ? volume : 1);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(CHANNEL_NAME_KEY, channelName);
    } catch {
      // ignore
    }
  }, [channelName]);

  useEffect(() => {
    try {
      localStorage.setItem(HOOK_TEXT_KEY, hookText);
    } catch {
      // ignore
    }
  }, [hookText]);

  useEffect(() => {
    try {
      localStorage.setItem(HOOK_DURATION_KEY, String(hookDuration));
    } catch {
      // ignore
    }
  }, [hookDuration]);

  useEffect(() => {
    try {
      localStorage.setItem(LOOP_MODE_KEY, String(loopMode));
    } catch {
      // ignore
    }
  }, [loopMode]);

  useEffect(() => {
    try {
      localStorage.setItem(WATERMARK_STYLE_KEY, watermarkStyle);
    } catch {
      // ignore
    }
  }, [watermarkStyle]);

  useEffect(() => {
    try {
      localStorage.setItem(VOLUME_KEY, String(volume));
    } catch {
      // ignore
    }
    if (volume > 0) {
      lastVolumeRef.current = volume;
    }
    const v = videoRef.current;
    if (v) {
      v.volume = volume;
      v.muted = volume === 0;
    }
  }, [volume, video]);

  const handleToggleMute = useCallback(() => {
    setVolume((prev) => (prev > 0 ? 0 : lastVolumeRef.current || 1));
  }, []);

  // Encode progress events from Rust
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen<EncodeProgressEvent>("encode:progress", (event) => {
      const { clip_id, percent, speed } = event.payload;
      setClips((prev) =>
        prev.map((c) => {
          if (c.id !== clip_id) return c;
          // Only patch progress while encoding; ignore stale events post-done/failed.
          if (c.status.kind !== "encoding" && c.status.kind !== "pending") return c;
          return {
            ...c,
            status: { kind: "encoding", percent, speed: speed ?? null },
          };
        }),
      );
    }).then((u) => {
      unlisten = u;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  // NVENC probe
  useEffect(() => {
    let cancelled = false;
    invoke<boolean>("check_nvenc")
      .then((available) => {
        if (cancelled) return;
        setNvenc(available ? "available" : "unavailable");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setNvenc("error");
        // eslint-disable-next-line no-console
        console.error("nvenc check failed:", err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadVideo = useCallback(async (path: string) => {
    try {
      const raw = await invoke<RawVideoInfo>("probe_video", { path });
      const info = fromRaw(raw);
      setVideo(info);
      setInSeconds(0);
      setOutSeconds(info.duration);
      setCurrentTime(0);
      setIsPlaying(false);
      setClips([]);
      setThumbnails([]);

      // Generate thumbnail strip in the background; failure is non-fatal.
      invoke<{ paths: string[] }>("generate_thumbnails", {
        videoPath: info.path,
        duration: info.duration,
      })
        .then((res) => setThumbnails(res.paths))
        .catch((err: unknown) => {
          // eslint-disable-next-line no-console
          console.warn("thumbnails failed:", err);
        });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("probe failed:", err);
    }
  }, []);

  // Drag-and-drop
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === "enter" || event.payload.type === "over") {
          setDragHover(true);
        } else if (event.payload.type === "leave") {
          setDragHover(false);
        } else if (event.payload.type === "drop") {
          setDragHover(false);
          const paths = event.payload.paths;
          const videoPath = paths.find((p) => {
            const ext = p.split(".").pop()?.toLowerCase();
            return ext ? VIDEO_EXTENSIONS.includes(ext) : false;
          });
          if (videoPath) {
            void loadVideo(videoPath);
          }
        }
      })
      .then((u) => {
        unlisten = u;
      });
    return () => {
      unlisten?.();
    };
  }, [loadVideo]);

  // Open dialog
  const handleOpen = useCallback(async () => {
    const selected = await openDialog({
      multiple: false,
      filters: [{ name: "Video", extensions: VIDEO_EXTENSIONS }],
    });
    if (typeof selected === "string") {
      await loadVideo(selected);
    }
  }, [loadVideo]);

  // Video element <-> state sync
  const handleTogglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      void v.play();
      setIsPlaying(true);
    } else {
      v.pause();
      setIsPlaying(false);
    }
  }, []);

  const handleSeek = useCallback((t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = t;
    setCurrentTime(t);
  }, []);

  const handleTimeUpdate = useCallback(
    (t: number) => {
      setCurrentTime(t);
      if (loopMode && outSeconds > inSeconds && t >= outSeconds - 0.02) {
        const v = videoRef.current;
        if (v) {
          v.currentTime = inSeconds;
        }
      }
    },
    [loopMode, inSeconds, outSeconds],
  );

  // Hotkeys
  const setInAtPlayhead = useCallback(() => {
    const t = videoRef.current?.currentTime ?? 0;
    setInSeconds(Math.min(t, outSeconds - MIN_CLIP_DURATION));
  }, [outSeconds]);

  const setOutAtPlayhead = useCallback(() => {
    const t = videoRef.current?.currentTime ?? 0;
    setOutSeconds(Math.max(t, inSeconds + MIN_CLIP_DURATION));
  }, [inSeconds]);

  useEffect(() => {
    if (!video) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.key === "i" || e.key === "I") {
        setInAtPlayhead();
      } else if (e.key === "o" || e.key === "O") {
        setOutAtPlayhead();
      } else if (e.key === "l" || e.key === "L") {
        setLoopMode((m) => !m);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        const v = videoRef.current;
        if (!v) return;
        const step = e.shiftKey ? 1.0 : 1 / Math.max(1, video.fps);
        v.currentTime = Math.max(0, v.currentTime - step);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        const v = videoRef.current;
        if (!v) return;
        const step = e.shiftKey ? 1.0 : 1 / Math.max(1, video.fps);
        v.currentTime = Math.min(video.duration, v.currentTime + step);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [video, handleTogglePlay, setInAtPlayhead, setOutAtPlayhead]);

  // Add current IN/OUT to queue
  const handleAddClip = useCallback(() => {
    if (!video) return;
    if (outSeconds - inSeconds < MIN_CLIP_DURATION) return;
    setClips((prev) => [
      ...prev,
      {
        id: newClipId(),
        inSeconds,
        outSeconds,
        status: { kind: "pending" },
      },
    ]);
  }, [video, inSeconds, outSeconds]);

  const handleRemoveClip = useCallback((id: string) => {
    setClips((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const handleClearClips = useCallback(() => {
    setClips([]);
  }, []);

  // Encode all pending clips sequentially
  const handleEncodeAll = useCallback(async () => {
    if (!video) return;
    setIsEncoding(true);

    const pending = clips.filter((c) => c.status.kind === "pending");
    for (const clip of pending) {
      setClips((prev) =>
        prev.map((c) =>
          c.id === clip.id
            ? { ...c, status: { kind: "encoding", percent: 0, speed: null } }
            : c,
        ),
      );
      try {
        const result = await invoke<{ output_path: string }>("encode_short", {
          req: {
            clip_id: clip.id,
            input_path: video.path,
            in_seconds: clip.inSeconds,
            out_seconds: clip.outSeconds,
            use_nvenc: nvenc === "available",
            watermark: channelName.trim() || null,
            watermark_style: channelName.trim() ? watermarkStyle : null,
            hook_text: hookText.trim() || null,
            hook_duration: hookDuration,
            source_audio_codec: video.audioCodec,
          },
        });
        setClips((prev) =>
          prev.map((c) =>
            c.id === clip.id
              ? { ...c, status: { kind: "done", outputPath: result.output_path } }
              : c,
          ),
        );
      } catch (err) {
        setClips((prev) =>
          prev.map((c) =>
            c.id === clip.id
              ? { ...c, status: { kind: "failed", message: String(err) } }
              : c,
          ),
        );
      }
    }

    setIsEncoding(false);
  }, [video, clips, nvenc, channelName, watermarkStyle, hookText, hookDuration]);

  const handleRevealOutput = useCallback((path: string) => {
    if (path) void revealItemInDir(path);
  }, []);

  const stats = useMemo(() => {
    let pending = 0;
    let done = 0;
    let failed = 0;
    for (const c of clips) {
      if (c.status.kind === "pending") pending++;
      else if (c.status.kind === "done") done++;
      else if (c.status.kind === "failed") failed++;
    }
    return { pending, done, failed };
  }, [clips]);

  const canAddClip = !!video && outSeconds - inSeconds >= MIN_CLIP_DURATION;

  return (
    <div className="flex h-full flex-col">
      <TopBar nvenc={nvenc} video={video} onOpen={handleOpen} />
      <div className="flex flex-1 overflow-hidden">
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <VideoPreview
              ref={videoRef}
              video={video}
              isPlaying={isPlaying}
              currentTime={currentTime}
              volume={volume}
              onTogglePlay={handleTogglePlay}
              onTimeUpdate={handleTimeUpdate}
              onVolumeChange={setVolume}
              onToggleMute={handleToggleMute}
              onSetIn={setInAtPlayhead}
              onSetOut={setOutAtPlayhead}
              loopMode={loopMode}
              onToggleLoop={() => setLoopMode((m) => !m)}
              onLoadedMetadata={() => {
                if (videoRef.current && video) {
                  videoRef.current.currentTime = 0;
                  videoRef.current.volume = volume;
                }
              }}
            />
            <Timeline
              duration={video?.duration ?? 0}
              currentTime={currentTime}
              inSeconds={inSeconds}
              outSeconds={outSeconds}
              enabled={!!video}
              thumbnails={thumbnails}
              onSeek={handleSeek}
              onSetIn={setInSeconds}
              onSetOut={setOutSeconds}
            />
          </div>
          <BatchQueue
            clips={clips}
            canAdd={canAddClip}
            canClear={!isEncoding && clips.length > 0}
            onAdd={handleAddClip}
            onRemove={handleRemoveClip}
            onClear={handleClearClips}
            onRevealOutput={handleRevealOutput}
          />
        </main>
        <Sidebar
          hasVideo={!!video}
          queueLength={clips.length}
          pendingCount={stats.pending}
          doneCount={stats.done}
          failedCount={stats.failed}
          isEncoding={isEncoding}
          channelName={channelName}
          watermarkStyle={watermarkStyle}
          hookText={hookText}
          hookDuration={hookDuration}
          onChannelNameChange={setChannelName}
          onWatermarkStyleChange={setWatermarkStyle}
          onHookTextChange={setHookText}
          onHookDurationChange={setHookDuration}
          onEncode={handleEncodeAll}
        />
      </div>
      {dragHover && <DropOverlay />}
    </div>
  );
}

function DropOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-bg-base/85">
      <div className="rounded-xl border-2 border-dashed border-accent px-12 py-10 text-center">
        <div className="text-2xl font-semibold text-accent">Drop video here</div>
        <div className="mt-2 text-sm text-fg-muted">
          mp4, mov, mkv, avi, webm, m4v
        </div>
      </div>
    </div>
  );
}

export default App;
