import { Plus, Loader2, CheckCircle2, AlertCircle, X, FolderOpen, Trash2 } from "lucide-react";
import { formatHMSms } from "@/lib/time";
import type { Clip } from "@/types/clip";

type BatchQueueProps = {
  clips: Clip[];
  canAdd: boolean;
  canClear: boolean;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onRevealOutput: (path: string) => void;
};

export function BatchQueue({
  clips,
  canAdd,
  canClear,
  onAdd,
  onRemove,
  onClear,
  onRevealOutput,
}: BatchQueueProps) {
  return (
    <section className="flex h-44 shrink-0 flex-col border-t border-border bg-bg-surface px-6 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-[10px] font-mono uppercase tracking-wider text-fg-subtle">
            Clip Queue
          </h2>
          <span className="text-xs text-fg-muted">
            {clips.length === 0 ? "" : `${clips.length} clip${clips.length === 1 ? "" : "s"}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {clips.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              disabled={!canClear}
              className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-fg-muted transition hover:border-danger/50 hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
              title="Remove all clips from the queue"
            >
              <Trash2 className="h-3 w-3" />
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={onAdd}
            disabled={!canAdd}
            className="flex items-center gap-1.5 rounded-md border border-accent-muted bg-accent/10 px-3 py-1.5 text-xs text-accent transition hover:border-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:border-border disabled:bg-transparent disabled:text-fg-subtle"
          >
            <Plus className="h-3 w-3" />
            Add current IN/OUT
          </button>
        </div>
      </div>

      {clips.length === 0 ? (
        <div className="mt-3 flex flex-1 items-center justify-center rounded border border-dashed border-border text-xs text-fg-subtle">
          Set IN/OUT on the timeline, then click "Add current IN/OUT"
        </div>
      ) : (
        <div className="mt-3 flex-1 space-y-1.5 overflow-y-auto pr-1">
          {clips.map((clip, i) => (
            <ClipRow
              key={clip.id}
              clip={clip}
              index={i + 1}
              onRemove={() => onRemove(clip.id)}
              onRevealOutput={onRevealOutput}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ClipRow({
  clip,
  index,
  onRemove,
  onRevealOutput,
}: {
  clip: Clip;
  index: number;
  onRemove: () => void;
  onRevealOutput: (path: string) => void;
}) {
  const duration = Math.max(0, clip.outSeconds - clip.inSeconds);
  const status = clip.status;
  const isEncoding = status.kind === "encoding";
  const isDone = status.kind === "done";
  const isFailed = status.kind === "failed";

  const percent = status.kind === "encoding" ? status.percent : 0;
  const speed = status.kind === "encoding" ? status.speed : null;
  const eta =
    status.kind === "encoding" && speed != null && speed > 0
      ? Math.max(0, ((100 - percent) / 100) * duration) / speed
      : null;

  return (
    <div
      className={`relative overflow-hidden rounded border px-3 py-1.5 text-xs ${
        isDone
          ? "border-success/30 bg-success/5"
          : isFailed
            ? "border-danger/30 bg-danger/5"
            : isEncoding
              ? "border-accent-muted bg-accent/10"
              : "border-border bg-bg-elevated/40"
      }`}
    >
      {/* Progress bar background (only when encoding) */}
      {isEncoding && (
        <div
          className="absolute inset-y-0 left-0 bg-accent/15 transition-[width] duration-200 ease-out"
          style={{ width: `${percent}%` }}
          aria-hidden="true"
        />
      )}

      <div className="relative flex items-center gap-3">
        <span className="w-5 shrink-0 text-center font-mono text-fg-subtle">{index}</span>
        <StatusIcon clip={clip} />
        <span className="font-mono text-fg-muted text-mono-tabular">
          <span className="text-in">{formatHMSms(clip.inSeconds)}</span>
          <span className="mx-1.5 text-fg-subtle">→</span>
          <span className="text-out">{formatHMSms(clip.outSeconds)}</span>
          <span className="ml-2 text-fg-subtle">({formatHMSms(duration)})</span>
        </span>

        {isEncoding && (
          <span className="ml-2 font-mono text-accent text-mono-tabular">
            {percent.toFixed(0)}%
            {speed != null && (
              <span className="ml-2 text-fg-muted">{speed.toFixed(1)}×</span>
            )}
            {eta != null && eta > 0 && (
              <span className="ml-2 text-fg-muted">ETA {formatEta(eta)}</span>
            )}
          </span>
        )}

        {clip.status.kind === "failed" && (
          <span
            className="ml-2 min-w-0 flex-1 break-words text-danger"
            title={clip.status.message}
          >
            {summarizeFfmpegError(clip.status.message)}
          </span>
        )}

        <div className="ml-auto flex items-center gap-1">
          {clip.status.kind === "done" && (
            <button
              type="button"
              onClick={() => onRevealOutput(clip.status.kind === "done" ? clip.status.outputPath : "")}
              className="rounded p-1 text-fg-muted transition hover:bg-bg-hover hover:text-fg"
              aria-label="Open output folder"
              title="Open output folder"
            >
              <FolderOpen className="h-3.5 w-3.5" />
            </button>
          )}
          {!isEncoding && (
            <button
              type="button"
              onClick={onRemove}
              className="rounded p-1 text-fg-muted transition hover:bg-bg-hover hover:text-danger"
              aria-label="Remove clip"
              title="Remove clip"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function summarizeFfmpegError(message: string): string {
  // Surface the most useful 1-2 lines from the ffmpeg stderr buffer rather
  // than the generic "exited with code N" prefix. Looks for the FIRST
  // priority match, then includes the immediately following line for
  // context (often where the actual reason is).
  const lines = message
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const priorityPatterns = [
    /Could not find tag/i,
    /codec not currently supported/i,
    /No such file/i,
    /Permission denied/i,
    /Conversion failed/i,
    /\[mp4 @/i,
    /Invalid argument/i,
    /InitializeEncoder failed/i,
    /OpenEncodeSessionEx failed/i,
    /\[error\]/i,
    /Error/i,
  ];
  for (const pattern of priorityPatterns) {
    const idx = lines.findIndex((l) => pattern.test(l));
    if (idx !== -1) {
      const here = lines[idx];
      const next = lines[idx + 1];
      const combined = next ? `${here} · ${next}` : here;
      return combined.slice(0, 200);
    }
  }
  return (lines[0] ?? message).slice(0, 200);
}

function formatEta(seconds: number): string {
  if (seconds < 1) return "<1s";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m${s.toString().padStart(2, "0")}s`;
}

function StatusIcon({ clip }: { clip: Clip }) {
  switch (clip.status.kind) {
    case "pending":
      return <span className="h-2 w-2 shrink-0 rounded-full bg-fg-subtle" />;
    case "encoding":
      return <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-accent" />;
    case "done":
      return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />;
    case "failed":
      return <AlertCircle className="h-3.5 w-3.5 shrink-0 text-danger" />;
  }
}
