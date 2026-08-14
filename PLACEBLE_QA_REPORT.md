# Placeble QA Report

Date: 13 August 2026  
Environment: local frontend `http://localhost:3000`, local API `http://localhost:4000/api/v1`, MongoDB-backed development data  
Method: live in-app browser interaction, direct authenticated API checks, source inspection, TypeScript, ESLint, and production builds

## 12.1 Summary

### Findings by severity

| Severity | Total found | Fixed during this pass | Remaining |
|---|---:|---:|---:|
| Critical | 0 | 0 | 0 |
| High | 10 | 9 | 1 |
| Medium | 6 | 6 | 0 |
| Low | 0 | 0 | 0 |
| Cosmetic | 0 | 0 | 0 |

The student platform's core AI workflows are functional and persist real data: resume generation/editing/versioning, cover-letter generation, aptitude scoring, interview debriefs, group-discussion scoring, job matching, applications, notes, and the unified readiness score were all exercised. Authentication, invite activation, recruiter candidate scoping, shortlist persistence, server-side role guards, truthful empty states, scoped role analytics, profile/settings/search workflows, CSV exports, and file parsing held in the tested cases. The remaining High gap is Judge0-backed coding execution. A real media allow-path could not be completed because the test browser exposed no camera/microphone device, but timeout, blocked-state, retry, and typed recovery paths passed.

### Coverage overview

| Area | Result | Evidence |
|---|---|---|
| Student auth | Pass with finding | Fresh account, onboarding, logout/login, wrong-password response, refresh persistence |
| Invite activation | Pass | Valid recruiter/faculty activation, expired token, reused token, malformed token, immediate authenticated destination |
| Cross-role API authorization | Pass | Student/recruiter/faculty forbidden routes returned 403; TPO/faculty allowed reads returned 200 |
| Resume Maker | Pass | Real generation/editing/versioning; real generated PDF and DOCX parsed through the upload UI; exported PDF/DOCX signatures validated |
| Cover Letter | Pass | Gemini generation, four-paragraph draft, inline edit, clipboard copy, application attach, and non-empty TXT download validation |
| Aptitude | Partial | Dynamic MongoDB questions, answers, submission, explanations, score and heatmap pass; coding blocked by absent Judge0 |
| Mock Interview | Pass with hardware limitation | Immediate question, turn processing, debrief, explicit blocked-device state, timeout, retry and typed recovery; no real device exposed for allow-path |
| Group Discussion | Pass with hardware limitation | Three distinct personas, observer scorecard, microphone timeout, denied-state and typed recovery; no real device exposed for allow-path |
| Job Matching | Pass | Distinct scores, details, save/apply, status persistence, notes, elapsed-day calculation |
| TPO dashboard | Pass | Live institution cohort, components, filters, profiles, current aggregation and real CSV exports; unavailable schedules/history clearly empty |
| Recruiter dashboard | Pass | Real institution/drive-scoped candidates, persistent shortlist, scoped aggregation and honest empty schedule/interview states |
| Faculty dashboard | Pass | Live read-only cohort, current aggregation, priority list from real status and server-side mutation denial |
| Responsive/theme | Pass with note | Desktop and phone behavior exercised; CSS breakpoints inspected at 390/800/1440 contracts; light/dark persistence verified |

## 12.2 Dead / Non-Functional Buttons

- Fixed honestly: Auth → Continue with Google is visibly disabled and labelled “Setup needed” until OAuth credentials/routes are configured.
- Fixed: Student profile and settings open real dialogs; profile reads/writes authenticated API data and preferences persist locally.
- Fixed: Student search returns module destinations and navigates by click or Enter; role search moves to the correct scoped directory and filters it.
- Fixed: Directory and Progress exports create CSV files from current visible/scoped records.
- Hidden honestly: drive create/manage and recruiter interview scheduling controls are absent until persisted backend workflows exist.
- Fixed: recruiter “top matches” wording was replaced by candidate review/navigation; shortlisted changes persist server-side.
- Fixed: student account chip opens an account menu; sign-out is a separate action.
- Static audit: no rendered TSX `<button>` remains without an `onClick`, submit behavior, or disabled state.

## 12.3 Full Findings List

### Authentication

