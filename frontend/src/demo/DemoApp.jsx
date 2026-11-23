import React, { useCallback, useEffect, useRef, useState } from 'react'
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
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { Progress } from '@/components/ui/progress'
import { TooltipProvider } from '@/components/ui/tooltip'
import { demoContent, fmt } from './demoContent.js'
import { dropSandbox } from './demoApi.js'
import Step1 from './steps/Step1.jsx'
import Step2 from './steps/Step2.jsx'
import Step3 from './steps/Step3.jsx'
import Step4 from './steps/Step4.jsx'
import Step5 from './steps/Step5.jsx'
import Step6 from './steps/Step6.jsx'
import Step7 from './steps/Step7.jsx'
import './demo.css'

const TOTAL = 7
const TITLES = [1, 2, 3, 4, 5, 6, 7].map((n) => demoContent[`step${n}`].title)
const LAST_STAGE = demoContent.step1.stages.length

// '#/demo' -> step 1 (explicit:false); '#/demo/N' -> step N (explicit:true). Anything else is not a demo hash.
export function parseDemoHash(hash) {
  const m = String(hash || '').match(/^#?\/?demo(?:\/(\d+))?\/?$/)
  if (!m) return null
  const n = m[1] ? Number(m[1]) : 1
  return { step: n >= 1 && n <= TOTAL ? n : 1, explicit: Boolean(m[1]) }
}

export default function DemoApp() {
  const [route, setRoute] = useState(() => parseDemoHash(window.location.hash) || { step: 1, explicit: false })
  // Step 1's diagram: the bare landing starts empty; #/demo/1 and coming back from step 2 show it fully revealed.
  const [stage, setStage] = useState(route.explicit ? LAST_STAGE : 0)
  const [leaveTo, setLeaveTo] = useState(null)
  const sandboxRef = useRef(false)
  const restoreRef = useRef(null)
  const stepRef = useRef(route.step)
  stepRef.current = route.step
  const step = route.step

  const onSandboxChange = useCallback((exists) => { sandboxRef.current = exists }, [])
  const registerRestore = useCallback((fn) => { restoreRef.current = fn }, [])

  // Leaving the demo (any route) while a sandbox exists: best-effort cleanup so it never lingers.
  useEffect(() => () => { if (sandboxRef.current) dropSandbox().catch(() => {}) }, [])

  const requestHash = useCallback((hash) => {
    if (stepRef.current === 7 && sandboxRef.current && !/#\/demo\/7$/.test(hash)) {
      setLeaveTo(hash)
      return
    }
    window.location.hash = hash
  }, [])

  useEffect(() => {
    const onHash = () => {
      const r = parseDemoHash(window.location.hash)
      if (!r) return // left the demo: App switches screens
      if (stepRef.current === 7 && sandboxRef.current && r.step !== 7) {
        window.history.replaceState(null, '', '#/demo/7')
        setLeaveTo(`#/demo/${r.step}`)
        return
      }
      setRoute(r)
      if (r.step === 1 && r.explicit) setStage(LAST_STAGE)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const next = useCallback(() => {
    if (stepRef.current === 1 && stage < LAST_STAGE) setStage((s) => s + 1)
    else if (stepRef.current < TOTAL) requestHash(`#/demo/${stepRef.current + 1}`)
  }, [stage, requestHash])
  const back = useCallback(() => {
    if (stepRef.current === 1) { if (stage > 0) setStage((s) => s - 1) }
    else requestHash(`#/demo/${stepRef.current - 1}`)
  }, [stage, requestHash])

  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target
      if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable)) return
      if (t && t.closest && t.closest('[role="alertdialog"]')) return
      if (e.key === 'ArrowRight') { e.preventDefault(); next() }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); back() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, back])

  const confirmLeave = async () => {
    const ok = restoreRef.current ? await restoreRef.current() : true
    if (ok) {
      const target = leaveTo
      sandboxRef.current = false
      setLeaveTo(null)
      window.location.hash = target
    }
  }

  const body = {
    1: <Step1 stage={stage} />,
    2: <Step2 />,
    3: <Step3 />,
    4: <Step4 />,
    5: <Step5 />,
    6: <Step6 />,
    7: <Step7 onSandboxChange={onSandboxChange} registerRestore={registerRestore} />,
  }[step]

  const ch = demoContent.chrome
  return (
    <TooltipProvider>
      <div className="demo-root sh-scope flex min-h-screen flex-col bg-background text-base text-foreground">
        <header className="flex items-center justify-end px-8 pt-3">
          <a
            href="#/trace"
            data-testid="inspector-link"
            className="rounded px-2 py-1 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
            onClick={(e) => { e.preventDefault(); requestHash('#/trace') }}
          >
            {ch.inspectorLink}
          </a>
        </header>
        <main className="mx-auto w-full max-w-[1700px] flex-1 px-8 pb-4" data-testid="demo-main" data-step={step}>
          {body}
        </main>
        <footer className="sticky bottom-0 border-t bg-background/95 px-8 py-3 backdrop-blur">
          <Progress value={(step / TOTAL) * 100} className="mb-3 h-2" aria-label={fmt(ch.stepOf, { n: step, total: TOTAL })} />
          <div className="flex items-center justify-between gap-4">
            <Button variant="outline" size="lg" className="h-12 px-6 text-base" onClick={back} data-testid="back-btn" disabled={step === 1 && stage === 0}>
              {ch.back}
            </Button>
            <nav className="flex items-center gap-2" aria-label="Steps">
              {TITLES.map((title, i) => (
                <Button
                  key={title}
                  variant={i + 1 === step ? 'default' : 'ghost'}
                  className="size-10 text-base"
                  title={title}
                  aria-label={`${i + 1}. ${title}`}
                  aria-current={i + 1 === step ? 'step' : undefined}
                  data-testid={`step-dot-${i + 1}`}
                  onClick={() => requestHash(`#/demo/${i + 1}`)}
                >
                  {i + 1}
                </Button>
              ))}
              <span className="ml-3 text-sm text-muted-foreground" data-testid="step-label">
                {fmt(ch.stepOf, { n: step, total: TOTAL })}
              </span>
            </nav>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <Kbd>←</Kbd><Kbd>→</Kbd> {ch.keysHint}
              </span>
              <Button size="lg" className="h-12 px-6 text-base" onClick={next} data-testid="next-btn" disabled={step === TOTAL}>
                {ch.next}
              </Button>
            </div>
          </div>
        </footer>
        <AlertDialog open={leaveTo !== null} onOpenChange={(o) => { if (!o) setLeaveTo(null) }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{demoContent.step7.leaveDialog.title}</AlertDialogTitle>
              <AlertDialogDescription>{demoContent.step7.leaveDialog.body}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{demoContent.step7.leaveDialog.cancel}</AlertDialogCancel>
              <AlertDialogAction onClick={(e) => { e.preventDefault(); confirmLeave() }}>
                {demoContent.step7.leaveDialog.confirm}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  )
}
