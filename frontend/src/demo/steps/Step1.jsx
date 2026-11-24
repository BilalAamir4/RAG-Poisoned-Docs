import React from 'react'
import { BookOpenIcon, ChevronRightIcon, MessageCircleIcon, MessageSquareTextIcon, SearchIcon } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Trace, TraceIcon, TraceLine, TraceTitle } from '@/components/ui/trace'
import { demoContent } from '../demoContent.js'
import { JargonTerm, StepFrame } from '../parts.jsx'

const ICONS = [MessageCircleIcon, SearchIcon, BookOpenIcon, MessageSquareTextIcon]

// stage = number of diagram stages revealed (0-4); owned by DemoApp so the arrow keys can step through it.
export default function Step1({ stage }) {
  const c = demoContent.step1
  return (
    <StepFrame title={c.title} lead={c.lead}>
      <p className="text-base font-semibold text-sh-primary" data-testid="brand">
        {demoContent.brand.name} <span className="font-normal text-sh-muted-foreground">— {demoContent.brand.tagline}</span>
      </p>
      <div className="grid grid-cols-4 items-stretch gap-3" data-testid="diagram" data-revealed={stage}>
        {c.stages.map((s, i) => {
          const Icon = ICONS[i]
          const shown = i < stage
          return (
            <div key={s.title} className="relative flex" data-testid={`stage-${i + 1}`} data-shown={shown}>
              <Card
                className={`w-full ${shown ? 'animate-in fade-in slide-in-from-bottom-2' : 'invisible'}`}
                aria-hidden={!shown}
              >
                <CardHeader>
                  <Trace>
                    <TraceLine>
                      <TraceIcon><Icon /></TraceIcon>
                      <TraceTitle className="whitespace-normal text-base font-medium text-sh-foreground">
                        {i + 1}. {s.title}
                      </TraceTitle>
                    </TraceLine>
                  </Trace>
                </CardHeader>
                <CardContent className="text-base leading-snug">
                  {s.caption ?? (
                    <>
                      {s.before}
                      <JargonTerm term={s.term.gloss}>{s.term.label}</JargonTerm>
                      {s.after}
                    </>
                  )}
                </CardContent>
              </Card>
              {i < c.stages.length - 1 && shown && (
                <ChevronRightIcon className="absolute -right-3 top-1/2 z-10 size-6 -translate-y-1/2 text-sh-muted-foreground" aria-hidden="true" />
              )}
            </div>
          )
        })}
      </div>
      {stage < c.stages.length && <p className="text-sm text-sh-muted-foreground">{c.hint}</p>}
    </StepFrame>
  )
}