ID: AUTH-01  
Severity: High  
Location: Invite-gated account activation route  
Action taken: Logged in as TPO, created real recruiter and faculty invitations, opened their `/activate?token=...` links, activated both accounts, deliberately expired a separate invite, reopened an accepted invite, and opened a malformed token.  
Expected: An invited user can open a valid token, set credentials, and receive the invited role and institution; expired and reused tokens receive specific errors.  
Actual: A dedicated activation route validates the token before showing credentials, renders distinct valid/expired/already-used/invalid states, creates the invited role profile and institution scope, issues a refresh/access session, and redirects to the correct dashboard. Reuse produced no duplicate account.  
Device/breakpoint: desktop  
Theme: light  
Screenshot/note: Fixed and verified. Recruiter activation retained the invited institution and drive IDs; MongoDB contained exactly one user after token reuse. Faculty activation landed in the read-only faculty workspace.

ID: AUTH-02  
Severity: Medium  
Location: Login → Continue with Google  
Action taken: Opened both student and invited-account login views and inspected the Google control.  
Expected: Because OAuth is not configured, the control should be absent or lead to an actionable setup/explanation.  
Actual: The option remains visible for future configuration but is disabled, labelled “Setup needed,” and explains that credentials/callback routes are absent.  
Device/breakpoint: phone / desktop  
Theme: light  
Screenshot/note: Fixed honestly; email/password login remains active.

ID: AUTH-03  
Severity: Medium  
Location: Student signup password validation  
Action taken: Submitted a valid new email with a weak password.  
Expected: A specific password-requirements message next to the relevant field.  
Actual: The UI initially showed a generic validation message.  
Device/breakpoint: desktop  
Theme: light  
Screenshot/note: Fixed in this pass; field-specific schema messages now reach the form.

### Global shell

ID: SHELL-01  
Severity: High  
Location: Student topbar → phone navigation  
Action taken: Opened the student dashboard at phone width and looked for the sidebar trigger.  
Expected: A visible menu button opens the sidebar drawer and scrim.  
Actual: The menu button was suppressed by a conflicting `display: none !important` rule.  
Device/breakpoint: phone  
Theme: light / dark  
Screenshot/note: Fixed in this pass; the mobile breakpoint explicitly restores the grid display.

ID: SHELL-02  
Severity: High  
Location: Fresh student overview, agent badges, recent activity, and upcoming event  
Action taken: Created a new account and compared the visible dashboard claims to the account's persisted records.  
Expected: New accounts show their real name, zero/baseline evidence, honest empty states, and only actual activity.  
Actual: The identity and readiness portions initially used demo values. All residual event, activity, coach, completion, streak, hour, milestone, and recommendation claims were replaced with persisted evidence or explicit empty states.  
Device/breakpoint: phone / tablet / desktop  
Theme: light / dark  
Screenshot/note: Fixed. A fresh account showed readiness 0, “Your baseline starts here,” no scheduled event, no recorded activity, and no seeded company or completion claims.

ID: SHELL-03  
Severity: Medium  
Location: Student sidebar → My profile / Settings  
Action taken: Clicked both secondary navigation items.  
Expected: Each opens a real route or modal with editable persisted content.  
Actual: Profile now opens an authenticated editor backed by `GET/PATCH /auth/profile`; Settings persists theme and reduced-motion preferences.  
Device/breakpoint: desktop  
Theme: light  
Screenshot/note: Fixed and browser-verified, including a successful profile save.

ID: SHELL-04  
Severity: Medium  
Location: Student topbar → Search Placeble  
Action taken: Entered text and attempted keyboard submission.  
Expected: Matching navigation/actions/results appear.  
Actual: Student search lists matching module destinations and opens them by click or Enter. Professional-role search moves to the correct scoped directory and filters live rows.  
Device/breakpoint: tablet / desktop  
Theme: light / dark  
Screenshot/note: Fixed; “resume” opened Resume Maker in the localhost browser.

ID: SHELL-05  
Severity: Medium  
Location: Student topbar → profile chip  
Action taken: Clicked the visible profile/account control.  
Expected: An account menu opens, with logout as an explicit secondary action.  
Actual: The chip opens a menu with Profile, Settings, and a separate Sign out action.  
Device/breakpoint: desktop  
Theme: light  
Screenshot/note: Fixed and browser-verified.

