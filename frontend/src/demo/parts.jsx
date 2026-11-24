import React, { useState } from 'react'
import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleHelpIcon,
  CircleXIcon,
  FlagIcon,
} from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Trace,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from '@/components/ui/trace'
import { statusColor, statusLabel, DEFENSE_KEYS } from '../status.js'
import { demoContent, fmt } from './demoContent.js'
import { expectedSeconds } from './useAsyncRun.js'
import { replayMeta } from './replay.js'

export function StepFrame({ title, lead, children }) {
  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-[1.5rem] font-semibold leading-tight text-sh-foreground">{title}</h1>
      {lead && <p className="max-w-5xl text-base leading-snug text-sh-muted-foreground">{lead}</p>}
      {children}
    </section>
  )
}

// Question + defense chips on the left, the run button on the right (one compact row).
export function RunRow({ label, question, flags, limit, onRun, disabled, buttonLabel }) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-base leading-snug">
          <span className="text-sh-muted-foreground">{label} </span>“{question}”
        </p>
        <FlagChips flags={flags} limit={limit} />
      </div>
      <Button size="lg" className="h-12 shrink-0 px-6 text-base" onClick={onRun} disabled={disabled}>
        {buttonLabel || demoContent.live.runButton}
      </Button>
    </div>
  )
}

// Jargon term: opens on hover/focus, and on click/tap it stays pinned until Escape, an outside click or a second click.
export function JargonTerm({ term, body, children }) {
  const [pinned, setPinned] = useState(false)
  const [open, setOpen] = useState(false)
  const close = () => { setPinned(false); setOpen(false) }
  return (
    <Tooltip open={open || pinned} onOpenChange={(o) => { if (!pinned) setOpen(o) }}>
      <TooltipTrigger asChild>
        <button
          type="button"
          data-testid={`term-${term}`}
          className="inline-flex items-baseline gap-1 rounded underline decoration-dotted decoration-2 underline-offset-4 focus-visible:ring-3 focus-visible:ring-sh-ring/50"
          onClick={() => { const next = !pinned; setPinned(next); setOpen(next) }}
        >
          {children}
          <CircleHelpIcon className="size-4 self-center" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent onEscapeKeyDown={close} onPointerDownOutside={close}>
        {body ?? demoContent.glossary[term]}
      </TooltipContent>
    </Tooltip>
  )
}

const VERDICT_ICON = { red: CircleXIcon, teal: CircleCheckIcon, amber: FlagIcon, gray: CircleAlertIcon }

// Verdict / status badge: colour from status.js, always with an icon and the shared word.
export function StatusBadge({ status, className }) {
  const color = statusColor(status)
  const Icon = VERDICT_ICON[color] || CircleAlertIcon
  return (
    <Badge variant={color} className={className} data-testid="status-badge" data-status={status}>
      <Icon aria-hidden="true" />
      {statusLabel(status)}
    </Badge>
  )
}

export function ReplayBanner() {
  const meta = replayMeta()
  return (
    <Alert data-testid="replay-banner" className="border-sh-primary">
      <CircleAlertIcon />
      <AlertTitle>{fmt(demoContent.live.replayBanner, meta)}</AlertTitle>
    </Alert>
  )
}

export function FlagChips({ flags, limit }) {
  const c = demoContent.live
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="flag-chips">
      <span className="text-sm text-sh-muted-foreground">{c.defensesLine}</span>
      {DEFENSE_KEYS.map((k) => (
        <Badge key={k} variant={flags?.[k] ? 'outline' : 'gray'} data-on={Boolean(flags?.[k])}>
          {c.controlNames[k]}: {flags?.[k] ? c.on : c.off}
        </Badge>
      ))}
      {flags?.retrieval_score_threshold && limit != null && (
        <Badge variant="gray">{fmt(c.limitLine, { value: limit })}</Badge>
      )}
    </div>
  )
}

