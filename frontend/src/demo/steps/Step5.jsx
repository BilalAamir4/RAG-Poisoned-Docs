import React, { useMemo, useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { TraceCollapsible, TraceCollapsibleContent, TraceCollapsibleTrigger, TraceIcon, TraceLine, TraceTitle } from '@/components/ui/trace'
import { CircleCheckIcon, CircleXIcon, FlagIcon, CircleAlertIcon } from 'lucide-react'
import { DEFENSE_KEYS } from '../../status.js'
import { demoContent, fmt } from '../demoContent.js'
import { getSettingsReadOnly, runDemoQuery } from '../demoApi.js'
import { FlagChips, PipelineTrace, ReplayBanner, RunStatus, StatusBadge, StepFrame } from '../parts.jsx'
import { recordedRowRun } from '../replay.js'
import { getNormalScores } from '../session.js'
import { useAsyncRun } from '../useAsyncRun.js'
import { evaluateTable, rawRepeated, thresholdNote, whereStopped } from '../verdicts.js'

const names = (ids) => ids.map((id) => demoContent.step5.defenseNames[id]).join(', ')

export default function Step5() {
  const c = demoContent.step5
  const run = useAsyncRun('query')
  const [results, setResults] = useState({}) // rowId -> live response
  const [recorded, setRecorded] = useState(false) // the whole table is recorded, or none of it is
  const [current, setCurrent] = useState(null)
  const [limit, setLimit] = useState(null)

  const recordedResults = useMemo(() => {
    const out = {}
    c.rows.forEach((r) => { out[r.id] = recordedRowRun(r.id) })
    return out
  }, [c.rows])
  const canReplay = c.rows.every((r) => recordedResults[r.id])

  const runAll = () => {
    setRecorded(false)
    setResults({})
    run.start(async (signal) => {
      // read-only: the limit currently configured, sent explicitly so the run never depends on or changes Settings
      const settings = await getSettingsReadOnly(signal)
      const lim = Number(settings?.mitigations?.threshold_value)
      setLimit(lim)
      const out = {}
      for (const row of c.rows) {
        setCurrent(row.id)
        const flags = { ...Object.fromEntries(DEFENSE_KEYS.map((k) => [k, row.on.includes(k)])), threshold_value: lim }
        out[row.id] = await runDemoQuery({ query: demoContent.queries.trigger, mitigations: flags, signal })
        setResults({ ...out })
      }
      setCurrent(null)
      return out
    })
  }
  const showRecorded = () => {
    setResults({})
    setRecorded(true)
    run.reset()
  }

  const shown = recorded ? recordedResults : results
  const table = evaluateTable(c.rows.map((r) => ({ id: r.id, run: shown[r.id] || null })))
  const note = !recorded && limit != null ? thresholdNote(getNormalScores(), limit) : null

  return (
    <StepFrame title={c.title} lead={c.lead}>
      <div className="flex items-center justify-between gap-6">
        <p className="text-sm text-muted-foreground" data-testid="one-run-line">{c.oneRun}</p>
        <Button size="lg" className="h-12 shrink-0 px-6 text-base" onClick={runAll} disabled={run.state === 'running'}>{c.runAll}</Button>
      </div>
      <RunStatus
        run={run}
        onRetry={runAll}
        onShowRecorded={canReplay ? showRecorded : undefined}
        recordedLabel={demoContent.live.showRecordedTable}
      />
      {recorded && <ReplayBanner />}
      <Table data-testid="step5-table">
        <TableHeader>
          <TableRow>
            <TableHead className="w-1/4">{c.colDefense}</TableHead>
            <TableHead>{c.colRaw}</TableHead>
            <TableHead className="w-1/3">{c.colUser}</TableHead>
            <TableHead>{c.colVerdict}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {table.rows.map((r) => {
            const def = c.rows.find((x) => x.id === r.id)
            const flags = Object.fromEntries(DEFENSE_KEYS.map((k) => [k, def.on.includes(k)]))
            const stopped = r.run && r.id !== 'none' ? whereStopped(r.run) : null
            const flagged = r.run?.stages?.threshold_flagged
            return (
              <TableRow key={r.id} data-testid={`row-${r.id}`} className="align-top whitespace-normal">
                <TableCell className="whitespace-normal">
                  <div className="font-semibold">{def.name}</div>
                  <div className="text-sm text-muted-foreground">{def.desc}</div>
                  {r.id === 'retrieval_score_threshold' && (
                    <div className="text-sm text-muted-foreground" data-testid="threshold-idea">{c.thresholdIdea}</div>
                  )}
                  {r.id === 'retrieval_score_threshold' && note && (
                    <div className="mt-1 text-sm" data-testid="threshold-note">
                      {fmt(c.thresholdNote, { limit, n: note.n, m: note.m })}
                    </div>
                  )}
                </TableCell>
                {r.run ? (
                  <>
                    <TableCell className="whitespace-normal">
                      <Badge variant="gray" data-testid={`raw-${r.id}`} data-repeated={rawRepeated(r.run)}>
                        {rawRepeated(r.run) ? <CircleXIcon aria-hidden="true" /> : <CircleCheckIcon aria-hidden="true" />}
                        {rawRepeated(r.run) ? c.rawRepeated : c.rawClean}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <p className="line-clamp-3 text-base leading-snug">{r.run.response}</p>
                      <details className="text-sm text-muted-foreground">
                        <summary className="cursor-pointer">{c.fullAnswer}</summary>
                        <p className="mt-1 text-foreground">{r.run.response}</p>
                      </details>
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={r.verdict} />
                        {flagged && (
                          <Badge variant="amber"><FlagIcon aria-hidden="true" />{c.flaggedBadge}</Badge>
                        )}
                      </div>
                      {stopped && (
                        <p className="mt-1 text-sm text-muted-foreground" data-testid={`stopped-${r.id}`}>
                          {stopped.kind === 'facts'
                            ? fmt(c.stopped.facts, { filter: c.stopped[stopped.filter === 'notOn' ? 'notOn' : stopped.filter], sanitization: c.stopped[stopped.sanitization] })
                            : c.stopped[stopped.kind]}
                        </p>
                      )}
                      <TraceCollapsible>
                        <TraceCollapsibleTrigger>
                          <TraceLine>
                            <TraceIcon><CircleAlertIcon /></TraceIcon>
                            <TraceTitle className="text-sm">{demoContent.pipeline.title}</TraceTitle>
                          </TraceLine>
                        </TraceCollapsibleTrigger>
                        <TraceCollapsibleContent><PipelineTrace run={r.run} /></TraceCollapsibleContent>
                      </TraceCollapsible>
                    </TableCell>
                  </>
                ) : (
                  <TableCell colSpan={3} className="text-muted-foreground">
                    {current === r.id ? (
                      <span className="inline-flex items-center gap-2"><Spinner />{c.runningRow}</span>
                    ) : (
                      c.pending
                    )}
                    <div className="mt-1"><FlagChips flags={flags} limit={limit} /></div>
                  </TableCell>
                )}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      {table.rows.every((r) => r.run) && (
        <Alert data-testid="step5-summary">
          <AlertTitle className="flex flex-col gap-1 text-base">
            {!table.baselineLeaked ? (
              <span>{c.summaryNothing}</span>
            ) : (
              <>
                <span data-testid="summary-blocked">
                  {table.blockedBy.length ? fmt(c.summaryBlocked, { list: names(table.blockedBy) }) : c.summaryNone}
                </span>
                {table.didNotBlock.length > 0 && (
                  <span data-testid="summary-did-not">{fmt(c.summaryDidNot, { list: names(table.didNotBlock) })}</span>
                )}
              </>
            )}
            <span data-testid="summary-all">{fmt(c.allFour, { result: c.allFourResult[table.allFour] })}</span>
          </AlertTitle>
          {table.showTakeaway && (
            <AlertDescription className="text-base text-foreground" data-testid="takeaway">
              {fmt(c.takeaway, { list: names(table.redSingles) })}
            </AlertDescription>
          )}
        </Alert>
      )}
    </StepFrame>
  )
}