### Resume Maker

ID: RESUME-01  
Severity: High  
Location: Resume Maker → Add entry → Save version  
Action taken: Added a project and immediately clicked Save version before autosave completed.  
Expected: The saved version includes the editor's current project.  
Actual: Version creation cloned the previously persisted resume and dropped the just-added project.  
Device/breakpoint: desktop  
Theme: light  
Screenshot/note: Fixed in this pass; Save version first persists unsaved editor state, then clones the version.

### Aptitude Test

ID: APT-01  
Severity: High  
Location: Aptitude Test → coding questions / Run  
Action taken: Opened test setup and inspected available sections and backend configuration.  
Expected: Coding questions execute against visible test cases through an async runner.  
Actual: Coding is deliberately disabled because no Judge0 endpoint is configured. MCQ generation/scoring is dynamic and MongoDB-backed, not a fixed frontend question list.  
Device/breakpoint: desktop  
Theme: light  
Screenshot/note: Blocked on configuration and intentionally not faked. `backend/.env` currently has neither `JUDGE0_ENDPOINT` nor `JUDGE0_API_KEY`. Provide either a self-hosted Judge0 base URL (and its key if protected), or a RapidAPI Judge0 base URL plus API key/host configuration before end-to-end coding execution can be verified. MCQ practice remains available.

### Job Matching

ID: MATCH-01  
Severity: High  
Location: Student sidebar → Opportunities / Applications  
Action taken: Compared sidebar screens with the completed Job Matching agent and its backend application data.  
Expected: Both entry points use the same real match feed and application tracker.  
Actual: The sidebar previously opened separate static mock lists/kanban while the Agent opened the real module.  
Device/breakpoint: phone / desktop  
Theme: light  
Screenshot/note: Fixed in this pass; both sidebar routes now open Job Matching on the appropriate initial surface.

### TPO / recruiter / faculty dashboards

ID: ROLE-01  
Severity: High  
Location: Recruiter overview/candidate directory  
Action taken: Logged in with a real invited recruiter, loaded `/recruiter/candidates`, inspected the returned candidate, and crafted requests for an ungranted institution, drive, and candidate.  
Expected: Candidate data is fetched from a recruiter-authorized drive/institution-scoped endpoint.  
Actual: The UI now fetches real students only from institution IDs stored on the recruiter profile. The response includes the granted institution/drive scope and live readiness components. Requests for another institution, drive, or candidate each returned 403.  
Device/breakpoint: desktop  
Theme: light  
Screenshot/note: Fixed and verified. The invited QA recruiter received one real TechEnd candidate instead of the former eight hardcoded candidates.

ID: ROLE-02  
Severity: High  
Location: Recruiter → Shortlist  
Action taken: Added and removed a real scoped candidate, queried the API again, then reloaded the recruiter dashboard.  
Expected: The shortlist persists server-side and survives refresh.  
Actual: A unique recruiter/candidate shortlist record is created or removed server-side. The API reload returns stored shortlist IDs and the UI preserved the removal after refresh.  
Device/breakpoint: desktop  
Theme: light  
Screenshot/note: Fixed and verified through direct API checks and the live recruiter UI.

ID: ROLE-03  
Severity: High  
Location: TPO/recruiter/faculty secondary analytics and operational cards  
Action taken: Compared dashboard counts and charts with the readiness cohort response and persisted module records.  
Expected: Trend, skill-gap, funnel, scheduling, drive, and mentor-impact claims derive from stored data.  
Actual: All three role Progress screens now aggregate current scoped students/candidates and real resume/aptitude/interview evidence. Fabricated history, scheduling, mentoring outcomes and conversion claims were removed; unavailable historical series and schedules render explicit empty states.  
Device/breakpoint: tablet / desktop  
Theme: light / dark  
Screenshot/note: Fixed. Recruiter/TPO/faculty screens were checked in the browser; fixture trend points and outcome narratives were absent.

