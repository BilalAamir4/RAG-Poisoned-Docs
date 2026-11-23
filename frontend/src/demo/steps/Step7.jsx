import React, { useEffect, useState } from 'react'
import { CircleAlertIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { demoContent, fmt } from '../demoContent.js'
import { dropSandbox, getSandbox, plantSandbox, runDemoQuery } from '../demoApi.js'
import { FlagChips, PipelineTrace, RunStatus, StepFrame } from '../parts.jsx'
import { expectedSeconds, useAsyncRun } from '../useAsyncRun.js'
import { ALL_OFF } from './Step2.jsx'

const ALL_ON = Object.fromEntries(Object.keys(ALL_OFF).map((k) => [k, true]))

function ResultCard({ title, flags, run }) {
  const c = demoContent.step7
  const st = run.stages
  const filter = !st?.output_filter_ran ? c.filterOff : st.output_filter_blocked ? c.filterBlocked : c.filterPassed
  return (
    <Card data-testid="step7-result">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <FlagChips flags={flags} />
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-base leading-snug">
        <div>
          <div className="text-sm text-muted-foreground">{c.raw}</div>
          <p data-testid="step7-raw">{run.raw_response}</p>
        </div>
        <div>
          <div className="text-sm text-muted-foreground">{c.final}</div>
          <p data-testid="step7-final">{run.response}</p>
        </div>
        <Badge variant="gray">{fmt(c.filterLine, { result: filter })}</Badge>
        <PipelineTrace run={run} />
      </CardContent>
    </Card>
  )
}

// onSandboxChange(exists) lets DemoApp prompt before leaving the step; registerRestore lets it trigger the restore.
export default function Step7({ onSandboxChange, registerRestore }) {
  const c = demoContent.step7
  const run = useAsyncRun('sandbox')
  const [text, setText] = useState('')
  const [maxChars, setMaxChars] = useState(null)
  const [active, setActive] = useState(false)
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [restoredMsg, setRestoredMsg] = useState(false)
  const [restoreError, setRestoreError] = useState(null)

  useEffect(() => {
    getSandbox().then((s) => { setMaxChars(s.max_chars); setActive(Boolean(s.exists)); onSandboxChange?.(Boolean(s.exists)) }).catch(() => {})
  }, [onSandboxChange])

  const restore = async () => {
    setRestoreError(null)
    try {
      await dropSandbox()
      setActive(false); onSandboxChange?.(false)
      run.reset(); setRestoredMsg(true)
      return true
    } catch (e) {
      setRestoreError(e.message)
      return false
    }
  }
  useEffect(() => { registerRestore?.(restore) })

  const go = () => {
    setRestoredMsg(false)
    run.start(async (signal) => {
      const planted = await plantSandbox(text, signal)
      setActive(true); onSandboxChange?.(true)
      const off = await runDemoQuery({ query: demoContent.queries.trigger, mitigations: ALL_OFF, sandbox: true, signal })
      const on = await runDemoQuery({ query: demoContent.queries.trigger, mitigations: ALL_ON, sandbox: true, signal })
      return { planted, off, on }
    })
  }

  const tooLong = maxChars != null && text.length > maxChars
  const exp = expectedSeconds('sandbox')
  const out = run.data

  return (
    <StepFrame title={c.title} lead={c.lead}>
      <label htmlFor="instruction" className="text-base font-medium">{c.inputLabel}</label>
      <Textarea
        id="instruction"
        data-testid="instruction-input"
        className="min-h-0 text-base" rows={2}
        placeholder={c.placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={run.state === 'running'}
      />
      <div className="flex flex-wrap items-center gap-4">
        <Button size="lg" className="h-12 px-6 text-base" onClick={go} disabled={!text.trim() || tooLong || run.state === 'running'}>
          {c.plant}
        </Button>
        {maxChars != null && (
          <span className="text-sm text-muted-foreground" data-testid="counter">{fmt(c.counter, { n: text.length, max: maxChars })}</span>
        )}
        <span className="text-sm text-muted-foreground">{fmt(c.waitLine, { n: exp.n + demoContent.typicalSeconds.sandboxBuild })}</span>
      </div>
      <RunStatus run={run} kind="sandbox" onRetry={go} />
      {run.state === 'running' && <Skeleton className="h-20 w-full" aria-label={c.building} />}
      {out && (
        <>
          <Alert data-testid="step7-retrieval" data-retrieved={Boolean(out.off.sandbox?.planted_text_in_retrieved)}>
            <CircleAlertIcon />
            <AlertTitle>{out.off.sandbox?.planted_text_in_retrieved ? c.retrieved : c.notRetrieved}</AlertTitle>
          </Alert>
          <div className="grid grid-cols-2 gap-4">
            <ResultCard title={c.colOff} flags={ALL_OFF} run={out.off} />
            <ResultCard title={c.colOn} flags={ALL_ON} run={out.on} />
          </div>
          <p className="text-sm text-muted-foreground" data-testid="auto-check-note">{c.autoCheckNote}</p>
        </>
      )}
      {restoredMsg && <Alert data-testid="restored"><AlertTitle>{c.restored}</AlertTitle></Alert>}
      {restoreError && <Alert data-testid="restore-error" className="border-primary"><AlertDescription className="text-foreground">{restoreError}</AlertDescription></Alert>}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="lg" className="h-12 px-6 text-base" onClick={() => setRestoreOpen(true)} disabled={!active}>
          {c.restore}
        </Button>
        <span className="text-sm text-muted-foreground">{c.restoreHint}</span>
      </div>
      <AlertDialog open={restoreOpen} onOpenChange={setRestoreOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{c.restoreDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>{c.restoreDialog.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{c.restoreDialog.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={restore}>{c.restoreDialog.confirm}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </StepFrame>
  )
}
