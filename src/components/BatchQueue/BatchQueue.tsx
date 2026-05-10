import { Plus, Loader2, CheckCircle2, AlertCircle, X, FolderOpen } from "lucide-react";
import { formatHMSms } from "@/lib/time";
import type { Clip } from "@/types/clip";

type BatchQueueProps = {
  clips: Clip[];
  canAdd: boolean;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onRevealOutput: (path: string) => void;
};

export function BatchQueue({
  clips,
  canAdd,
  onAdd,
  onRemove,
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
  const isEncoding = clip.status.kind === "encoding";
  const isDone = clip.status.kind === "done";
  const isFailed = clip.status.kind === "failed";

  return (
    <div
      className={`flex items-center gap-3 rounded border px-3 py-1.5 text-xs ${
        isDone
          ? "border-success/30 bg-success/5"
          : isFailed
            ? "border-danger/30 bg-danger/5"
            : isEncoding
              ? "border-accent-muted bg-accent/10"
              : "border-border bg-bg-elevated/40"
      }`}
    >
      <span className="w-5 shrink-0 text-center font-mono text-fg-subtle">{index}</span>
      <StatusIcon clip={clip} />
      <span className="font-mono text-fg-muted text-mono-tabular">
        <span className="text-in">{formatHMSms(clip.inSeconds)}</span>
        <span className="mx-1.5 text-fg-subtle">→</span>
        <span className="text-out">{formatHMSms(clip.outSeconds)}</span>
        <span className="ml-2 text-fg-subtle">({formatHMSms(duration)})</span>
      </span>

      {clip.status.kind === "failed" && (
        <span
          className="ml-2 truncate text-danger"
          title={clip.status.message}
        >
          {clip.status.message.split("\n")[0].slice(0, 60)}
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
  );
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