ID: ROLE-04  
Severity: Medium  
Location: TPO/faculty directory → Export; TPO Progress → Report  
Action taken: Inspected/clicked export controls and verified their handlers.  
Expected: A real CSV/PDF report downloads with the current filters/data.  
Actual: Both controls generate CSV from the current filtered/scoped records. Empty directories disable export.  
Device/breakpoint: desktop  
Theme: light  
Screenshot/note: Fixed; handlers build escaped CSV rows from live data and were exercised from role dashboards.

ID: ROLE-05  
Severity: High  
Location: TPO/faculty institution directory  
Action taken: Logged in as TPO and faculty, opened the directory/profile, exercised filters, and compared values to `/readiness/cohort`.  
Expected: Institution-scoped real students and real readiness components.  
Actual: The screens initially depended on the shared demo candidate array.  
Device/breakpoint: desktop  
Theme: light  
Screenshot/note: Fixed in this pass. TPO/faculty now fetch the role-guarded cohort endpoint; filters act on those returned rows.

## 12.4 Role-Coverage Confirmation

- [x] Student: fresh signup/onboarding, validation, login/logout, refresh persistence, shell, all six agent backends, readiness, job feed and application tracker.
- [x] TPO: seeded-role login, live institution overview/directory/profile, filters, real recruiter/faculty invitation creation, progress, and privileged API access.
- [x] Recruiter: real invite-token activation, real institution/drive-scoped candidates, persistent shortlist add/remove and refresh, direct 403 checks for ungranted institution/drive/candidate requests, plus interview/progress surface coverage.
- [x] Faculty: real invite-token activation with invited institution scope, immediate read-only dashboard, live cohort/profile/at-risk surfaces, and direct server-side mutation-denial checks.

Invite-token activation is complete for both invite-gated roles. Valid, expired, already-used, and malformed states were tested through the localhost UI. Real generated Placeble PDF and DOCX files were uploaded through the browser and parsed successfully. The browser exposed no physical media device/allow dialog, so the allow-path remains hardware-blocked; camera/microphone timeout, denied UI, retry and typed-mode recovery were verified.

## 12.5 Recommended Fix Order

1. [x] Completed: invite activation page, explicit expired/reused/invalid states, correct role/institution profile creation, and immediate authenticated session.
2. [x] Completed: recruiter-scoped candidate API, real frontend states, server-side shortlist model, refresh persistence, and crafted out-of-scope request rejection.
3. [blocked] Configure Judge0 and complete coding-question run/submission coverage. Current environment has no `JUDGE0_ENDPOINT` or `JUDGE0_API_KEY`; no simulated runner was substituted.
4. [x] Completed: fresh-account student narrative is derived from evidence, with honest zero/empty states and no fabricated events, activity, streaks, hours or milestones.
5. [x] Completed: role analytics use scoped current aggregation; fabricated history/schedules/outcomes were removed and unavailable datasets are explicitly labelled.
6. [x] Completed: profile, settings, search and CSV exports are real; unavailable drive/interview mutations are hidden; account chip opens a menu.
7. [partial] Real PDF/DOCX upload parsing and PDF/DOCX/TXT file validation passed. Device denial/timeout/retry/typed recovery passed; a physical allow-path remains blocked because the test browser exposed no camera/microphone device or actionable permission prompt.

## Verification Record

### Multi-tenant onboarding verification (13 August 2026)

- Platform admin: seeded through the backend seed for local QA; a separate `seed:platform-admin` command requires explicit `PLATFORM_ADMIN_EMAIL` and a 12+ character `PLATFORM_ADMIN_PASSWORD` for secure production onboarding. No public platform-admin registration route exists.
- Platform authorization: platform overview returned 200 for `platform_admin`; the same crafted request with a TPO token returned 403.
- Institution creation: created an isolated second institution with its own approved domain and activated its first TPO through a single-use invite.
- Student domain gating: an unknown domain returned 403 / `DOMAIN_NOT_RECOGNIZED` with the institution-contact next step. A recognized but unrostered student entered `pending_domain_approval`.
- Cross-tenant student decision: the primary TPO attempted to approve a student belonging to the second institution and received 404; that student's own TPO could see and approve the record.
- Roster upload: a real CSV produced a partial-success result (1 created, 2 failed) with row-specific invalid-email and unapproved-domain explanations. The successful row persisted in the scoped roster.
- Roster matching: signup with the roster email returned `roster_matched`, assigned the correct institution, and changed the roster row from `unmatched` to `matched` with `matchedUserId`.
- Recruiter organization flow: a new company registration returned `COMPANY_VERIFICATION_PENDING`; platform verification activated the recruiter account.
- Drive grants: the verified recruiter requested one published drive, the institution TPO saw the request and approved it, and candidate access then returned only that institution's cohort.
- Recruiter scope attacks: crafted ungranted institution and drive query parameters returned 403.
- UI coverage: platform institution/org/lead surfaces, public institution/recruiter entry forms, TPO roster/pending/access queues, recruiter drive access, desktop layout, and 390px roster layout were exercised in the live browser. The roster page had no horizontal document overflow at 390px.
- Dependency security: production dependency audit returned 0 vulnerabilities after replacing the initial spreadsheet parser with `read-excel-file`.

