import { useCallback, useEffect, useRef, useState } from "react";
import { formatHMSms } from "@/lib/time";

type TimelineProps = {
  duration: number;
  currentTime: number;
  inSeconds: number;
  outSeconds: number;
  enabled: boolean;
  onSeek: (t: number) => void;
  onSetIn: (t: number) => void;
  onSetOut: (t: number) => void;
};

type DragMode = null | "in" | "out" | "playhead";

export function Timeline({
  duration,
  currentTime,
  inSeconds,
  outSeconds,
  enabled,
  onSeek,
  onSetIn,
  onSetOut,
}: TimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragMode>(null);

  const pctOf = (t: number) =>
    duration > 0 ? Math.max(0, Math.min(100, (t / duration) * 100)) : 0;

  const seekFromPointer = useCallback(
    (clientX: number): number => {
      const el = trackRef.current;
      if (!el || duration <= 0) return 0;
      const rect = el.getBoundingClientRect();
      const x = clientX - rect.left;
      const pct = Math.max(0, Math.min(1, x / rect.width));
      return pct * duration;
    },
    [duration],
  );

  useEffect(() => {
    if (!drag) return;
    const handleMove = (e: PointerEvent) => {
      const t = seekFromPointer(e.clientX);
      if (drag === "in") {
        onSetIn(Math.min(t, outSeconds - 0.05));
      } else if (drag === "out") {
        onSetOut(Math.max(t, inSeconds + 0.05));
      } else if (drag === "playhead") {
        onSeek(t);
      }
    };
    const handleUp = () => setDrag(null);
    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", handleUp);
    return () => {
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", handleUp);
    };
  }, [drag, seekFromPointer, inSeconds, outSeconds, onSeek, onSetIn, onSetOut]);

  const handleTrackPointerDown = (e: React.PointerEvent) => {
    if (!enabled) return;
    const t = seekFromPointer(e.clientX);
    onSeek(t);
    setDrag("playhead");
  };

  const startDrag = (mode: "in" | "out") => (e: React.PointerEvent) => {
    if (!enabled) return;
    e.stopPropagation();
    setDrag(mode);
  };

  const trimDuration = Math.max(0, outSeconds - inSeconds);

  return (
    <div className="shrink-0 border-t border-border bg-bg-surface px-6 py-4">
      <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-fg-subtle">
        <span>Timeline</span>
        <span className={enabled ? "text-fg-muted" : ""}>
          {enabled ? "click to seek · drag handles · I/O hotkeys" : "load a video"}
        </span>
      </div>

      <div
        ref={trackRef}
        className={`relative mt-3 h-12 select-none rounded ${enabled ? "cursor-col-resize bg-bg-elevated" : "cursor-not-allowed bg-bg-elevated/40"}`}
        onPointerDown={handleTrackPointerDown}
      >
        {/* Selected region */}
        {enabled && duration > 0 && (
          <div
            className="absolute inset-y-0 bg-accent-muted/25"
            style={{
              left: `${pctOf(inSeconds)}%`,
              width: `${pctOf(outSeconds) - pctOf(inSeconds)}%`,
            }}
          />
        )}

        {/* Outside-region dim */}
        {enabled && duration > 0 && (
          <>
            <div
              className="absolute inset-y-0 left-0 bg-bg-base/70"
              style={{ width: `${pctOf(inSeconds)}%` }}
            />
            <div
              className="absolute inset-y-0 right-0 bg-bg-base/70"
              style={{ width: `${100 - pctOf(outSeconds)}%` }}
            />
          </>
        )}

        {/* Playhead */}
        {enabled && duration > 0 && (
          <div
            className="absolute -top-1 bottom-[-4px] w-0.5 bg-playhead"
            style={{ left: `${pctOf(currentTime)}%` }}
          />
        )}

        {/* IN handle */}
        {enabled && (
          <button
            type="button"
            onPointerDown={startDrag("in")}
            className="group absolute -top-2 bottom-[-8px] z-10 flex w-4 -translate-x-1/2 cursor-grab items-center justify-center rounded-sm bg-in shadow-lg ring-1 ring-in/40 transition hover:bg-in/90 active:cursor-grabbing"
            style={{ left: `${pctOf(inSeconds)}%` }}
            aria-label="IN handle"
            title="IN — drag or press I"
          >
            <span className="text-[9px] font-bold text-bg-base">I</span>
          </button>
        )}

        {/* OUT handle */}
        {enabled && (
          <button
            type="button"
            onPointerDown={startDrag("out")}
            className="group absolute -top-2 bottom-[-8px] z-10 flex w-4 -translate-x-1/2 cursor-grab items-center justify-center rounded-sm bg-out shadow-lg ring-1 ring-out/40 transition hover:bg-out/90 active:cursor-grabbing"
            style={{ left: `${pctOf(outSeconds)}%` }}
            aria-label="OUT handle"
            title="OUT — drag or press O"
          >
            <span className="text-[9px] font-bold text-bg-base">O</span>
          </button>
        )}
      </div>

      <div className="mt-3 flex items-center gap-6 font-mono text-xs text-fg-muted text-mono-tabular">
        <span>
          <span className="text-in">IN</span>{" "}
          <span className="text-fg">{formatHMSms(inSeconds)}</span>
        </span>
        <span>
          <span className="text-out">OUT</span>{" "}
          <span className="text-fg">{formatHMSms(outSeconds)}</span>
        </span>
        <span>
          <span className="text-fg-subtle">DURATION</span>{" "}
          <span className="text-fg">{formatHMSms(trimDuration)}</span>
        </span>
      </div>
    </div>
  );
}
