import React, { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { demoContent, fmt } from '../demoContent.js'
import { runDemoQuery } from '../demoApi.js'
import { FlagChips, JargonTerm, ReplayBanner, RunStatus, StatusBadge, StepFrame } from '../parts.jsx'
import { recordedNormal } from '../replay.js'
import { setNormalScores } from '../session.js'
import { useAsyncRun } from '../useAsyncRun.js'
import { finalRepeated } from '../verdicts.js'

export const ALL_OFF = { delimiter: false, sanitization: false, output_filter: false, retrieval_score_threshold: false }

export default function Step2() {
  const c = demoContent.step2
  const run = useAsyncRun('query')
  const [recorded, setRecorded] = useState(null)
  const result = recorded || run.data

  const go = () => {
    setRecorded(null)
    run.start(async (signal) => {
      const r = await runDemoQuery({ query: demoContent.queries.normal, mitigations: ALL_OFF, signal })
      setNormalScores((r.retrieved_chunks || []).map((ch) => ch.similarity_score))
      return r
    })
  }
  const fixture = recordedNormal()

  return (
    <StepFrame title={c.title} lead={c.lead}>
      <p className="text-base">
        <span className="text-muted-foreground">{c.question} </span>“{demoContent.queries.normal}”
      </p>
      <FlagChips flags={ALL_OFF} />
      <div className="flex items-center gap-4">
        <Button size="lg" className="h-12 px-6 text-base" onClick={go} disabled={run.state === 'running'}>
          {demoContent.live.runButton}
        </Button>
      </div>
      <RunStatus run={run} onRetry={go} onShowRecorded={fixture ? () => setRecorded(fixture) : undefined} />
      {run.state === 'running' && <Skeleton className="h-24 w-full" />}
      {recorded && <ReplayBanner />}
      {result && (
        <div className="grid grid-cols-5 gap-4" data-testid="step2-result">
          <Card className="col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-base">
                {c.answerTitle}
                <StatusBadge status={finalRepeated(result) ? 'leaked' : 'clean'} />
              </CardTitle>
            </CardHeader>
            <CardContent className="text-base leading-snug">{result.response}</CardContent>
          </Card>
          <div className="col-span-3 flex flex-col gap-3">
            <h2 className="text-base font-medium">{c.passagesTitle}</h2>
            {(result.retrieved_chunks || []).map((ch, i, all) => {
              const score = Number(ch.similarity_score).toFixed(2)
              return (
                <Card key={ch.chunk_id || i} size="sm" data-testid="passage">
                  <CardContent className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{fmt(c.passageLabel, { k: i + 1, n: all.length })}</Badge>
                      <span className="font-medium">{ch.source_document}</span>
                      <JargonTerm term="relevance">
                        <Badge variant="gray">{fmt(c.scoreLabel, { score })}</Badge>
                      </JargonTerm>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {fmt(c.explanation, { document: ch.source_document, score })}
                    </p>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}
    </StepFrame>
  )
}