- Frontend TypeScript: passed (`tsc --noEmit --incremental false`).
- Focused ESLint for all changed frontend files: passed.
- Backend TypeScript: passed (`tsc --noEmit --incremental false`).
- Production frontend/backend build: passed (`npm run build`).
- Invite activation states: valid recruiter, valid faculty, expired, already used, and malformed all verified through `http://localhost:3000/activate?token=...`.
- Activation persistence: authenticated faculty session survived reload; recruiter login returned the invited role, institution, and destination.
- Duplicate/scope check: one recruiter user after reuse; recruiter profile retained the invited institution ID and drive ID.
- Invite retention index: `expiresAt_1` verified as a normal index (`ttl: null`) so expired links retain an explainable state.
- Recruiter scope: real invited recruiter returned one candidate from its granted institution; crafted institution, drive, and candidate requests returned 403.
- Recruiter shortlist: persisted API record loaded on page entry; removal remained removed after a full browser refresh.
- Judge0 checkpoint: `backend/.env` exists, but endpoint/key/host are all unconfigured; coding execution remains honestly disabled pending a real self-hosted or RapidAPI Judge0 service.
- Fresh-student truthfulness: a new account showed zero readiness, no recorded activity, no scheduled event, and evidence-based next actions; no seeded company, streak, hours or milestone narrative appeared.
- Role analytics: recruiter, TPO and faculty Progress screens showed live scoped counts/component averages and explicit “not available” history/schedule states; old fixtures were absent.
- Controls: student search navigated to Resume Maker, profile loaded/saved through the API, Settings opened, account chip exposed a separate sign-out action, and role export handlers generate escaped CSV.
- Resume upload: generated Placeble PDF and DOCX were selected through the browser file chooser and both produced parsed “Imported from your resume” content.
- File integrity: exported PDF began `%PDF` and ended with `%%EOF`; DOCX began `PK`, opened as ZIP and contained `word/document.xml`; cover-letter TXT was non-empty (1,591 bytes).
- Media recovery: combined camera/microphone and microphone-only checks timed out into explicit blocked/typed states after 8 seconds; retry remained available and room entry became enabled in typed mode. A real allow-path could not be exercised without an exposed device.
- JWT payload inspected: only `userId`, `role`, `institutionId`, `iat`, and `exp`.

### Roster-gated student approval verification (14 August 2026)

- Registration allowlist: a same-domain email absent from the TPO roster returned 403 / `ROSTER_ENTRY_REQUIRED`; domain membership alone no longer permits signup.
- Roster match: an unmatched, exact-email roster entry allowed account creation and atomically linked the roster row to the new user.
- Pending security: successful signup returned 202 / `ACCOUNT_PENDING`, created the user with `status=pending` and `studentVerificationStatus=pending_tpo_approval`, and issued no access token or refresh session.
- Pending login: correct credentials continued to return 202 / `ACCOUNT_PENDING` until the institution TPO acted.
- TPO queue: the student appeared only in their own institution's Pending students queue with roster roll number, branch, and batch year.
- Approval: the TPO action changed the account to `active` / `approved`, initialized the student profile from roster data, and removed the student from the queue.
- Post-approval access: the next login returned `student-dashboard`, `onboardingCompleted=true`, and the student-scoped readiness API returned 200.
- Rejection: the TPO reject action changed the account to `suspended` / `rejected`; subsequent login returned 403 / `ACCOUNT_SUSPENDED` and no token.
- Browser coverage: roster-backed signup, the dedicated waiting-for-TPO screen, the populated TPO queue, approval action, and empty queue state were exercised in localhost.

