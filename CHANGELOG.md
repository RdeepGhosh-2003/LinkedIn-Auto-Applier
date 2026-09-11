# 📜 LinkedIn Auto-Applier — Official Changelog & Release Ledger

This document serves as the permanent chronological reference for all updates, features, architectural decisions, and bug fixes implemented in the **LinkedIn Auto-Applier** browser extension.

---

## 📌 Release Summary Table

| Version | Date & Timestamp | Type | Key Highlights |
|---|---|---|---|
| **`v1.1.4`** | 2026-09-11 23:55 IST | **Calculation Fix & Concurrency Mutex** | Resolved asynchronous storage race condition that caused Scanned metric drift; eliminated separate premature `scanned: 1` messages in favor of atomic updates; introduced Promise queue mutex for background storage writes; added `already_applied` category; made drop-off card scrollable (`max-height: 185px; overflow-y: auto`) to prevent clipped bars; added automated self-healing reconciliation for past records. |
| **`v1.1.3`** | 2026-09-11 17:05 IST | **Location Matcher Upgrade** | Enabled countrywide matching for `targetLocation: "India"` / `"All India"` so Indian tech hub cities (Bengaluru, Pune, Mumbai, Delhi NCR, Hyderabad) are not falsely skipped; added Delhi/NCR/Gurgaon/Gurugram/Noida bidirectional alias resolution. |
| **`v1.1.2`** | 2026-09-11 16:50 IST | **Core Accounting & Opportunity Protection** | Auto-saves incomplete LinkedIn Easy Apply applications to Saved Jobs with reason `⚠️ Incomplete: [Reason]`; ensures `Scanned = Applied + Saved + Skipped` is always 100% mathematically balanced; styles manual-review jobs with prominent coral badge in Saved tab. |
| **`v1.1.1`** | 2026-09-11 16:30 IST | **UI & Spacing Optimization** | Equalized 6-tab navigation layout across 520px body; eliminated empty height void in Filter Drop-off Breakdown (`height: auto; max-height: 165px`); responsive auto-sizing on logs history table (`min-height: 110px; max-height: 215px`); skip metric reconciliation in drop-off analytics. |
| **`v1.1.0`** | 2026-09-11 16:00 IST | **Major Feature Suite** | Dedicated `📊 Logs` tab with Daily, Weekly, Monthly, and Yearly rollups; Screening Q&A Bank Manager with tag badges and edit/delete modal; Filter Drop-off Analytics breakdown; ⚡ Easy Apply Only Mode; 🏢 Blocked Companies Blacklist; 🔔 Synthesized Web Audio API Chimes; 🔄 Multi-Role Search Queue. |
| **`v1.0.0`** | 2026-09-10 20:50 IST | **Production Release** | Autonomous multi-step LinkedIn Easy Apply form filler, AI Gig & Annotation Spam Shield, Strict Job Title Relevance Filter, Strict Location Matcher, Salary Floor Evaluator, Experience Cutoff Evaluator, LinkedIn Native [Save] integration, and Follow Company auto-uncheck. |

---

## 🔍 Detailed Version Records

### `v1.1.4` — Calculation Fix, Concurrency Mutex & Drop-Off Card Scroll
- **Date**: September 11, 2026 (23:55 IST)
- **Commits**: `fix(math): eliminate async storage race condition, balance scanned metrics, add already_applied skip reason, and make drop-off card scrollable`
- **Files Modified**: `scripts/applier.js`, `scripts/background.js`, `popup/popup.js`, `popup/popup.css`, `manifest.json`, `CHANGELOG.md`.
- **What Was Added / Updated:**
  1. **⚖️ Elimination of Storage Race Condition**: Fixed a critical race condition where inspecting a job dispatched `{ scanned: 1 }` and immediately afterwards dispatched `{ skipped: 1 }`, causing the second asynchronous `chrome.storage.local.get` to read stale storage before the first completed writing, silently dropping scanned counts.
  2. **🔒 Promise Queue Mutex (`statsUpdateQueue`)**: Wrapped all background stats updates in a sequential promise chain so concurrent updates never race or overwrite each other.
  3. **📐 Mathematical Invariant**: Enforced `scanned = applied + saved + skipped` at the storage layer, ensuring 100% mathematical balance at every instant across all UI views.
  4. **📋 Explicit `already_applied` Category**: Jobs previously applied to on LinkedIn are now explicitly logged under `reason: 'already_applied'` (`📋 Already Applied (LinkedIn)`) instead of generic unclassified skips.
  5. **📜 Scrollable Drop-off Breakdown**: Updated `.dropoff-container` with `max-height: 145px; overflow-y: auto;` and sleek custom scrollbars, ensuring all categories are viewable without clipping.
  6. **🩹 Self-Healing Data Reconciliation**: Added automatic reconciliation on startup and popup load that repairs past historical records so `scanned` matches `applied + saved + skipped`.

