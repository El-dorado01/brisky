# Teach Brisky: manual people UI

2026-11-01 modal redesign: the Space tagging flow now uses a wider two-column
desktop layout and stacked mobile drawer. The header and action footer stay
visible while the content scrolls. A dedicated frame stage keeps the drawing
surface aligned with landscape or portrait images; selection shading, reset and
step labels guide the interaction. The person selector supports inline creation
and a selected profile summary. Visibility times are readable in the summary;
time editing and numeric box entry are expandable. Saved tags have a distinct
confirmation state with undo. Hugeicons animate from their enclosing buttons.
This changes presentation of the existing teaching/preflight flow, not detection
accuracy or backend behavior. Shared connector dialogs retain their default layout;
tagging opts into new panel/content class overrides.

2026-11-01 follow-up: teaching now runs a local face-selection check before saving.
A proposed tighter box requires user acceptance and another Teach action; ambiguous,
small, missing or unavailable detections offer an explicit manual-save fallback.
See [the current matching pilot](local-face-matching.md) for endpoint details and
limits. This does not certify identity or resolve the measured enrollment failures.
The older manual-only scope and validation below remain a historical record.

Implemented during the hackathon on 2026-11-01, extending the previously implemented
manual people/appearance backend and pre-existing source playback. This does not
implement automatic face recognition or model training.

The People & Entities page now loads owner-scoped people from the engine rather
than the sample directory/browser storage. Users can teach a name, aliases and
“this is me,” edit profiles, review/remove tags and confirm profile deletion.
Cards are the default view; the Cards/Table toggle switches to a compact directory
without clearing search or changing the available actions. Reloading returns to cards.
The two existing new-entity URLs open the same real teaching form. Historical
prototype components/data remain unused; no sample recognition metrics are shown.

In a saved moment's source inspector, play the source and choose **Tag a person**.
The video pauses and a frame is captured locally; no separate upload or remote
model call is made. Draw a face box (or enter percentage coordinates), choose or
create a person, and specify a visible range within the saved moment. Saving sends
the original asset ID, original-source frame/range seconds and normalized box to
the existing appearance service. The user can immediately undo the tag. A tag is
an assertion about the selected moment, not proof of identity elsewhere or of an
interaction between people. Custom things and automatic face matching remain pending.

Next `/api/people/[[...path]]` proxies only the permitted directory/appearance CRUD
routes through `/api/v1/saas-engine/people`. Browser cookies stay HTTP-only; the
Next server forwards the session using the existing SaaS session authentication.
Writes require same origin, owners come from authenticated sessions, and existing
service ownership/duration/box validation remains authoritative. Developer JWT
people endpoints retain their existing authentication. No database schema changed.

Validation: API/web TypeScript, targeted UI lint, 30 existing people regressions,
and actual Next/engine/PostgreSQL browser checks with isolated users and a generated
blue clip. Checks cover profile persistence, mouse box geometry, original frame
time, save/undo/review/removal/deletion, 390/1280 layouts, unauthenticated denial,
cross-owner deletion denial and cross-origin write denial. Temporary users/media
were removed; no paid inference. See
`hackathon-evidence/2026-11-01-people-ui.json`.

Real-face usability, touch-device dragging, numeric-entry interaction and recognition
accuracy have not been evaluated on personal footage. The current directory uses
initial avatars; it does not yet display saved face-crop thumbnails. People search
exists in the backend; full conversational SaaS integration and automatic matching
remain separate milestones. Do not imply that naming a profile trains a face model.


2026-11-02 update: tagging starts from the player's current paused frame. The modal
now offers a timestamp slider and **Use this frame** to choose another view within
the saved moment; this resets the selection box. People can be searched by name or
alias, edited, or deleted after confirmation inside the tagging flow. Visibility uses
From/Until sliders constrained to include the chosen frame. These controls extend
the existing profile CRUD and do not imply automatic best-frame selection.

Face checks can read a versioned original from the connected Drive without a local
preview. The short-lived bridge closes after checks/scans and keeps the existing
100 MiB recognition-source limit. Unsupported/unavailable connector sources retain
an explicit retry/manual-tag path. Detector availability is separate from measured
recognition accuracy; the latter remains an evaluation limitation.
