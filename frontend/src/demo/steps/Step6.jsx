import React, { useCallback, useEffect, useState } from 'react'
import { CircleAlertIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { demoContent, fmt } from '../demoContent.js'
import { getAuditRow, getTestRuns } from '../demoApi.js'
import { StatusBadge, StepFrame } from '../parts.jsx'
import { getLiveRunIds } from '../session.js'

const DATE_IN_EVAL_ID = /(\d{4}-\d{2}-\d{2})T([\d:]{8})/

function TechniqueBar({ tech }) {
  const total = tech.trials_count || 0
  const blocked = tech.blocked_count || 0
  const succeeded = total - blocked
  const pct = (n) => (total ? (n / total) * 100 : 0)
  return (
    <div data-testid="technique-row">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <span className="text-base font-medium">{tech.label}</span>
        <span className="text-sm text-sh-muted-foreground">
          {demoContent.step6.statsBlocked} {blocked}/{total} · {demoContent.step6.statsSucceeded} {succeeded}/{total}
        </span>
      </div>
      <div className="mt-1 flex h-4 w-full overflow-hidden rounded bg-sh-muted" role="img" aria-label={`${tech.label}: ${blocked} of ${total} blocked`}>
        <div className="h-full bg-[var(--status-teal)]" style={{ width: `${pct(blocked)}%` }} data-testid="bar-blocked" />
        <div className="h-full bg-[var(--status-red)]" style={{ width: `${pct(succeeded)}%` }} data-testid="bar-succeeded" />
      </div>
    </div>
  )
}

export default function Step6() {
  const c = demoContent.step6
  const [tests, setTests] = useState(null)
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(() => {
    setError(null)
    const ctl = new AbortController()
    ;(async () => {
      try {
        const t = await getTestRuns(ctl.signal)
        const ids = getLiveRunIds()
        const found = await Promise.all(ids.map((id) => getAuditRow(id, ctl.signal).catch(() => null)))
        setTests(t)
        setRows(found.filter(Boolean))
      } catch (e) {
        if (!ctl.signal.aborted) setError(e.message)
      }
    })()
    return () => ctl.abort()
  }, [])
  useEffect(() => load(), [load])

  const meta = tests?.promptfoo_metadata
  const date = (String(meta?.eval_id || '').match(DATE_IN_EVAL_ID) || []).slice(1).join(' ')
  const model = String(meta?.model || '').replace(/^openai:chat:/, '')
  const techniques = Object.values(tests?.by_technique || {})

  return (
    <StepFrame title={c.title} lead={c.lead}>
      {error && (
        <Alert data-testid="run-error" className="border-sh-primary">
          <CircleAlertIcon />
          <AlertTitle>{demoContent.live.errorTitle}</AlertTitle>
          <AlertDescription>
            <p className="text-sh-foreground">{error}</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={load}>{demoContent.live.retry}</Button>
          </AlertDescription>
        </Alert>
      )}
      {!tests && !error && <Skeleton className="h-48 w-full" aria-label={c.loading} />}
      {tests && (
        <div className="grid grid-cols-[2fr_3fr] gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{c.chartTitle}</CardTitle>
              {meta && <p className="text-sm text-sh-muted-foreground" data-testid="run-meta">{fmt(c.runMeta, { date: date || meta.eval_id, model })}</p>}
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {techniques.length === 0 ? (
                <p className="text-sh-muted-foreground">{c.emptyTests}</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-base" data-testid="stats">
                    <span>{c.statsTrials}: <b>{tests.stats.trials_run}</b></span>
                    <span>{c.statsSucceeded}: <b>{tests.stats.succeeded}</b></span>
                    <span>{c.statsBlocked}: <b>{tests.stats.blocked}</b></span>
                    <span>{c.statsRate}: <b>{Number(tests.stats.block_rate_pct).toFixed(1)}%</b></span>
                  </div>
                  {techniques.map((t) => <TechniqueBar key={t.label} tech={t} />)}
                  <p className="text-sm text-sh-muted-foreground">{c.chartNote}</p>
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{c.sessionTitle}</CardTitle>
              <p className="text-sm text-sh-muted-foreground">{c.sessionNote}</p>
            </CardHeader>
            <CardContent className="max-h-[40vh] overflow-y-auto" data-testid="session-scroll">
              {rows && rows.length === 0 ? (
                <p className="text-sh-muted-foreground" data-testid="session-empty">{c.sessionEmpty}</p>
              ) : (
                <Table data-testid="session-rows">
                  <TableHeader>
                    <TableRow>
                      <TableHead>{c.colTime}</TableHead>
                      <TableHead>{c.colDoc}</TableHead>
                      <TableHead>{c.colScore}</TableHead>
                      <TableHead>{c.colStatus}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(rows || []).map((r) => (
                      <TableRow key={r.id} data-testid={`audit-${r.id}`}>
                        <TableCell className="font-mono text-sm px-1">{new Date(r.timestamp).toTimeString().slice(0, 8)}</TableCell>
                        <TableCell>{r.source_document}</TableCell>
                        <TableCell className="font-mono text-sm">{r.similarity_score != null ? Number(r.similarity_score).toFixed(2) : '—'}</TableCell>
                        <TableCell><StatusBadge status={r.final_status} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </StepFrame>
  )
}
