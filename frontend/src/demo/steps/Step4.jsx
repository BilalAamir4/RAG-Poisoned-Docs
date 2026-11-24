import React, { useState } from 'react'
import { CircleAlertIcon, CircleCheckIcon, CircleXIcon } from 'lucide-react'
import { TraceCollapsible, TraceCollapsibleContent, TraceCollapsibleTrigger, TraceIcon, TraceLine, TraceTitle } from '@/components/ui/trace'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { findLeakSpans, statusColor, statusLabel } from '../../status.js'
import { demoContent } from '../demoContent.js'
import { getDocument, runDemoQuery } from '../demoApi.js'
import { Highlight, PipelineTrace, RunRow, ReplayBanner, RunStatus, StepFrame } from '../parts.jsx'
import { recordedAttack } from '../replay.js'
import { useAsyncRun } from '../useAsyncRun.js'
import { finalRepeated } from '../verdicts.js'
import { ALL_OFF } from './Step2.jsx'

export default function Step4() {
  const c = demoContent.step4
  const run = useAsyncRun('query')
  const [recorded, setRecorded] = useState(null)
  const [doc, setDoc] = useState(null)
  const [docError, setDocError] = useState(null)
  const result = recorded || run.data

  const loadDoc = () => {
    setDocError(null)
    getDocument(demoContent.docName).then(setDoc).catch((e) => setDocError(e.message))
  }
  const go = () => {
    setRecorded(null)
    loadDoc()
    run.start((signal) => runDemoQuery({ query: demoContent.queries.trigger, mitigations: ALL_OFF, signal }))
  }
  const fixture = recordedAttack()
  const verdict = result ? (finalRepeated(result) ? 'leaked' : 'clean') : null
  const showRecorded = () => {
    if (!doc) loadDoc()
    setRecorded(fixture)
  }

  return (
    <StepFrame title={c.title} lead={c.lead}>
      <RunRow label={c.question} question={demoContent.queries.trigger} flags={ALL_OFF} onRun={go} disabled={run.state === 'running'} />
      <RunStatus run={run} onRetry={go} onShowRecorded={fixture ? showRecorded : undefined} />
      {run.state === 'running' && <Skeleton className="h-24 w-full" />}
      {recorded && <ReplayBanner />}
      {result && (
        <>
          <Alert variant={statusColor(verdict)} data-testid="step4-verdict" data-verdict={verdict}>
            {verdict === 'leaked' ? <CircleXIcon /> : <CircleCheckIcon />}
            <AlertTitle className="font-semibold">
              {statusLabel(verdict)} — {c.verdictText[verdict]}
            </AlertTitle>
          </Alert>
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">{c.answerTitle}</CardTitle></CardHeader>
              <CardContent className="text-base leading-snug" data-testid="step4-answer">
                <Highlight text={result.response} spans={findLeakSpans(result.response)} label={c.falseClaimLabel} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">{c.policyTitle}</CardTitle></CardHeader>
              <CardContent className="text-base leading-snug" data-testid="step4-policy">
                {doc?.policy_text ?? (docError ? <span className="text-sh-muted-foreground">{docError}</span> : <Skeleton className="h-16 w-full" />)}
                {doc?.policy_text && <p className="mt-2 text-sm text-sh-muted-foreground">{c.policyNote}</p>}
              </CardContent>
            </Card>
          </div>
          <TraceCollapsible>
            <TraceCollapsibleTrigger>
              <TraceLine>
                <TraceIcon><CircleAlertIcon /></TraceIcon>
                <TraceTitle>{demoContent.pipeline.title}</TraceTitle>
              </TraceLine>
            </TraceCollapsibleTrigger>
            <TraceCollapsibleContent><PipelineTrace run={result} /></TraceCollapsibleContent>
          </TraceCollapsible>
        </>
      )}
    </StepFrame>
  )
}
