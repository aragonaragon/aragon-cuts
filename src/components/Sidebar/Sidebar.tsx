import { Loader2 } from "lucide-react";

type SidebarProps = {
  hasVideo: boolean;
  queueLength: number;
  pendingCount: number;
  doneCount: number;
  failedCount: number;
  isEncoding: boolean;
  channelName: string;
  onChannelNameChange: (name: string) => void;
  onEncode: () => void;
};

export function Sidebar({
  hasVideo,
  queueLength,
  pendingCount,
  doneCount,
  failedCount,
  isEncoding,
  channelName,
  onChannelNameChange,
  onEncode,
}: SidebarProps) {
  const buttonLabel =
    queueLength === 0
      ? "Add a clip first"
      : isEncoding
        ? `ENCODING ${doneCount + failedCount + 1}/${queueLength}…`
        : pendingCount > 0
          ? `ENCODE ${pendingCount} CLIP${pendingCount === 1 ? "" : "S"}`
          : "ALL DONE";

  const disabled = !hasVideo || queueLength === 0 || isEncoding || pendingCount === 0;

  return (
    <aside className="flex w-[280px] shrink-0 flex-col border-l border-border bg-bg-surface">
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-5">
        <ChannelNameField
          value={channelName}
          onChange={onChannelNameChange}
          disabled={isEncoding}
        />
        <FormatInfo />
      </div>
      <div className="shrink-0 space-y-3 border-t border-border p-4">
        {queueLength > 0 && (
          <QueueStats
            total={queueLength}
            pending={pendingCount}
            done={doneCount}
            failed={failedCount}
          />
        )}
        <button
          type="button"
          onClick={onEncode}
          disabled={disabled}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isEncoding && <Loader2 className="h-4 w-4 animate-spin" />}
          {buttonLabel}
        </button>
      </div>
    </aside>
  );
}

function ChannelNameField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (s: string) => void;
  disabled: boolean;
}) {
  return (
    <section className="space-y-2">
      <label className="block text-[10px] font-mono uppercase tracking-wider text-fg-subtle">
        Channel name <span className="lowercase text-fg-subtle">(optional)</span>
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="@yourname"
        maxLength={48}
        className="w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm text-fg outline-none transition placeholder:text-fg-subtle focus:border-accent-muted focus:ring-1 focus:ring-accent-muted disabled:opacity-60"
      />
      <p className="text-[10px] leading-relaxed text-fg-subtle">
        Shows in the top-right corner of the output. Leave empty for no
        watermark.
      </p>
    </section>
  );
}

function FormatInfo() {
  return (
    <section className="space-y-2 rounded-md border border-border bg-bg-elevated/40 p-3 text-xs">
      <div className="text-[10px] font-mono uppercase tracking-wider text-fg-subtle">
        Output
      </div>
      <ul className="space-y-1 text-fg-muted">
        <li>1080×1920 · same fps as source</li>
        <li>Blurred background fill</li>
        <li>NVENC (H.264) · CQ 20</li>
        <li>Audio copied from source</li>
      </ul>
    </section>
  );
}

function QueueStats({
  total,
  pending,
  done,
  failed,
}: {
  total: number;
  pending: number;
  done: number;
  failed: number;
}) {
  return (
    <div className="flex items-center justify-between rounded border border-border bg-bg-elevated/50 px-3 py-2 text-xs">
      <span className="text-fg-muted">{total} total</span>
      <div className="flex items-center gap-3 font-mono">
        {pending > 0 && <span className="text-fg-muted">{pending} ⏸</span>}
        {done > 0 && <span className="text-success">{done} ✓</span>}
        {failed > 0 && <span className="text-danger">{failed} ✕</span>}
      </div>
    </div>
  );
}
