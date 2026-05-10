import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { TopBar } from "@/components/TopBar/TopBar";
import { VideoPreview } from "@/components/VideoPreview/VideoPreview";
import { Timeline } from "@/components/Timeline/Timeline";
import { BatchQueue } from "@/components/BatchQueue/BatchQueue";
import { Sidebar } from "@/components/Sidebar/Sidebar";
import { fromRaw, type RawVideoInfo, type VideoInfo } from "@/types/video";
import { newClipId, type Clip } from "@/types/clip";

type NvencState = "checking" | "available" | "unavailable" | "error";

const VIDEO_EXTENSIONS = ["mp4", "mov", "mkv", "avi", "webm", "m4v"];
const MIN_CLIP_DURATION = 0.05;
const CHANNEL_NAME_KEY = "shorts-maker:channel-name";

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
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(CHANNEL_NAME_KEY, channelName);
    } catch {
      // ignore
    }
  }, [channelName]);

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

  // Hotkeys
  useEffect(() => {
    if (!video) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.key === "i" || e.key === "I") {
        const t = videoRef.current?.currentTime ?? 0;
        setInSeconds(Math.min(t, outSeconds - MIN_CLIP_DURATION));
      } else if (e.key === "o" || e.key === "O") {
        const t = videoRef.current?.currentTime ?? 0;
        setOutSeconds(Math.max(t, inSeconds + MIN_CLIP_DURATION));
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
  }, [video, handleTogglePlay, inSeconds, outSeconds]);

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

  // Encode all pending clips sequentially
  const handleEncodeAll = useCallback(async () => {
    if (!video) return;
    setIsEncoding(true);

    const pending = clips.filter((c) => c.status.kind === "pending");
    for (const clip of pending) {
      setClips((prev) =>
        prev.map((c) => (c.id === clip.id ? { ...c, status: { kind: "encoding" } } : c)),
      );
      try {
        const result = await invoke<{ output_path: string }>("encode_short", {
          req: {
            input_path: video.path,
            in_seconds: clip.inSeconds,
            out_seconds: clip.outSeconds,
            use_nvenc: nvenc === "available",
            watermark: channelName.trim() || null,
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
  }, [video, clips, nvenc, channelName]);

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
              onTogglePlay={handleTogglePlay}
              onTimeUpdate={setCurrentTime}
              onLoadedMetadata={() => {
                if (videoRef.current && video) {
                  videoRef.current.currentTime = 0;
                }
              }}
            />
            <Timeline
              duration={video?.duration ?? 0}
              currentTime={currentTime}
              inSeconds={inSeconds}
              outSeconds={outSeconds}
              enabled={!!video}
              onSeek={handleSeek}
              onSetIn={setInSeconds}
              onSetOut={setOutSeconds}
            />
          </div>
          <BatchQueue
            clips={clips}
            canAdd={canAddClip}
            onAdd={handleAddClip}
            onRemove={handleRemoveClip}
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
          onChannelNameChange={setChannelName}
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