### `v1.1.3` — Countrywide India & City Alias Location Matching
- **Date**: September 11, 2026 (17:05 IST)
- **Commits**: `fix(matcher): countrywide India location matching and Delhi/NCR city aliases in strict location filter`
- **Files Modified**: `scripts/applier.js`, `manifest.json`, `CHANGELOG.md`.
- **What Was Added / Updated:**
  1. **🇮🇳 Countrywide India Search Matching**: Resolved an issue where searching with `targetLocation: "India"` or `"All India"` caused jobs in Bengaluru, Pune, Mumbai, Hyderabad, etc. to be skipped as "Outside Target Location". When target location is India or All India, all valid Indian locations are treated as valid matches.
  2. **🏙️ Delhi NCR Regional Aliases**: Added bidirectional alias resolution between `Delhi`, `NCR`, `Gurgaon`, `Gurugram`, and `Noida` so National Capital Region postings match regardless of whether the employer labeled the card with Gurgaon or Delhi NCR.

### `v1.1.2` — Math Balancing & Incomplete Application Auto-Save
- **Date**: September 11, 2026 (16:50 IST)
- **Commits**: `fix(accounting): auto-save incomplete Easy Apply applications to prevent lost opportunities and maintain mathematical balance`
- **Files Modified**: `scripts/applier.js`, `scripts/background.js`, `popup/popup.js`, `popup/popup.css`, `manifest.json`, `CHANGELOG.md`.
- **What Was Added / Updated:**
  1. **📋 Auto-Save Incomplete Applications**: When an Easy Apply wizard gets stalled (e.g. unhandled custom question or multi-step limit exceeded), the job is now automatically saved into `Saved Jobs` with the diagnostic reason (e.g. `⚠️ Incomplete: Unresolved Questions`). This guarantees that matched opportunities that passed all candidate criteria are never discarded.
  2. **⚖️ 100% Mathematical Accounting Balance**: With incomplete applications recorded in `Saved Jobs` (which triggers `saved: 1`), the fundamental accounting equation $\mathbf{\text{Scanned} = \text{Applied} + \text{Saved} + \text{Skipped}}$ holds with 100% mathematical consistency across all Daily, Weekly, Monthly, and Yearly analytics rollups.
  3. **🎨 Coral Incomplete Badge**: Incomplete jobs requiring quick manual submission are prominently highlighted in the Saved Jobs tab with a distinctive coral/red warning badge (`rgba(239, 68, 68, 0.15)`).
  4. **🛡️ Crawler Loop Exception Guard**: Added a try-catch fallback in the job card inspection loop so unexpected DOM exceptions dispatch `skipped: 1 (reason: 'unrecognized')` instead of causing dangling scanned metrics.