### Platform admin dashboard verification (14 August 2026)

- Dedicated namespace: all module APIs now live under `/api/v1/platform-admin`; the previous general `/platform` mount is no longer used.
- Cross-role security: platform overview returned 200 for `platform_admin`; a crafted request with a valid TPO access token returned 403.
- Real overview aggregation: active institutions, monthly institution delta, student/onboarding totals, verified/pending recruiter totals, latest platform readiness average, and a complete 90-day signup series were returned from MongoDB.
- Institution operations: searchable/filterable/sortable table, real student/TPO counts, roster match rate, latest readiness, onboarding date, and status were verified in the browser.
- Institution detail: primary TPO, roster rows, readiness distribution, five agent-engagement counts, active drives, and recruiter grants all rendered from the live tenant record.
- Required reason enforcement: institution suspend and recruiter suspend requests without reasons returned 400. The browser confirmation opened with its commit button disabled until a reason is supplied.
- Audit accountability: institution suspend/reactivate/detail-view, recruiter verify/reject/suspend/restore, institution creation, and TPO credential reissue each produced the expected `AdminAuditLogEntry` action.
- State restoration: the QA institution and Razorpay recruiter organization were restored to active/verified after reversible mutation testing.
- Credential reissue: the 24-hour reissue token validated with `purpose=credential_reissue`, reset the existing TPO password, preserved the TPO role/institution, allowed login, and rejected token reuse with 409.
- Recruiter operations: pending-first queue, all-status filter, organization detail, recruiter accounts, and institution/drive grant history were exercised in the browser.
- Audit log: administrator, action, and date filters rendered; filtering to `institution_suspended` returned only the matching audit row.
- Responsive coverage: desktop and 390x844 mobile layouts were reviewed in the live browser. Mobile document width remained 375/375 with no horizontal page overflow; wide tables remain independently scrollable.
- QA fixture: `Platform Admin QA College` was created through the real audited institution endpoint to verify the creation flow and remains identifiable as test data.

### Recruiter Marketplace and tiered access verification (14 August 2026)

- Opt-in discovery: an existing institution without `marketplaceListing.isListed` was absent from recruiter discovery. After the TPO enabled it, the API returned only its name, headline, coarse student-count band, and branch labels.
- Relationship request: a real recruiter request for `candidate_access` with a message appeared in the institution-scoped TPO queue.
- Reduced approval: the TPO approved the candidate request as `aggregate_stats`; recruiter history preserved the requested and granted levels separately.
- Aggregate privacy: the crafted aggregate request returned only `summary`, `branchBreakdown`, and `skillBreakdown`. It returned no student collection, name, email, user ID, resume, contact detail, or individual readiness score.
- Two-layer candidate security: an approved marketplace relationship without an approved drive grant returned `403 CANDIDATE_DRIVE_GRANT_REQUIRED`. After a deliberate relationship upgrade and drive-specific TPO grant, the same drive-scoped candidate request succeeded.
- Visibility/grant separation: disabling the listing removed it from new discovery while the approved relationship, drive grant, and candidate access for that drive stayed intact. The listing was re-enabled after the regression test.
- Platform administration: recruiter-organization list/detail APIs show marketplace relationship counts and access levels alongside drive-grant history.
- Browser QA: verified the TPO listing editor, combined relationship/drive queue, recruiter marketplace, request history, aggregate view, empty filter result, and restored result. At a 390px viewport, document width remained 375/375 with no horizontal overflow.
- Tested access matrix: student→institution members 403; recruiter→cohort 403; faculty→invite creation 403; TPO→members/cohort 200; faculty→cohort 200.

### End-to-end recruiter chain verification (14 August 2026)

