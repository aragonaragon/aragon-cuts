import { Loader2 } from "lucide-react";
import type { WatermarkStyle } from "@/App";

type SidebarProps = {
  hasVideo: boolean;
  queueLength: number;
  pendingCount: number;
  doneCount: number;
  failedCount: number;
  isEncoding: boolean;
  channelName: string;
  watermarkStyle: WatermarkStyle;
  hookText: string;
  hookDuration: number;
  onChannelNameChange: (name: string) => void;
  onWatermarkStyleChange: (style: WatermarkStyle) => void;
  onHookTextChange: (text: string) => void;
  onHookDurationChange: (duration: number) => void;
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
  watermarkStyle,
  hookText,
  hookDuration,
  onChannelNameChange,
  onWatermarkStyleChange,
  onHookTextChange,
  onHookDurationChange,
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
        <HookTextField
          text={hookText}
          duration={hookDuration}
          onTextChange={onHookTextChange}
          onDurationChange={onHookDurationChange}
          disabled={isEncoding}
        />
        <ChannelNameField
          value={channelName}
          style={watermarkStyle}
          onChange={onChannelNameChange}
          onStyleChange={onWatermarkStyleChange}
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

function HookTextField({
  text,
  duration,
  onTextChange,
  onDurationChange,
  disabled,
}: {
  text: string;
  duration: number;
  onTextChange: (s: string) => void;
  onDurationChange: (d: number) => void;
  disabled: boolean;
}) {
  return (
    <section className="space-y-2">
      <label className="block text-[10px] font-mono uppercase tracking-wider text-fg-subtle">
        Hook text <span className="lowercase text-fg-subtle">(optional)</span>
      </label>
      <input
        type="text"
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        disabled={disabled}
        placeholder="e.g. INSANE COMBO"
        maxLength={48}
        className="w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm text-fg outline-none transition placeholder:text-fg-subtle focus:border-accent-muted focus:ring-1 focus:ring-accent-muted disabled:opacity-60"
      />
      <div className="flex items-center gap-2 pt-1">
        <span className="text-[10px] font-mono uppercase tracking-wider text-fg-subtle">
          Duration
        </span>
        <input
          type="range"
          min={1}
          max={5}
          step={0.1}
          value={duration}
          onChange={(e) => onDurationChange(parseFloat(e.target.value))}
          disabled={disabled}
          className="h-1 flex-1 cursor-pointer accent-accent disabled:opacity-60"
          aria-label="Hook text duration"
        />
        <span className="w-10 text-right font-mono text-xs text-fg text-mono-tabular">
          {duration.toFixed(1)}s
        </span>
      </div>
      <p className="text-[10px] leading-relaxed text-fg-subtle">
        Big gold headline in the bottom blurred area, for the chosen
        duration. Leave empty to skip.
      </p>
    </section>
  );
}

function ChannelNameField({
  value,
  style,
  onChange,
  onStyleChange,
  disabled,
}: {
  value: string;
  style: WatermarkStyle;
  onChange: (s: string) => void;
  onStyleChange: (s: WatermarkStyle) => void;
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
      <WatermarkStylePicker
        value={style}
        sampleText={value.trim() || "@yourname"}
        onChange={onStyleChange}
        disabled={disabled}
      />
      <p className="text-[10px] leading-relaxed text-fg-subtle">
        Centered badge above the video in the top blurred area. Leave empty
        for no watermark.
      </p>
    </section>
  );
}

const STYLE_LABELS: Record<WatermarkStyle, string> = {
  boxed: "Boxed",
  minimal: "Minimal",
  gold: "Gold",
  outline: "Outline",
};

const STYLE_ORDER: WatermarkStyle[] = ["boxed", "minimal", "gold", "outline"];

function WatermarkStylePicker({
  value,
  sampleText,
  onChange,
  disabled,
}: {
  value: WatermarkStyle;
  sampleText: string;
  onChange: (s: WatermarkStyle) => void;
  disabled: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 pt-1">
      {STYLE_ORDER.map((s) => {
        const active = s === value;
        return (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            disabled={disabled}
            className={`flex h-14 flex-col items-center justify-center gap-1 rounded-md border text-xs transition disabled:cursor-not-allowed disabled:opacity-60 ${
              active
                ? "border-accent bg-bg-elevated ring-1 ring-accent/40"
                : "border-border bg-bg-elevated/40 hover:border-border-strong hover:bg-bg-hover"
            }`}
            aria-pressed={active}
            title={`${STYLE_LABELS[s]} watermark style`}
          >
            <StylePreview style={s} text={sampleText} />
            <span className="text-[9px] font-mono uppercase tracking-wider text-fg-subtle">
              {STYLE_LABELS[s]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function StylePreview({ style, text }: { style: WatermarkStyle; text: string }) {
  const shown = text.length > 10 ? `${text.slice(0, 9)}…` : text;
  const common = "px-2 py-0.5 text-[10px] font-bold";
  if (style === "boxed") {
    return (
      <span
        className={`${common} rounded-sm border border-accent/50 bg-black/60 text-white`}
      >
        {shown}
      </span>
    );
  }
  if (style === "minimal") {
    return (
      <span
        className={`${common} text-white`}
        style={{ textShadow: "1px 1px 2px rgba(0,0,0,0.85)" }}
      >
        {shown}
      </span>
    );
  }
  if (style === "gold") {
    return (
      <span
        className={`${common} rounded-sm bg-accent text-bg-base`}
      >
        {shown}
      </span>
    );
  }
  // outline
  return (
    <span
      className={`${common} text-bg-base`}
      style={{
        WebkitTextStroke: "1.5px #C9A14A",
        color: "rgba(26,26,27,0.96)",
      }}
    >
      {shown}
    </span>
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