// Loading and error states for a live run (see useAsyncRun).
export function RunStatus({ run, kind = 'query', onRetry, onShowRecorded, recordedLabel }) {
  const c = demoContent.live
  if (run.state === 'running') {
    const exp = expectedSeconds(kind)
    return (
      <Alert data-testid="run-loading">
        <Spinner />
        <AlertTitle>{fmt(kind === 'table' ? (exp.measured ? c.runningTable : c.runningTableTypical) : exp.measured ? c.running : c.runningTypical, { n: exp.n })}</AlertTitle>
        <AlertDescription className="flex items-center gap-3">
          {fmt(c.elapsed, { n: run.elapsed })}
          <Button size="sm" variant="outline" onClick={run.cancel}>{c.cancel}</Button>
        </AlertDescription>
      </Alert>
    )
  }
  if (run.state === 'error') {
    return (
      <Alert data-testid="run-error" className="border-sh-primary">
        <CircleAlertIcon />
        <AlertTitle>{c.errorTitle}</AlertTitle>
        <AlertDescription>
          <p data-testid="run-error-text" className="break-words text-sh-foreground">{run.error}</p>
          <div className="mt-2 flex gap-3">
            {onRetry && <Button size="sm" variant="outline" onClick={onRetry}>{c.retry}</Button>}
            {onShowRecorded && (
              <Button size="sm" onClick={onShowRecorded}>{recordedLabel || c.showRecorded}</Button>
            )}
          </div>
        </AlertDescription>
      </Alert>
    )
  }
  return null
}

const seconds = (ms) => fmt(demoContent.pipeline.seconds, { n: (ms / 1000).toFixed(1) })

// Per-run pipeline: only stages that really ran, with status/timing taken from the response's `stages`.
export function PipelineTrace({ run }) {
  const p = demoContent.pipeline
  const st = run?.stages || null
  const flags = run?.active_mitigations || {}
  const ran = {
    threshold: st ? st.threshold_ran : flags.retrieval_score_threshold,
    sanitization: st ? st.sanitization_ran : flags.sanitization,
    delimiter: st ? st.delimiter_ran : flags.delimiter,
    filter: st ? st.output_filter_ran : flags.output_filter,
  }
  const lines = [{ k: 'retrieval', t: p.retrieval, d: st ? seconds(st.retrieval_ms) : null }]
  if (ran.threshold) lines.push({ k: 'threshold', t: p.threshold, d: st ? (st.threshold_flagged ? p.thresholdFlagged : p.thresholdNone) : null })
  if (ran.sanitization) lines.push({ k: 'sanitization', t: p.sanitization, d: st ? (st.sanitization_modified ? p.sanitizationModified : p.sanitizationNone) : null })
  if (ran.delimiter) lines.push({ k: 'delimiter', t: p.delimiter, d: st ? p.delimiterDone : null })
  lines.push({ k: 'model', t: p.model, d: st ? seconds(st.generation_ms) : null })
  if (ran.filter) lines.push({ k: 'filter', t: p.outputFilter, d: st ? (st.output_filter_blocked ? p.outputFilterBlocked : p.outputFilterPassed) : null })
  return (
    <Trace data-testid="pipeline-trace" aria-label={p.title}>
      {lines.map((l) => (
        <TraceLine key={l.k} data-testid={`stage-${l.k}`}>
          <TraceIcon><CircleCheckIcon /></TraceIcon>
          <TraceTitle>{l.t}</TraceTitle>
          {l.d && <TraceDescription>— {l.d}</TraceDescription>}
        </TraceLine>
      ))}
    </Trace>
  )
}

// Highlights character spans of `text` using React nodes only (no HTML injection).
export function Highlight({ text, spans, label }) {
  const out = []
  let pos = 0
  ;(spans || []).forEach((s, i) => {
    if (s.start > pos) out.push(text.slice(pos, s.start))
    out.push(
      <mark
        key={i}
        data-testid="highlight"
        className="rounded bg-[var(--status-red-dim)] px-1 text-[var(--status-red)] underline decoration-2 underline-offset-4"
      >
        <span className="mr-1 font-semibold">[{label}]</span>
        {text.slice(s.start, s.end)}
      </mark>
    )
    pos = s.end
  })
  if (pos < text.length) out.push(text.slice(pos))
  return <>{out}</>
}
