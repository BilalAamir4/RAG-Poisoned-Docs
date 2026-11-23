import React, { useCallback, useEffect, useState } from 'react'
import { CircleAlertIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { demoContent } from '../demoContent.js'
import { getDocument } from '../demoApi.js'
import { Highlight, StepFrame } from '../parts.jsx'

export default function Step3() {
  const c = demoContent.step3
  const [doc, setDoc] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(() => {
    setError(null)
    const ctl = new AbortController()
    getDocument(demoContent.docName, ctl.signal)
      .then(setDoc)
      .catch((e) => { if (!ctl.signal.aborted) setError(e.message) })
    return () => ctl.abort()
  }, [])
  useEffect(() => load(), [load])

  return (
    <StepFrame title={c.title} lead={c.lead}>
      {error && (
        <Alert data-testid="run-error" className="border-primary">
          <CircleAlertIcon />
          <AlertTitle>{demoContent.live.errorTitle}</AlertTitle>
          <AlertDescription>
            <p className="text-foreground">{error}</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={load}>{demoContent.live.retry}</Button>
          </AlertDescription>
        </Alert>
      )}
      {!doc && !error && <Skeleton className="h-48 w-full" aria-label={c.loading} />}
      {doc && (
        <div className="grid grid-cols-3 gap-4">
          <Card className="col-span-2">
            <CardContent>
              <p className="mb-2 font-mono text-sm text-muted-foreground">{doc.filename}</p>
              <div data-testid="doc-text" className="max-h-[48vh] overflow-y-auto whitespace-pre-wrap text-sm leading-snug">
                <Highlight text={doc.text} spans={doc.injected_span ? [doc.injected_span] : []} label={c.hiddenLabel} />
              </div>
            </CardContent>
          </Card>
          <Card className="self-start">
            <CardContent className="text-base leading-snug">{c.explain}</CardContent>
          </Card>
        </div>
      )}
    </StepFrame>
  )
}
