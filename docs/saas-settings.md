# SaaS settings

Open the sidebar user menu → Settings (`/settings`). Profile opens
`/settings?section=profile`. The page uses the signed-in account, replacing the
previous sample profile and unsupported “verified face & voiceprint” claim.

Groups and working controls:

- Profile: display name and comma-separated profile aliases; read-only sign-in email.
- Workspace: saved workspace name, symbol and main-use selection.
- Connections: real connected-account status plus the existing connector/folder/sync
  manager. Its mobile dialogs remain drawers and keep their existing dirty guards.
- Experience: show/hide the Space mascot, follow device/reduced mascot motion, and
  reset browser preferences.
- Appearance: Light, Dark or System theme plus Small, Standard, Large or Extra large
  text. Changes apply across account/app layouts and follow OS changes in System mode.
- Read aloud: show/hide the reply action, browser voice, speed and a voice preview.
- People & memory: links to real person/alias/reference management and Space tagging.
- Privacy & data: describes extracted/indexed data versus originals and links to
  existing removal/access controls without promising automatic index erasure.
- Sign-in & security: current email-code account and confirmed sign-out for this session.
- Developer: entry to the existing developer workspace; server credentials stay private.

Profile/workspace edits reuse the authenticated GET/PUT `/api/onboarding` service
and its owner-scoped validation/transaction. One save bar covers changes across the
two groups; failures preserve edits. Save refreshes the sidebar account label. There
is no new database schema, migration, key or provider switch.

Browser preferences (including appearance) are non-sensitive JSON at `brisky.browser-preferences.v1` in
localStorage, shared by Brisky accounts on that browser and **not synced between
devices**. Stored values are validated, storage failures show an error, and changes
propagate to open same-origin tabs. `SpaceCompanion` consumes visibility/motion;
`ResponseActions` consumes read-aloud visibility, voice and rate. Device reduced
motion always takes priority. Pending-reply status text remains visible when the mascot is hidden.
Voice & speech now selects Gemini voices for both immersive calls and saved reply
read-aloud. Kore remains the default; Puck, Charon, Aoede, Zephyr and Sulafat are
available. Selecting a voice auditions one of four fixed meaningful sentences.
Preview captions can be toggled without requesting new audio. These preferences
remain browser-local; legacy device-voice values do not override the Gemini choice.
Theme-aware canvas/surface/foreground tokens cover app cards, controls, dialogs,
dropdowns and Factory controls. Solid-action colors retain white-text contrast.
Text tokens scale labels/readers while leaving layout spacing/media dimensions
unchanged; mobile inputs retain a 16px minimum. Browser pinch zoom is also enabled.
The marketing site retains its existing visual identity.

Unsaved profile/workspace edits trigger a custom dialog before following internal
links and when signing out here; closing/reloading a dirty tab uses the browser's
standard unsaved-change warning. Switching settings groups preserves the draft.
Settings dropdowns share the app's searchable popover/listbox control with the
source and person pickers. Voice selection uses six named options; keyboard selection,
Escape focus restoration, viewport positioning and reduced-motion reveal are supported.
Account deletion, sign-in email changes, password/2FA, billing, global session
revocation, BYOK and API-key issuance have no new implementation in this change.
They are not presented as working settings.

Validation: web type/lint checks, synthetic 390/1280px settings checks for real-form
shape, failed save/retry, unsaved navigation, preference storage/reset, voice preview,
connector dialogs and sign-out cancellation. A separate Space fixture verified
mascot/read-aloud visibility and the selected voice/rate on actual response actions.
These fixtures mock account writes, source calls and speech; no real account changes,
new media transfers or paid model calls occurred.

2026-11-03 speech update: all six voices passed authenticated live fixed-sentence
Gemini preview generation; no personal media or user replies were sent for those
checks. 390/1280px simulated checks passed selection/audition, caption toggling
without extra calls, persisted preference and Space read-aloud sending the saved
assistant ID plus selected voice. TypeScript, lint and five engine voice-boundary
tests passed. See [voice scope](saas-voice.md).