ID: RECRUITER-CHAIN-01  
Severity: High  
Location: Recruiter workspace → Overview / My Institutes  
Action taken: Audited the complete platform-admin → institution → recruiter-organization → marketplace request → TPO approval → drive grant chain before changing code. Added one consolidated, database-backed recruiter institution read model and a first-class My Institutes UI.  
Expected: Every approved institution relationship is immediately useful from the recruiter dashboard, with the granted access level, real readiness, aggregate privacy, and drive-scoped candidate access enforced consistently.  
Actual: Approvals and grants were persisted, but the recruiter dashboard had no consolidated read side. Aggregate-only approvals were effectively invisible, multi-institution readiness could not be compared, and recruiters had to navigate unrelated screens to infer their access.  
Device/breakpoint: desktop 1280x900 and mobile 390x844  
Theme: light  
Screenshot/note: Fixed. `GET /api/v1/recruiter/institutions` now merges approved marketplace relationships and direct approved drive grants into one institution card per tenant. The UI refreshes on entry, focus, manual refresh, and a 10-second background interval.

#### Fourteen-step live walkthrough

1. **Pass — University A created.** Platform admin created `Test University A E2E 2026` with domain `test-university-a-e2e.edu.in` and generated the first-TPO activation link.
2. **Pass — University B created.** A stale copied activation URL was detected and rejected as already used; the B leg was rerun from creation with `Test University B Chain 2026`, domain `test-university-b-chain.edu.in`, and a fresh distinct activation token. The unused `Test University B E2E 2026` remains clearly identifiable as QA data.
3. **Pass — recruiter organization registered.** `TalentBridge E2E` registered through the public recruiter flow and received the real pending-verification screen.
4. **Pass — organization verified.** Platform admin verified the company through the UI. A direct API check confirmed `verificationStatus=verified`, the verifying admin ID, timestamp, two marketplace approvals, and one approved drive grant.
5. **Pass — University A made discoverable.** Its TPO enabled the opt-in marketplace listing with a coarse cohort band and branch labels only.
6. **Pass — University B made discoverable.** Its TPO enabled a separate listing with distinct headline, cohort band, and branches.
7. **Pass — discovery privacy checked.** The verified recruiter saw both opted-in universities. No student names, exact counts, scores, contacts, resumes, or other sensitive student fields appeared in marketplace cards.
8. **Pass — different access tiers requested.** The recruiter requested candidate access from A and aggregate statistics from B with persisted request messages.
9. **Pass — reduced A approval.** A's TPO deliberately approved the candidate request as aggregate-only; the UI preserved both requested and granted levels.
10. **Pass — B aggregate approval.** B's TPO approved aggregate statistics as requested.
11. **Pass — multi-institution dashboard.** My Institutes showed both approved relationships without a special reload: A at readiness 81 and B at readiness 53, each with the effective access badge and real scoped cohort summary.
12. **Pass — aggregate boundary.** Opening either aggregate card returned only totals, readiness distribution, branch counts, and skill counts. A crafted A candidate request returned 403 while aggregate access was in effect.
13. **Pass — two-layer candidate access.** A's TPO deliberately upgraded the relationship and then granted `E2E Graduate Engineering Drive`. A returned exactly two drive-scoped students (readiness 85 and 76); the identical crafted access attempt against B returned 403. B remained aggregate-only.
14. **Pass — discovery and grants separated.** A's TPO switched marketplace visibility off. A disappeared from new recruiter discovery, while its My Institutes relationship, drive grant, and two candidate records remained accessible. B stayed visible and aggregate-only.

#### Security and data-integrity evidence

- Before the drive grant, `GET /recruiter/candidates?institutionId=<A>` returned 403 / `OUTSIDE_RECRUITER_SCOPE`; A's aggregate endpoint returned only `summary`, `branchBreakdown`, and `skillBreakdown`.
- After the drive grant, the exact A institution/drive pair returned 200 with two students. Reusing that A drive against B returned 403 / `OUTSIDE_RECRUITER_SCOPE`.
- Readiness values are not frontend fixtures: the QA seed created real resumes and completed aptitude attempts and then invoked the shared readiness service, producing distinct institution averages of 81 and 53.
- Marketplace listing visibility is not an authorization switch. Turning discovery off did not revoke the approved relationship or drive grant.
- Mobile verification at 390px rendered both institution cards with `scrollWidth=375`, `innerWidth=390`, and no horizontal document overflow.
