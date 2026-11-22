# UI_AUDIT.md — Sentinel RAG UI/UX Congestion Audit (pre-P17)

## 0. Evidence basis
- **Screenshots:** 8 user-supplied captures (Live trace, Chat, Documents, Audit log, Attack replay, Test suite ×2, Settings). They are all at a **single width: a ~1666×1040 browser viewport, not 1440×900**. Findings marked **[screenshot]** come from these.
- **Browser tool:** none used, on purpose.
  - Visiting `#/replay` fires `POST /query` automatically on mount (`TraceDetail.jsx:249-253`).
  - The first `GET /test-runs` after a backend start writes one audit row per Promptfoo trial (`backend/main.py:456-463` → `backend/promptfoo_runner.py:252-262`).
  - Browsing the app would therefore change app state, which hard constraint 2 forbids.
  - Behaviour at **1024, 780 and 390** is derived from CSS only (**[code]**/**[inferred]**).
- **Mockup:** `sentinel-rag.html` is deleted in the working tree (uncommitted ` D`), so it was read from `HEAD` via `git show`.
  - It uses the same small type scale: 12.5/13/12/10/10.5/11px, `.content{max-width:980px}`, metric gap 10px.
  - Much of today's density is therefore **inherited from the mockup**, and P11/P12/P18 added more on top.
- **Vitest baseline:** `npx vitest run` gave **34/34 passed across 7 files** (Settings 5, AuditLog 5, TraceDetail 5, Chat 5, Documents 5, TestSuiteResults 5, LiveTrace 4).
- **Pytest coupling to UI files** (not run, because these tests call the live backend). These static assertions also constrain UI changes:
  - `tests/test_frontend_shell.py:74-93`: the strings `trace, chat, documents, audit, replay, test-runs, settings` must appear in both `App.jsx` and `Sidebar.jsx`.
  - `tests/test_audit_log_screen.py:183-204`: `td.time` and `td.sim` must use `var(--mono)`; `table` and `td` must not.
  - `tests/test_trace_detail_screen.py:70-77`: `.highlight-attack`, `.highlight-delimiter`, `var(--red`, `var(--teal` must exist in `index.css`; zero `dangerouslySetInnerHTML`.
  - `tests/test_settings_screen.py:56`: the exact badge text `[Naive Keyword Filter — Known Regex Limitations]` must exist.
- **Discrepancy to note:** the Settings screenshot shows `LLM qwen3.5:latest`, but PROJECT_STATE says the active runtime is llama3.1. See decision D9.
- **Undocumented work:** commit `b0c7320 "P18: animated sidebar, stat counters…"` is not recorded in PROJECT_STATE.md.

## 1. Executive summary
- **Space is mis-allocated, not just dense.**
  - `.content{max-width:980px}` (`index.css:185`) leaves ~40% of a wide screen empty [screenshot, every screen]. Meanwhile the trial table wraps "View trace →" onto two lines and Trace Detail squeezes two 11px mono code columns side by side.
  - 16 of 42 font-size declarations are ≤11px.
  - `--text-muted` measures **2.78:1** on `--panel`, which fails WCAG AA. It is used for table headers, file metadata and trial numbers.
  - Together these make every screen read as fine print on a projector.
- **Test Suite renders partly broken.**
  - Metric cards use 4 classes that don't exist (`metric-label/val/sub`, `metric-card`), so label, value and subtitle all render as identical 16px text [screenshot + code `TestSuiteResults.jsx:110-136`].
  - Outcome and Promptfoo badges use the undefined `badge safe`/`badge danger`, so they show as plain white text.
  - The config chips spend teal, amber and violet decoratively, which breaks the reserved-color rule.
- **Attack Replay is the most crowded screen and the least trustworthy.**
  - It has ~12 boxed regions, 4 nested scrollers and a duplicated threshold line.
  - Its column titles, badges and banners are hard-coded: red "Attack succeeded… exfiltrated" and teal "Prompt injection blocked" always render, whatever the run actually did.
  - The screenshot shows a "Unmitigated Run (Baseline)" with **all four mitigations ON** and status `sanitized`, next to a "Defended" badge shown **before** the re-run has finished.
- **Mitigation controls contradict each other.**
  - There are three surfaces; two of them are combined all-4 switches.
  - Sidebar and Chat show "On" when **any** one control is on.
  - Chat silently sends a per-request all-4 override, which defeats granular Settings.
  - Settings has **no way to turn the flag threshold off**: moving the slider forces it ON.
- **Copy misdescribes the mechanisms.**
  - Output filter is described as "leaked system prompt"; it actually matches the injected claim/URL.
  - The threshold is described as "similarity to known attack patterns"; it is actually a retrieval-score relevance proxy and only logs.
  - The audit badge says "Prompt leaked".
  - Chat shows "Untrusted content wrapped — instruction ignored" for runs that were only flagged by the threshold.
- **Vocabulary and colors drift across screens.**
  - `sanitized` is teal on Live trace and amber on Audit log.
  - `flagged` is amber on Live trace and red on Audit log.
  - "Leaked / Prompt leaked / LEAKED / Succeeded / Injected instruction followed" all mean the same thing.
- **Top 5 fixes:**
  1. Repair Test Suite styling (T1-01..T1-04).
  2. Make Trace Detail verdicts data-driven (T2-01).
  3. Correct the security copy (T1-08, T1-09).
  4. Consolidate mitigation controls to a single source of truth (T2-07, T2-08; decisions D1/D2).
  5. Widen content and raise the type and contrast floor (T1-12, T1-18, D3).

## 2. Test-coupled class-name contract
Renaming or removing anything in this table needs the listed test update.

| Element / class / id | Asserted value | Test file:line |
|---|---|---|
| `#node-scan`, `#node-generate` className | exactly `node ` / contains `node flagged`, `node safe` | LiveTrace.test.jsx:38-39, 78, 82, 129, 133, 176, 180 |
| `#line-retrieve-scan`, `#line-scan-generate` | exactly `line ` / contains `line danger`, `line safe` | LiveTrace.test.jsx:40-41, 79, 83, 130, 134, 177, 181 |
| `#metric-queries-today .val`, `#metric-injection-attempts .val`, `#metric-blocked .val`, `#metric-detection-rate .val` | text `0`, `1`, `0/0`, `0/1`, `1/1`, `—`, `100%`, `0%` | LiveTrace.test.jsx:44-47, 86-88, 137-139, 184-186 |
| `#live-trace-banner` | null at baseline; contains `banner danger`/`banner safe` | LiveTrace.test.jsx:48, 91-93, 142-144, 189-191 |
| `#flagged-doc-info` | contains `faq_doc.md` | LiveTrace.test.jsx:97-99 |
| `#chatToggle` / `#chatToggleState` | `toggle off`/`toggle on`; text `Mitigation: On` | Chat.test.jsx:118-121, 146, 221-228, 287-292 |
| `#chat-input-field`, `#chat-submit-btn`, `#chat-answer-1`, `#chat-answer-3` | exist / text | Chat.test.jsx:125-126, 326-331 |
| `.bubble-user`, `.answer-text`, `.citerow`, `.citechip`, `.filetag.doc` | exist; filetag has class `doc` | Chat.test.jsx:161-177, 308, 386 |
| `.banner.danger` / `.banner.safe` | className **exactly** `banner danger` / `banner safe`; text `Injected instruction followed` | Chat.test.jsx:180-183, 317, 323; `.banner` null on clean, :391 |
| `sendQuery` payload | `{query, mitigations:{all four false}}` | Chat.test.jsx:186-194 |
| `updateSettings` payload from chat toggle | all four `true` | Chat.test.jsx:231-236 |
| `doc-card-*` className | contains `doc-card`, `warn` / not `warn` | Documents.test.jsx:118-127 |
| doc badge | contains `badge red` / `badge teal` | Documents.test.jsx:121-130 |
| `role=alert` upload banner | contains `banner safe`/`banner danger` | Documents.test.jsx:176-177, 239-240 |
| `dropzone` | contains `dragover` | Documents.test.jsx:206-210 |
| heading level 1 text `Documents`; text `1.8 KB`, `3.4 KB` | — | Documents.test.jsx:61-74 |
| Audit `th` texts | exactly `['Time','Event','Source document','Similarity score','Status']` | AuditLog.test.jsx:74-83 |
| `tr.logrow` className | exactly `logrow ` / `logrow flagged` | AuditLog.test.jsx:85, 96, 102, 108, 114, 127, 152 |
| `td.time/.event/.source/.sim` | className exactly `time`/`event`/`source`/`sim`; `.event` text `Generation` | AuditLog.test.jsx:90-93, 224-238 |
| status badges | `Clean`→`teal`; `Prompt leaked`→`red`; `Blocked`→`teal`; `Sanitized`→`amber` | AuditLog.test.jsx:94-113 |
| `filter-*-btn` | className contains `active` | AuditLog.test.jsx:144-145, 197 |
| `#delimiterToggle`, `#sanitizationToggle`, `#outputFilterToggle` | contains `toggle off`/`toggle on` | Settings.test.jsx:71-77, 113-138, 189-191 |
| `#naiveFilterBadge` | exact text and contains `badge` | Settings.test.jsx:80-83 (+ pytest) |
| `#thresholdSlider` type=range; `#thresholdValue` text `0.30` | — | Settings.test.jsx:86-91, 149-150 |
| `#configLlmModel` etc. | text | Settings.test.jsx:94-97, 211-216 |
| Test-suite testids `metric-trials/succeeded/blocked/rate` | text content | TestSuiteResults.test.jsx:169-172, 203-206 |
| `bar-unmitigated` / `bar-all_mitigations` | contains `fill-red` / `fill-teal` | TestSuiteResults.test.jsx:175-179 |
| `trial-row-N` | contains `All OFF`, `Failed`, `LEAKED`, `Delim`, `Sanit`, `OutFilter`, `Passed`, `BLOCKED` | TestSuiteResults.test.jsx:223-237 |
| text `View trace →` (count 2); `eval-live-promptfoo-100`; `No live Promptfoo trials recorded yet` | — | TestSuiteResults.test.jsx:182, 210, 250-262 |
| error `role=alert` | contains `banner danger` | TestSuiteResults.test.jsx:278-280 |
| `highlight-attack` / `highlight-delimiter` (React nodes) | className on spans | TraceDetail.test.jsx:95, 114, 169, 173 |
| `unmitigated-threshold-value` / `-threshold-summary` / `-control-flag-threshold` | `—`; `Flag Threshold: OFF (—)`; `OFF` | TraceDetail.test.jsx:132-141 |
| `unmitigated-banner` / `mitigated-banner` | class `danger` + text `Attack succeeded` / class `safe` + text `Prompt injection blocked` | TraceDetail.test.jsx:156-164 |
| `column-unmitigated`, `column-mitigated`, `unmitigated-chunk`, `mitigated-chunk`, `rerun-full-defense-btn` | exist | TraceDetail.test.jsx:128, 151-152, 168-186 |

Fixtures relevant to the planned changes:
- TraceDetail test fixtures use `final_status:'leaked'` for the base run and `'blocked'` for the re-run, so status-driven banners keep these tests green.
- The TraceDetail Check 4 test needs a re-run to happen. That interacts with T2-02.

## 3. Design-system inventory (measured)
- **`index.css` size:** 19,175 bytes, 1,068 lines, 178 rule blocks.
- **Helper CSS files:** `components/ui/*.css` add 3 more files: LineSidebar 129 lines, AnimatedList 74, Counter 50.
- **Font sizes in `index.css`:** 12 distinct values.
  - 11px×9, 12×7, 13×6, 12.5×6, 10.5×4, 14×2, 11.5×2, 10×2, 9.5×1, 19×1, 18×1, 13.5×1.
  - **16 of 42 declarations are ≤11px.**
  - The JSX adds inline `fontSize` 10px×4, 11px×2, 12px×1, plus Tailwind `text-xs`×20, `text-sm`×4, `text-base`×2 and `text-[10px]`×5.
  - Unstyled Test Suite cards fall back to the browser's 16px.
  - Effective distinct sizes on screen: about 15.
- **Font weights:** 500×7 and 600×8 (consistent).
- **Border radii:** 11 distinct values: 8×5, 7×5, 6×4, 10×4, 50%×3, 5×2, 4×2, 3×2, 9×1, `9 9 2 9`×1, 1×1.
- **Padding:** 30 distinct shorthand values, for example 10px 12px, 12px 14px, 16px 18px, 9px 13px, 7px 13px, 6px 13px.
- **Gaps:** 10 distinct values (2, 6, 7, 8, 9, 10, 12, 16, 18, 20). **Margin-bottom:** 8 distinct values.
- **Hard-coded colors that bypass tokens:**
  - `index.css`: `#171A22` ×2 (`:281`, `:400`), `#181229` ×3 (`:220`, `:663`, `:674`), `rgba(225,90,90,.4/.7)` (`:589`, `:592`), and 4 white-alpha overlays (.015/.03/.05/.06).
  - JSX/ui: 17 more hex/rgba literals, mostly token duplicates inside LineSidebar, Counter and AnimatedList defaults (for example `#8B7FE8` ×3, `#2C3040` ×3).
- **Inline `style={{}}` count:** 58 in total.
  - Screens: LiveTrace 11, TestSuiteResults 11, Settings 10, AuditLog 5, Documents 5, Chat 2, TraceDetail 2.
  - Helpers: Counter 8, AnimatedList 3, LineSidebar 1.
- **Near-duplicate components:**
  - 8 boxed-panel variants, all with the same "panel + 1px border" look but 3 radii and 6 paddings: `.card`, `.doc-card`, `.trace-card`, `.trace-column-header`, `.trace-mitigations-panel`, `.sidebar-foot`, `.chat-input`, `.item`.
  - Segmented buttons: `.collection-chip` and `.filterbtn` have identical active styling but different background and padding (`index.css:550-569` vs `683-702`).
  - Tables: global `table/th/td` (th 10.5px muted) vs `.dense-table` (th 12px secondary) (`:703-737` vs `:945-968`).
  - Code/text boxes: `.trace-query-box`, `.trace-code-box`, `.trace-response-box` are 3 near-identical boxes (`:850-882`).
  - Label styles: `.lbl`, `.metric-grid .lbl`, `.node .lbl`, `.sidebar-foot .lbl`, `.trace-card-label` (uppercase), `.control-label`.
  - Metric cards: `.metric-grid .card .lbl/.val` (Live trace) vs undefined `.metric-card .metric-label/.metric-val/.metric-sub` (Test suite).
- **Classes used but never defined (verified against `index.css`, the `ui/*.css` files and the built `dist` CSS):**
  - `metric-card`, `metric-label`, `metric-val`, `metric-sub`, `cardhead`, `banner-text`, `mono`.
  - `badge safe`, `badge danger`.
  - Tailwind no-ops `text-secondary`, `text-primary`, `text-muted`. The color key is `text-secondary`, so the real utility is `text-text-secondary`.
  - Affected files: `TestSuiteResults.jsx` throughout, plus `TraceDetail.jsx:355` and `:369`.
- **Tailwind vs custom CSS conflict:**
  - `@tailwind utilities` is emitted at `index.css:3`, before every custom rule.
  - When specificity is equal, the custom class wins, so these overrides are silently dead: `btn ghost text-xs py-1 px-3` (`Chat.jsx:304,311`), `badge text-[10px]` (`TestSuiteResults.jsx:259-279`), `metric-grid mb-4`, and `card … p-5` (`TestSuiteResults.jsx:109,165,216`).
  - Tailwind is used ad hoc in Chat's empty state, TestSuiteResults layout, and the opacity helpers in Sidebar/Settings. Every other screen uses custom CSS.
- **Missing global styles:**
  - There is no `:focus`/`:focus-visible` rule anywhere, and `.chat-input input{outline:none}` (`:646`).
  - There is no `prefers-reduced-motion` handling.
- **Contrast (WCAG ratios, computed):**

  | Text | on `--bg` | on `--panel` | on `--panel-2` |
  |---|---|---|---|
  | `--text-muted` #565A6B | 2.91 ❌ | 2.78 ❌ | 2.67 ❌ |
  | `--text-secondary` | 6.01 | 5.74 | 5.51 |
  | violet | 5.97 | 5.71 | 5.47 |
  | red | 5.51 | 5.27 | 5.05 |
  | teal | 9.14 | 8.73 | 8.37 |
  | amber | 9.01 | 8.61 | 8.26 |

  - Status text on its own `-dim` wash over `--panel` passes: red 4.56, violet 4.79, teal 6.90, amber 6.91.
  - `--text-muted` is used in 9 CSS rules and 14 JSX spots.

## 4. Per-screen audits

### 4.1 Sidebar (`Sidebar.jsx`, `ui/LineSidebar.jsx`)
**a. Purpose.**
- Global navigation plus the always-visible mitigation state (spec 2.5 #1).
- It serves every demo step.

**b. Elements.**
- Brand, 7 nav items with icons, and a footer card holding the "Mitigation" label, a toggle and an On/Off word.
- 9 regions in total. Low density.

**c. Congestion.**
- The footer label is 10px muted (`index.css:131-135`), so it is small and low-contrast.
- The P18 proximity hover animation shifts labels up to 10px as the pointer passes (`LineSidebar.jsx:112-130`; `maxShift=10` default at `:33`). That is constant motion in peripheral vision and contradicts spec 2.5 #3 ("no hover animations scattered").

**d. Clarity.**
- "On" means **any** of the four is on (`Sidebar.jsx:109-112`). With only the flag threshold on, the sidebar says "On" even though nothing can block generation.
- Clicking flips **all four** to `!any` (`:114-131`).
- The click does not dispatch `mitigation-settings-changed`, so Chat and Settings stay stale until their next load (Sidebar polls every 8s; Settings never polls).
- The footer disappears entirely below 780px (`index.css:1035-1039`), which breaks spec 2.5 #1.

**e. Recommendations.**
- T1-06: add `title` and `aria-label` to nav items for the collapsed rail.
- T1-07: set `maxShift={0}` (or remove the proximity effect).
- T1-14: keep a compact mitigation indicator visible in the 64px rail.
- T2-07: turn the footer into a read-only 4-control indicator (decision D2).
- T2-17: make nav items keyboard-operable. They are `<li onClick>` with no tabIndex or role (`LineSidebar.jsx:189-198`).

### 4.2 Live Trace (`LiveTrace.jsx`), demo steps 3, 4 and 6
**a. Purpose.**
- A one-glance dashboard of the latest pipeline run plus cumulative metrics.
- It is the landing screen and the "Run test" demo surface.

**b. Elements.**
- Pagehead: title, subtitle, "Run test" button.
- Pipeline card: 5 nodes, 4 lines, 5 labels.
- 4 metric cards (one with 6 sparkbars).
- Latest query card: user bubble, answer, banner.
- Flagged-document card.
- Recent-runs card with 5 rows.
- That is **8 bordered boxes, all above the fold** [screenshot].
- About **10 simultaneous status-colored signals** compete for attention: red 50, teal 12/50, red Scan node, teal Generate node, teal banner, red dot, 1 teal and 4 red badges. None of them states an overall verdict.

**c. Congestion.**
- All 8 cards have equal weight (same `.card`); the 5-second story ("last run: attack blocked/leaked, by what") is not dominant.
- The flagged-doc card holds one line of content but takes a full card.
- The left query card has a large empty area, because the two-column row height is set by the right stack [screenshot].
- Recent-run separators are lost: each `.runrow` is wrapped in a motion div, so `.runrow:last-child{border-bottom:none}` matches every row (`index.css:467-469`, `ui/AnimatedList.jsx:163-178`) [screenshot: no separators].

**d. Clarity.**
- "Injection attempts" counts any run whose source is `faq_doc.md`, whose query contains "refund policy", or whose status is non-clean (`LiveTrace.jsx:31-44`). It is a heuristic presented as fact.
- "Queries today" silently falls back to *all loaded logs* when none are from today (`:113-116`).
- "Blocked 12/50" sits next to "Detection rate 22%" with no hint that these are independent (the threshold only flags). A panel member will read 22% as "caught 22%".
- The flagged section is hard-coded `'section 2'` (`:168`).
- The banner reads "Prompt injection blocked by active mitigation" while the sidebar says **Mitigation Off** [screenshot]. The latest row is a Promptfoo all-ON trial (inferred from the shared 05:37 timestamps in the Audit screenshot), so the screen contradicts itself.

**e. Recommendations.**
- T1-10: relabel the metrics (copy only).
- T1-15: fix the run-row separators.
- T2-12: merge the flagged-doc card into the recent-runs card.
- T3-02: add a verdict strip.
- D11: decide whether Promptfoo rows should count toward these metrics.

### 4.3 Chat (`Chat.jsx`), demo steps 2–5
**a. Purpose.** Ask a question and see the grounded answer, citations and safe/danger banner. Includes the before/after toggle in the header.

**b. Elements.**
- Empty state: dashed box, 2 lines, 2 prompt buttons.
- Populated thread: bubbles, answers, chips, banners.
- Header: "Mitigation: Off" toggle.
- Input bar.
- Not congested [screenshot]: the empty state is mostly blank space.

**c. Congestion.**
- The header toggle duplicates the sidebar footer, so the same "Mitigation Off" appears twice on screen [screenshot].
- Citation chips use the status palette decoratively: `.md` renders as a teal "DOC" tag (`Chat.jsx:27-30`, `index.css:530-541`), while Documents shows the same files as a violet "MD" tag.

**d. Clarity.**
- `determineBanner` returns the **safe** banner "Untrusted content wrapped — instruction ignored" for:
  - (i) any `blocked`/`sanitized` run, even when the delimiter was OFF and the output filter alone blocked it (`:102-114`);
  - (ii) runs that were only threshold-flagged (`:117-129`).
- Case (ii) implies that flagging defended the query. **This conflicts with hard constraint 5.**
- Every send overrides the server with `mitigations` set to all four equal to the header state (`:224-232`; backend `main.py:132-134`).
  - Example: if Settings has only Delimiter ON, the header shows "On" and the query runs with all four ON.
- The toggle is `role="button" tabIndex=0` but has no key handler (`:278-289`).

**e. Recommendations.**
- T1-09: correct the banner text and the flagged-only case.
- T1-11: neutral file tags.
- T2-07: header becomes a preset with a "Custom n/4" state, and Chat stops sending per-request overrides (decision D1).
- T2-17: keyboard support.

### 4.4 Documents (`Documents.jsx`), demo step 1 (show the poisoned file)
**a. Purpose.** Show the corpus and point at the one poisoned document.

**b. Elements.**
- Pagehead with Upload button.
- 4 collection chips.
- 7 document cards, each with tag, name, size and badge.
- Dropzone.
- About 13 boxes.

**c. Congestion.**
- **Each status badge stretches to the full card width**: `.doc-card` is a column flexbox with default `align-items:stretch` (`index.css:575-584`). The result is six full-width teal "Indexed" bars that out-shout the single red one [screenshot]. This is the biggest visual-noise item on the screen.
- The dropzone duplicates the "Upload files" button.

**d. Clarity.**
- Three of the four collection chips are static fake counts: "Legal contracts · 42", "Support tickets · 356", "Meeting notes · 89" (`:195-218`). Clicking them changes nothing.
- "Product docs" falls back to `|| 7` (`:193`).
- This conflicts with spec 2.5 #4 ("nothing is a static mockup value"), although spec 2.4 #3 permits the chips.
- "Flagged pattern" (a static payload/filename match in `main.py:176-180`) is a different concept from "flagged" elsewhere (the threshold). Same word, different meaning.

**e. Recommendations.**
- T1-05: `align-self:flex-start` on doc-card badges.
- T2-11: remove or disable the fake chips (decision D7).
- T2-17: keyboard support for the chips and dropzone. They have `role=button` but no key handler (`:187-219`, `:249-258`).

### 4.5 Audit Log (`AuditLog.jsx`), demo step 6
**a. Purpose.** A filterable, exportable evidence table of every pipeline run.

**b. Elements.**
- Pagehead with Export button.
- Filter pair.
- Table with 5 columns × up to 50 rows, with a badge per row [screenshot].

**c. Congestion.**
- The "Event" column is the constant "Generation" on every row (`:204, 219`). It spends a column on zero information [screenshot].
- The table header is 10.5px `--text-muted` at 2.78:1 contrast (`index.css:708-715`), which is unreadable on a projector.
- 50 rows with red "Prompt leaked" badges create a wall of red.
- There is no query text, so rows can't be told apart (all show `faq_doc.md` and 0.37/0.34/0.29) [screenshot].

**d. Clarity.**
- The "Prompt leaked" badge (`:35`) implies the *system prompt* leaked. What actually leaked is the injected false claim.
- `sanitized` is amber here (`:21-22`) but teal on Live trace (`LiveTrace.jsx:26`).
- `flagged` is red here (`:23-24`) but amber on Live trace (`LiveTrace.jsx:27`).
- "Flagged only" actually filters on `is_flagged OR status≠clean` (`:108-111`). It therefore includes leaked runs that were never threshold-flagged; a more accurate label is "Non-clean & flagged".
- Rows are clickable (`:213`) but nothing tells the user so (no chevron or hint), and they can't be reached by keyboard.

**e. Recommendations.**
- T1-12: header contrast and size.
- T1-13: horizontal scroll at 390.
- T2-09: replace Event with a Query column and fix badge text and colors (decision D5).
- T2-10: one shared status map.

### 4.6 Attack Replay / Trace Detail (`TraceDetail.jsx`), demo steps 3–4 evidence
**a. Purpose.** A side-by-side proof: the unmitigated run vs the same query re-run with mitigations.

**b. Elements.**
- Pagehead with 3 buttons.
- Two columns, each containing: header card with badge, 4-control bar plus summary line, query box, chunk box, prompt box, response box, banner.
- That is **14 boxed regions**, **4 independent scroll areas** (`max-height:240px`, `index.css:870`), 2 duplicated query boxes and 2 duplicated threshold lines [screenshot].

**c. Congestion.**
- The threshold value appears twice per column: in the badge row and again in `.trace-control-summary` (`:121-139`) [screenshot].
- The query is identical in both columns, but it is shown twice.
- 11px mono text inside nested scrollers sits in two 360px columns at 1440 [screenshot].
- While a re-run is in flight, **both** toolbar buttons change their label ("Executing…", "Re-running live…") (`:296, 307`) [screenshot].

**d. Clarity. These items misrepresent results.**
- The left title is always "Unmitigated Run (Baseline)" and the left banner is always red "Attack succeeded: untrusted instructions **exfiltrated** into response" (`:328, 383-390`). The screenshot shows it on a run with all four mitigations ON and status `sanitized`.
- "Exfiltrated" also implies the URL payload succeeded, which never reproduced on llama3.1 (**hard constraint 5**).
- The meta line falls back to `'leaked'` (`:330`).
- The right badge says "Defended" before any result exists (`:402-404`). The right banner is always teal "Prompt injection blocked by active mitigation" (`:452-458`), even if the re-run leaks.
- The right chunk is a **client-side synthesized** `<untrusted_context>` wrap (`:263`), shown even when "Re-run (Current Settings)" runs with the delimiter OFF.
- The screen auto-fires `POST /query` on mount (`:249-253`). Every visit writes an audit row and changes the right column under the presenter.
- Arriving from Test suite passes a partial log with no chunks or prompt (`TestSuiteResults.jsx:302-307`). Trace Detail uses it as-is (`:153-172`), so it renders "No retrieved chunks available." and "—". `fetchAuditLogById` already exists in `api.js:78`.
- "← Back to Audit log" is hard-coded (`:284`), even when the user arrived from Live trace or Test suite.

**e. Recommendations.**
- T2-01: data-driven titles, badges and banners.
- T2-02: explicit re-run instead of auto-run (decision D4).
- T2-03: drop the duplicate summary line.
- T2-04: fetch the full log by id.
- T2-05: collapse the prompt boxes.
- T2-06: toolbar state.
- T3-03: verdict-first layout with a single shared query.

### 4.7 Test Suite Results (`TestSuiteResults.jsx`), statistical evidence
**a. Purpose.** Multi-trial Promptfoo evidence: aggregate stats, the ablation chart, and the per-trial table.

**b. Elements.**
- Pagehead with button.
- 4 stat cards.
- Promptfoo info card.
- Ablation chart with 5 rows.
- Trial table with 6 columns × 50 rows. Each row has 1–4 chips, 2 badges and a link [screenshots].

**c. Congestion.**
- The stat cards are unstyled (undefined classes, see §3): label, value and subtitle are all the same size, so the "38" doesn't pop [screenshot].
- The config chips use teal, amber and violet decoratively (`:258-276`). That makes 4 colors per row × 50 rows [screenshot].
- The Outcome and Promptfoo badges are unstyled (undefined `badge safe/danger`, `:285-294`).
- The Action column at 100px wraps "View trace →" onto two lines [screenshot].
- The technique label renders in mono under the query (`:254`), which mixes fonts.
- The Promptfoo info card spends a full bordered box on two metadata lines, and its version "v0.122.2" is hard-coded (`:144`).

**d. Clarity.**
- The ablation percentage text is red for anything under 50% while the bar is amber for anything above 0% (`:191` vs `:204`): "10.0% Blocked" in red next to an amber bar [screenshot].
- The **Promptfoo "Failed" column contradicts "BLOCKED"** on All-ON rows #5 and #10 [screenshot]. A non-expert can't reconcile the two; the cause needs confirming (decision D6).
- "Overall block rate 24%" mixes in the deliberate 0%-by-design unmitigated control trials.
- `outcome:"BLOCKED"` also covers `clean` and `sanitized` results (`promptfoo_runner.py:244-249`). "Defended / not leaked" is the accurate word, and it is also what Trace Detail calls it.

**e. Recommendations.**
- T1-01: restyle the stat cards.
- T1-02: map badges to `teal`/`red`.
- T1-03: neutral config chips.
- T1-04: `nowrap` on the Action column.
- T1-16: match the percentage text to the bar color.
- T2-13: rename or demote the Promptfoo column (D6).
- T2-14: show 10 rows with "Show all".
- T2-15: fold the info card into the subtitle.

### 4.8 Settings (`Settings.jsx`), demo step 1 (reset) and control panel
**a. Purpose.** The four mitigation controls, the read-only stack info, and reset.

**b. Elements.** 3 cards: mitigations (3 toggles + slider), stack info (4 rows), reset. This is the cleanest screen [screenshot].

**c. Congestion.** Minimal. Description text is capped at 440px while the toggle sits ~500px away at wide widths, which makes for a long eye-path [screenshot].

**d. Clarity.**
- **The flag threshold has no on/off control.**
  - The slider row has no switch (`:304-335`), and committing the slider **forces `retrieval_score_threshold:true`** (`:117-120`).
  - It can only be turned OFF through the combined Sidebar or Chat switches.
  - This breaks the locked "4 independently toggleable controls".
- The output-filter description says "signs of a leaked system prompt" (`:287-289`). Per P4 it actually matches the injected claim/URL and swaps in `SAFE_BLOCKED_MESSAGE`.
- The threshold description says "similarity to known attack patterns… flagged for review" (`:308-310`). Per P4 it is a retrieval-score relevance proxy that only logs.
- The toggles have `role=switch` but no `tabIndex` or key handler, so they are not keyboard-operable (`:244-254` etc.).
- The amber naive-filter badge is acceptable: spec 2.2 defines amber as "Warning", and the badge *is* a limitation warning.

**e. Recommendations.**
- T1-08: copy fixes.
- T2-08: add a `#thresholdToggle` switch and stop forcing the threshold ON.
- T2-17: keyboard support.

## 5. Cross-cutting findings
**4a. Navigation and information architecture.**
- 7 top-level items is acceptable and spec-mandated (spec 2.3; `test_frontend_shell.py:74-93` requires the ids).
- The *order* does not follow the demo:
  - Step 1 is Settings reset, which is **last** in the nav.
  - Steps 2–5 happen in Chat.
  - Step 6 uses Live trace and Audit log.
- Attack replay only makes sense as a drill-down. Opened from the nav, it auto-picks the latest flagged run and fires a query.
- Recommendations:
  - Keep 7 items, but group them into "Demo" (Live trace, Chat, Attack replay), "Evidence" (Audit log, Test suite) and "Setup" (Documents, Settings), with 10px-gap group labels (T3-01).
  - When nothing is selected, Attack replay shows a picker or empty state instead of auto-running (T2-02).
  - Demoting it out of the nav would need test and spec changes, so I don't recommend it (decision D10).

**4b. Mitigation-control consistency.** What each surface actually does:

| Surface | Reads | Writes | Problem |
|---|---|---|---|
| Sidebar footer | any(4) | all four = !any (POST /settings) | combined switch; no change event; hidden <780px |
| Chat header | any(4) | all four (POST /settings) **and** a per-request override of all four on every send | combined switch; overrides granular Settings silently |
| Settings | each of 4 | individual keys; slider forces threshold ON | threshold can't be turned off |
| Trace Detail "Re-run (Current Settings)" | settings snapshot taken at mount | per-request override | stale after any change made elsewhere |

- The Sidebar and Chat switches **do not violate the backend's 4-control independence**, but in practice they *are* one combined switch in the UI. Together with the Chat override and the threshold gap, this conflicts with the locked decision. Spec 1.8 only requires the sidebar to *reflect* the combined state.
- **P8 open item. Recommendation: keep the Chat control global, not per-query** (*requires user approval*).
  - With a single source of truth (server settings), the sidebar, Settings, the audit log's `active_mitigations` and the Live-trace banner always agree. That serves spec 2.5 #1.
  - A per-query override would create hidden state that no other screen shows.
  - Concretely:
    - (i) Chat stops sending `mitigations` in `/query` and lets the backend use the server state. Test update: `Chat.test.jsx:186-194`.
    - (ii) The header control becomes an explicit preset with three states: `Mitigation: On` (all 4), `Mitigation: Off` (none), `Mitigation: Custom (2/4)`. Clicking applies "All ON"/"All OFF". Existing `#chatToggle`/`#chatToggleState` assertions stay valid.
    - (iii) Each AI message shows a one-line "ran with: Delim · Sanit · Filter · Flag" from `active_mitigations` in the response, so before/after evidence lives in the thread.
- **Sidebar.** Make it a read-only indicator: four small labeled dots (D S F T) plus "2 of 4 on", linking to Settings. Remove click-to-toggle-all (*requires user approval*, D2).
- **Settings.** Add the threshold switch (T2-08). This restores the locked decision.

**4c. Responsive behaviour.**
- **1440:** the 980px cap wastes about 270px on a 1440 screen after the 190px sidebar, and more at 1666 [screenshot]. Recommendation: `max-width:1200px`, with Attack replay full-width per spec 2.4 #5 ("Full-width, two-column") (D3).
- **1024:** the content width is about 766px.
  - Test-suite stat labels such as "Injection attempts succeeded" wrap to 3 lines [inferred].
  - Trace Detail columns are about 375px with 11px mono text: heavy wrapping and nested scroll [inferred].
- **780:** the sidebar collapses to unlabeled icons with no tooltips, and the mitigation footer is hidden (`index.css:1035-1039`).
  - The Trace grid goes single-column, so the comparison becomes a long scroll (unmitigated, then mitigated).
  - The metric grid becomes 2×2.
  - The replay toolbar's 3 buttons wrap under the title [code].
- **390:** content is about 294px.
  - The Audit table has 5 columns inside `overflow:hidden` (`AuditLog.jsx:168`), so the Status column gets clipped [inferred].
  - The Test-suite table has `overflow-x-auto` (OK).
  - Pipeline node labels at 10px [code].
  - Chat `.chatwrap` sets `min-height:520px` inside `calc(100vh-160px)` (`index.css:479-480`), so the input may fall below the fold on short phones [inferred].

**4d. Accessibility.**
- **Contrast:** `--text-muted` fails AA (2.67–2.91). Restrict it to placeholders, and use `--text-secondary` for every label and header (T1-12).
- **Focus:** there are no focus styles anywhere, and the chat input removes its outline (`index.css:646`). Add a global `:focus-visible{outline:2px solid var(--violet);outline-offset:2px}` (T1-17).
- **Keyboard:**
  - Not reachable or operable: nav items, the Sidebar toggle, Settings switches, the Chat toggle (no Enter/Space), collection chips, the dropzone, clickable audit rows and recent-run rows (T2-17).
  - `AnimatedList` registers a window-level keydown handler that `preventDefault`s Tab when `enableArrowNavigation` is true (`ui/AnimatedList.jsx:105-128`). LiveTrace passes `false`, so it is inert today, but it is a latent trap.
- **Icon-only rail:** no `aria-label` or `title` on nav items when labels are hidden (T1-06). The Sidebar toggle is a bare `div` with no role (`Sidebar.jsx:152-164`).
- **Color as the only signal:**
  - Pipeline nodes convey state only through red/teal color and size (`index.css:295-341`). Add a text state under the label, e.g. "Scan · flagged" (T1-10).
  - Ablation bars rely on color; mitigated by the numeric text.
  - Badges always carry text (OK).
- **Motion:** no `prefers-reduced-motion` guard for Counter, AnimatedList or LineSidebar (T1-07).

**4e. Demo readiness (projector).**
- **Minimum readable size:**
  - 38% of CSS sizes are ≤11px; in particular badges 10.5px, node labels 10px, banners 11px and code 11px.
  - Recommendation: set a **12px floor** for anything the panel must read (badges, banners, labels, table headers) and use 12.5px for code boxes (T1-12, T2-18).
- **5-second test:**
  - Live trace fails. The verdict banner is 11px in the bottom-left of a card, and contradictory red and teal signals surround it [screenshot].
  - Chat passes (banner under the answer) once the copy is fixed.
  - Trace Detail fails: the verdicts are hard-coded and sit at the bottom of 5 stacked boxes.
- **Fixes:** a verdict-first strip on Live trace (T3-02) and in Trace Detail (T3-03). Both reuse the existing `.banner` classes.

## 6. Prioritized plan

### Tier 1: quick wins
High impact, small effort, no test or contract change. The exception is that T1-11 changes only colors.

| ID | Screen | Change | Sev | Effort | Risk | Depends-on |
|---|---|---|---|---|---|---|
| T1-01 | Test suite | In `TestSuiteResults.jsx:110-136`, rename `metric-label`→`lbl`, `metric-val`→`val` (reusing the existing `.metric-grid .lbl/.val`, `index.css:367-376`), and add `.metric-grid .sub{font-size:12px;color:var(--text-secondary);margin-top:4px}`; drop the dead `metric-card`/`mb-4` | High | S | none (tests use testids + text) | — |
| T1-02 | Test suite | `badge safe`/`badge danger` → `badge teal`/`badge red` (`:285-294`); remove dead `text-xs` | High | S | none (text-only asserts) | — |
| T1-03 | Test suite | Config chips → all `badge gray` and drop the inline status colors (`:258-280`); keep the texts Delim/Sanit/OutFilter/Thresh/All OFF | High | S | none; enforces reserved-color rule | — |
| T1-04 | Test suite | Action column `width:120px; white-space:nowrap` (`:241, 297`) | Low | S | none | — |
| T1-05 | Documents | `.doc-card .badge{align-self:flex-start}` in index.css near `:575` | High | S | none (class asserts unchanged) | — |
| T1-06 | Sidebar | Pass `title={label}` and `aria-label={label}` on each `<li>` (`LineSidebar.jsx:189-198`) | Med | S | none | — |
| T1-07 | Sidebar / global | `maxShift={0}` on `<LineSidebar>` (`Sidebar.jsx:142`); add `@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}` | Med | S | none; aligns with spec 2.5 #3 | D8 |
| T1-08 | Settings | Copy: Output filtering → "Scans the model's answer for the injected false-refund claim or attacker link and replaces it with a blocked notice." Flag threshold → "Flags retrieved chunks whose retrieval score is at or above this value. Logging only — it never blocks or changes the answer." (`:287-289, 308-310`) | High | S | none (desc not asserted); enforces constraint 5 | — |
| T1-09 | Chat | `determineBanner`: blocked → "Blocked by output filter" when `active_mitigations.output_filter`, else "Defended — injected claim not repeated"; flagged-only (non-leaked, non-blocked) → **amber** "Flagged for review (log only)" instead of the safe banner (`Chat.jsx:101-129`) | High | S | Chat tests assert only danger text and `banner safe` exactness for blocked, so the blocked case keeps class `banner safe`; the flagged-only path isn't tested | — |
| T1-10 | Live trace | Labels (copy only): "Queries today" → "Queries (last 50)" when falling back; "Blocked" → "Attacks blocked"; "Detection rate" → "Flagged at Scan" plus a 11.5px sub-line "threshold · log-only"; node label adds a state word ("Scan · flagged") | High | S | `.val` text unchanged; className of `.node` unchanged | — |
| T1-11 | Chat / Docs | `.filetag.doc`, `.filetag.txt` → neutral (`rgba(255,255,255,.06)`/`--text-secondary`); `.filetag.pdf` → neutral (`index.css:526-541`) | Med | S | class names unchanged (Chat test asserts class `doc`) | — |
| T1-12 | Global | `th{font-size:11.5px;color:var(--text-secondary)}` (`:708-715`); `.badge` 10.5→11.5px (`:244`); `.banner` 11→12.5px, padding 8px 12px (`:415-424`); `.node .lbl` 10→11.5px; `.sidebar-foot .lbl` 10→11px secondary | High | S | pytest only checks font-family on td/th; no class changes | — |
| T1-13 | Audit log | Card style `overflow:'hidden'` → `overflowX:'auto'` (`AuditLog.jsx:168`) | Med | S | none | — |
| T1-14 | Sidebar | Below 780px, keep `.sidebar-foot` visible as a 10px dot (violet if all on, half-filled if custom, gray if off) instead of `display:none` (`index.css:1037`) | Med | S | none; spec 2.5 #1 | — |
| T1-15 | Live trace | Restore run separators: `.recent-runs-animated-list .runrow{border-bottom:1px solid var(--border)}` and `.recent-runs-animated-list [data-index]:last-child .runrow{border-bottom:none}` | Low | S | none | — |
| T1-16 | Test suite | Ablation % text → `text-text-primary` (neutral); the bar alone carries color (`:191`) | Med | S | bar classes unchanged | — |
| T1-17 | Global | `:focus-visible{outline:2px solid var(--violet);outline-offset:2px}` and remove `outline:none` from `.chat-input input` (move the focus ring to `.chat-input:focus-within`) | Med | S | none | — |
| T1-18 | Global | `.content{max-width:1200px}` (`index.css:185`) | High | S | none; **deviates from spec 2.2 layout → D3** | D3 |

### Tier 2: medium restructures (each needs a test update or a decision)

| ID | Screen | Change | Sev | Effort | Risk | Depends-on |
|---|---|---|---|---|---|---|
| T2-01 | Trace detail | Derive the left/right header title, badge and banner from `final_status` and `active_mitigations`. Leaked → red "Attack succeeded: injected false claim in response". Blocked → teal "Blocked by output filter". Clean/sanitized → teal "Defended — claim not repeated". Right banner/badge only after a result exists. Right chunk shows the `<untrusted_context>` wrap **only if** `active_mitigations.delimiter`. Remove the `'leaked'` fallback (`:328-335, 383-404, 452-458, 263`) | High | M | Fixtures (leaked/blocked, delimiter ON) keep `Attack succeeded`/`Prompt injection blocked`-style assertions green if the blocked copy keeps "Prompt injection blocked" (TraceDetail.test.jsx:156-164) | — |
| T2-02 | Trace detail | Remove the auto re-run (`:249-253`). Show an empty right column with a primary "Run mitigated comparison" button. When opened from the nav with nothing selected, show a picker of the last 5 leaked runs | High | M | Test update: Check 4 must click `rerun-full-defense-btn` before asserting `mitigated-banner` (TraceDetail.test.jsx:147-164) | D4, T2-01 |
| T2-03 | Trace detail | Delete `.trace-control-summary` (`:134-139`, `index.css:811-819`); lay the 4 controls on a single row of compact chips | Med | S | Test update: replace the `-threshold-summary` assertion with `-threshold-value` = `—` plus the badge `OFF` (TraceDetail.test.jsx:137-138) | — |
| T2-04 | Trace detail | If `initialLog` lacks `retrieved_chunks`, call the existing `fetchAuditLogById(initialLog.id)` (`api.js:78`) in `loadData` (`:153-172`) | High | S | none (TestSuite test asserts the onSelectLog payload only) | — |
| T2-05 | Trace detail | Wrap the two "Exact prompt" boxes in `<details>` (collapsed by default; summary shows the char count). Chunk and response stay open | Med | S | testids stay in the DOM; no assert on visibility | T2-01 |
| T2-06 | Trace detail | Busy label only on the clicked button; back label "← Back" (route-agnostic) or pass the origin from `App.jsx:73-76` | Low | S | `trace-back-btn` testid kept | — |
| T2-07 | Sidebar + Chat | Single source of truth (see §4b): Sidebar becomes a read-only 4-dot indicator linking to Settings and dispatches no writes; Chat stops sending per-request `mitigations`, and the header becomes a preset showing On/Off/Custom (n/4); each AI message gets a "ran with" line | High | M | **Requires user approval (D1, D2; P8 open item; spec 1.8 / 2.4 #2)**. Test update: Chat.test.jsx:186-194 (payload without `mitigations`); :231-236 unchanged | D1, D2 |
| T2-08 | Settings | Add a `#thresholdToggle` (`role=switch`) in the Flag-threshold row; the slider commit no longer sets `retrieval_score_threshold:true` (`:117-120`); disable the slider visually when off | High | S | adds DOM only; existing slider assertions stay; restores the locked 4-control decision | — |
| T2-09 | Audit log | Replace the "Event" column with "Query" (truncated `raw_query`, 1 line); badge "Prompt leaked" → "Leaked"; filter label "Flagged only" → "Flagged & non-clean"; add a "›" affordance on clickable rows | High | M | **Requires user approval (D5; spec 2.4 #4)**. Test updates: AuditLog.test.jsx:74-83 (headers), :91, :226-237 (`.event` → `.query`), :100 (text) | D5 |
| T2-10 | All | One status map, e.g. a `statusMeta()` exported from `api.js` or a small `src/status.js`, used by LiveTrace, AuditLog, Chat and TestSuite. Mapping: leaked→red "Leaked"; blocked→teal "Blocked"; sanitized→teal "Sanitized"; clean→teal "Clean"; flagged→amber "Flagged (log only)" | Med | M | Test update: AuditLog.test.jsx:113 (sanitized `amber`→`teal`) | T2-09 |
| T2-11 | Documents | Remove the three static collection chips (keep only "Product docs · {n}" with no `\|\| 7` fallback), or render them `disabled` with `title="Demo placeholder"` | Med | S | no test asserts on chips | D7 |
| T2-12 | Live trace | Merge the "Flagged document" card into the header of the Recent-runs card (one card, `#flagged-doc-info` kept) | Med | S | `#flagged-doc-info` id preserved | T1-15 |
| T2-13 | Test suite | Rename the "Promptfoo" header to "Promptfoo assert" with a `title` explaining what it grades, or move it into the trace view | Med | S–M | If removed: TestSuiteResults.test.jsx:226, 236 need updating | D6 |
| T2-14 | Test suite | Show the first 10 trials plus a "Show all 50" button, or group rows by technique with a collapsible header | Med | M | `trial-row-1` and `trial-row-10` must stay visible by default (TestSuiteResults.test.jsx:219-237) | — |
| T2-15 | Test suite | Fold the Promptfoo info card into the page subtitle as one muted-secondary line (model · eval id); drop the hard-coded version | Low | S | `eval-live-promptfoo-100` text must still render (:210) | — |
| T2-16 | Global CSS | Move `@tailwind utilities` to the end of `index.css` so utilities win, then remove now-redundant inline styles; or delete the dead utility classes (§3) | Low | M | visual changes where dead utilities come alive (`p-5`, `py-1`); no test impact | — |
| T2-17 | All | Keyboard support: nav `<li>` → `<button>` (keep `navitem` classes); toggles get `tabIndex=0` plus Enter/Space handlers; clickable rows get `tabIndex=0`/`onKeyDown` | Med | M | tests use `fireEvent.click` (unaffected) | T1-17 |
| T2-18 | Global CSS | Type scale tokens `--fs-11:11.5px; --fs-12:12.5px; --fs-13:13.5px; --fs-15:15px; --fs-20:20px` replacing the 12 sizes; radius tokens `--r-sm:6px; --r-md:8px; --r-lg:10px`; gap scale 8/12/16/24 | Med | M | pytest only checks `td`/`th` font-family | T1-12 |

### Tier 3: larger information-architecture and layout changes

| ID | Screen | Change | Sev | Effort | Risk | Depends-on |
|---|---|---|---|---|---|---|
| T3-01 | Sidebar | Grouped nav: **Demo** (Live trace, Chat, Attack replay) · **Evidence** (Audit log, Test suite) · **Setup** (Documents, Settings). Group labels at 10.5px secondary, 14px top gap. LineSidebar gets a `group` field | Med | M | ids unchanged (`test_frontend_shell.py` string check passes) | D10, T2-17 |
| T3-02 | Live trace | **Verdict strip** as the first card: one sentence at 15px ("Last run · Leaked — false refund claim in answer" / "Blocked by output filter"), plus the 4 control chips, plus the time. The pipeline row goes inside the same card; the metric grid drops to a slim 4-up row below | High | M | `#live-trace-banner` and node/line ids keep their classes | T1-10, T2-10 |
| T3-03 | Trace detail | Verdict-first layout: two outcome cards side by side at the top; a **single** shared query row spanning both columns (removes the duplicate); then aligned rows for chunk, prompt (collapsed) and response. Full-width per spec 2.4 #5 | High | L | keep all testids (`unmitigated-*`, `mitigated-*`, `column-*`) | T2-01..T2-05, D3 |
| T3-04 | Test suite | Two sections: "Summary" (4 stats + ablation chart side by side at ≥1200px) and a collapsible "Trials" table | Med | M | testids unchanged | T1-01..T1-04, T2-14, D3 |
| T3-05 | Global | Replace the 8 panel variants with `.card` plus modifiers (`.card--inset` for panel-2, `.card--flush` for tables); merge `.collection-chip`/`.filterbtn` into `.segbtn` | Low | L | **class-rename risk**: `doc-card` (Documents.test.jsx:118-127) and `filterbtn` (not asserted; testids used) — keep `doc-card` as an alias | T2-18 |

**Implementation order for Tier 2/3 (run `npx vitest run` after each step; it must stay at 34/34, or 34/34 with the edited tests):**
1. T2-04 → T2-03 (with test edit) → T2-01 → T2-05 → T2-06 → T2-02 (with test edit, after D4).
2. T2-08 → T2-07 (with test edit, after D1/D2).
3. T2-15 → T2-14 → T2-13 (after D6).
4. T2-11 (after D7) → T2-12.
5. T2-10 → T2-09 (with test edits, after D5).
6. T2-17 → T2-18 → T2-16.
7. T3-01 → T3-02 → T3-04 → T3-03 → T3-05 (last, because it renames classes).
8. After the last frontend step, also run `pytest tests/test_frontend_shell.py tests/test_audit_log_screen.py::<css test> tests/test_trace_detail_screen.py` for the static checks (they need no backend).

## 7. Decisions needed from the user
- **D1. Chat header toggle (P8 open item):** keep it global, or make it a per-query override?
  - *Recommendation: global.* Chat stops sending per-request overrides, and the header becomes a preset with an explicit "Custom (n/4)" state.
- **D2. Sidebar footer:** keep the click-to-toggle-all, or make it a read-only 4-control indicator?
  - *Recommendation: read-only*, linking to Settings.
- **D3. Content width:** raise `.content` max-width from 980 to 1200px, with Attack replay full-width (spec 2.4 #5)? This deviates from spec 2.2's 980px.
  - *Recommendation: yes.*
- **D4. Attack replay auto re-run on mount:** keep it, or require an explicit click?
  - *Recommendation: explicit click.* The auto-run writes audit rows on every visit, and the right column changes under the presenter.
- **D5. Audit log:** replace the always-"Generation" Event column with a Query column, rename "Prompt leaked" to "Leaked", and make sanitized teal? This deviates from spec 2.4 #4 and the P10 rationale.
  - *Recommendation: yes.*
- **D6. Promptfoo column:** what exactly does `promptfoo_passed` grade? Rows #5/#10 show "Failed" next to "BLOCKED".
  - *Recommendation:* rename it "Promptfoo assert" with an explanatory tooltip, or move it to Trace Detail.
- **D7. Fake collection chips** (42/356/89) in Documents: remove or disable them?
  - *Recommendation: remove.* They conflict with spec 2.5 #4 and add 3 boxes.
- **D8. P18 motion:** keep the sidebar proximity hover shift, the rolling counters and the list entrance animation?
  - *Recommendation:* remove the hover shift (spec 2.5 #3), keep the Counter, and honour reduced motion.
- **D9. Demo model:** Settings shows `qwen3.5:latest`, but PROJECT_STATE says llama3.1. Which model will the live demo use? This decides whether any copy may mention the URL payload.
  - *Recommendation:* keep the copy model-agnostic ("injected claim/link") and never claim a mitigation "blocked the URL".
- **D10. Nav:** group the 7 items into Demo/Evidence/Setup and keep Attack replay in the nav (no demotion)?
  - *Recommendation: yes.*
- **D11. Promptfoo trials in the audit log:** the first `GET /test-runs` after a backend start writes 50 audit rows. That inflates Live trace to "Queries 50 / Injection attempts 50" and makes the latest run a Promptfoo trial.
  - Should the UI exclude them? That needs a backend marker field, which is outside this UI audit.
  - *Recommendation:* tag Promptfoo rows in the backend and filter them out of Live trace metrics.

## 8. Decisions recorded (2026-11-11)

- **D1. Chat header toggle:** global.
  - Chat stops sending per-request `mitigations`.
  - The header becomes an On / Off / Custom (n/4) preset.
  - Each AI message shows a "ran with" line.
- **D2. Sidebar footer:** becomes a read-only 4-control indicator that links to Settings.
- **D3. Content width:** `.content` max-width becomes 1200px; Attack replay goes full-width.
- **D4. Attack replay:** explicit click; no auto re-run on mount.
- **D5. Audit log:** all three approved: a Query column replaces Event, the badge says "Leaked", and `sanitized` is teal.
- **D6. Promptfoo column:** verified.
  - `promptfooconfig.yaml` grades the raw completion of `{{assembled_prompt}}` through the `openai:chat` provider.
  - `backend/promptfoo_runner.py:228-232` applies the output filter afterwards, in Python.
  - So `promptfoo_passed` describes the **raw model output before the output filter**.
  - The column is renamed "Raw model (pre-filter)", with a tooltip.
- **D7. Collection chips:** remove the three static chips and the `|| 7` fallback.
- **D8. Motion:** remove the sidebar hover shift, keep the Counter, and add reduced-motion support.
- **D9. Model:** out of scope.
  - All UI copy stays model-agnostic: it never names a model and never claims a mitigation blocked the URL.
  - No model-specific values change in code.
- **D10. Navigation:** grouped nav; Attack replay stays in it.
- **D11. Promptfoo audit rows:** approved as a backend change.
  - `GET /test-runs` writes no audit rows.
  - Promptfoo rows are tagged with a `source` field and excluded from Live trace metrics.