### `v1.1.1` — UI Spacing & Drop-off Reconciliation
- **Date**: September 11, 2026 (16:30 IST)
- **Commits**: `fix(ui): responsive drop-off and table heights, equalized 6-tab nav bar, and skip metric reconciliation`
- **Files Modified**: `popup/popup.html`, `popup/popup.css`, `popup/popup.js`, `manifest.json`, `CHANGELOG.md`.
- **What Was Added / Updated:**
  1. **📐 Responsive Card Heights**: Refactored `.logs-dropoff-card` to dynamic `height: auto; max-height: 185px;` and `.logs-details-card` to `min-height: 110px; max-height: 215px; height: auto;`, preventing empty dark block voids when displaying short lists while keeping long lists cleanly scrollable.
  2. **🧭 Equalized 6-Tab Navigation Spacing**: Balanced all 6 navigation buttons (`🚀 Auto-Apply`, `⚙️ Rules`, `✅ Applied`, `📋 Saved Jobs`, `📊 Logs`, `👤 Profile & QA`) across the 520px body with `10.5px` typography, `padding: 10px 2px`, and `justify-content: space-between`.
  3. **🔄 Skip Metric Reconciliation**: Updated `renderDropoffAnalytics(reasons, totalPeriodSkipped)` across Daily, Weekly, Monthly, and Yearly views. If `totalPeriodSkipped > categorizedTotal`, the remaining skips are automatically categorized as `⏳ Prior / General Filters` so the breakdown sum matches the period totals.

### `v1.1.0` — Major Productivity & Intelligence Suite
- **Date**: September 11, 2026 (16:00 IST)
- **Commits**: `feat(suite): logs analytics, drop-off breakdown, multi-role queue, company blacklist, audio chime, screening QA manager`
- **Files Modified**: `manifest.json`, `data/default_profile.json`, `popup/popup.html`, `popup/popup.css`, `popup/popup.js`, `scripts/applier.js`, `scripts/background.js`, `CHANGELOG.md`.
- **What Was Added / Updated:**
  1. **📊 Dedicated Logs & Historical Analytics Tab**: Added a 5th tab featuring Daily, Weekly, Monthly, and Yearly time-bucketed analytics for Scanned, Applied, Saved, and Skipped metrics, a Period Progress bar, CSV export, and clear history.
  2. **🎯 Filter Drop-off Analytics**: Detailed visual breakdown card showing exact counts and percentages for why listings were skipped (`Experience Cutoff`, `Salary Floor`, `Blacklist Keyword`, `Location Mismatch`, `Blocked Company`, `External Site`, `AI Spam`, `Title Relevance`, `Unrecognized`).
  3. **🧠 Screening Q&A Bank Manager**: Interactive UI under Profile & QA tab to view, add, edit, or delete custom question-and-answer pairs stored in `userProfile.screening`. Features keyword tags, edit/delete actions, and a collapsible form.
  4. **⚡ Easy Apply Only Mode**: Added `rule-easy-apply-only` toggle in Rules & Filters to skip external company-site jobs automatically without saving them.
  5. **🏢 Blocked Companies Blacklist**: Added `rule-blocked-companies` in Rules & Filters to filter out third-party staffing agencies and consultancies (e.g. `TeamLease, Quess Corp, Crossing Hurdles, Outlier`).
  6. **🔔 Synthesized Audio Chimes**: Web Audio API two-tone synthesizer (587Hz -> 880Hz) alerting users when CAPTCHA, manual question input, or session completion occurs.
  7. **🔄 Multi-Role Search Queue**: Supports comma-separated job titles in search queries (e.g. `Data Analyst, MIS Analyst, BI Analyst`), automatically progressing to the next role when search pages finish via `QUERY_RESULTS_FINISHED`.
  8. **📜 CHANGELOG.md Ledger**: Official chronological release history tracking updates and fixes.

### `v1.0.0` — Production Release
- **Date**: September 10, 2026 (20:50 IST)
- **Commits**: `feat(core): autonomous LinkedIn easy-apply, spam shield, title relevance, salary & exp parser, native save`
- **What Was Added:**
  - Autonomous LinkedIn Easy Apply form filler with synthetic React event dispatching.
  - 🛡️ AI Gig & Annotation Spam Shield filtering hourly dollar rates and crowdsourcing agencies.
  - 🎯 Strict Job Title Relevance Filter ensuring target role keywords are present.
  - 📍 Strict Location Matcher and Bangalore/Bengaluru alias resolution.
  - 💰 Salary Floor Evaluator and 🎓 Experience Cutoff Evaluator.
  - 💾 LinkedIn Native [Save] button automation to bookmark jobs on candidate LinkedIn profiles.
  - 🚫 Automatic unchecking of the "Follow company" box on application review step.
  - 🖥️ In-page floating status pill and real-time live activity log stream.
