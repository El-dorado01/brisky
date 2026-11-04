# Brisky — Shapeshifting Mascot Implementation Specification

**Version:** 2.0 · **Date:** 27 October 2026  
**Audience:** Coding agent, frontend engineer, motion/3D designer  
**Product:** Brisky · **Domain:** heybrisky.com  
**Status:** Implementation brief; visual reference images supplied separately

> **Naming decision:** The product **and** the mascot are both named **Brisky**. **Bri** was an earlier working name and is deprecated. Use `BriskyMascot`, `BriskyCompanion`, etc. in code, UI, docs, and analytics. “Hey Brisky!” is the signature greeting and interaction.

## 1. Mission

Build a charming, responsive, **shapeshifting jelly creature** that lives above Brisky's centered media-search field. Brisky should feel alive, curious, intelligent, and playful through expressive facial animation, elastic motion, occasional roaming, touch responses, contextual thought bubbles, and temporary body-part transformations. It must **never** impair the search experience.

**Initial deliverable:** a standalone **Brisky Mascot Playground**, independent of the backend, with a realistic dashboard search mock, working interaction/state system, and test controls. Integrate into the production search page only after the character and interaction quality are approved.

### Success criteria

- Immediately recognizable at **100–180 px** dashboard size.
- Looks appealing while still; delights without constant movement.
- Poke, drag, search, and greeting produce distinct, responsive behaviors.
- The mascot's **default silhouette has no permanent arms, legs, or antenna**.
- Temporary features grow *out of* the body and retract smoothly.
- Search works perfectly if the mascot is disabled or fails to render.

## 2. Canonical character design — locked decisions

| Attribute | Specification |
|---|---|
| Name | **Brisky** (same as platform) |
| Species | Friendly, intelligent, shapeshifting jelly creature; neither robot nor human |
| Default body | Compact, slightly irregular **rounded blob**, soft organic silhouette |
| Palette | Preserve reference's **iridescent cobalt/blue, cyan, violet/lilac, and pink**; do not replace with a flat single color |
| Material | Glossy, translucent-looking jelly with luminous rim, soft internal gradients and highlights |
| Face | Two large, expressive eyes; small readable mouth; subtle brows optional |
| Default appendages | **None**: no permanent arms, legs, antenna, ears, or fingers |
| Satellites | **3–5 small floating jelly bubbles** around Brisky; match its palette |
| Personality | Curious, warm, gently mischievous, competent; never annoying |
| Motion | Soft anticipation → elastic movement → secondary wobble → settled rest |
| Home | A bounded stage centered above the search input |

**Visual source of truth:** Use the two mascot images supplied in this conversation. The close-up image is the main reference for **color, material, face, and roundness**. The concept-board Blob is the reference for **satellite bubbles and expressive energy**. **Neither image is an exact anatomical model**: remove permanent appendages in the neutral pose. Do not inadvertently implement the robot, astronaut, orb, or sprite designs.

### Visual invariants

1. Maintain consistent eyes, mouth proportions, base palette, and general rounded silhouette across all states.
2. All added anatomy is **temporary**, made of the same jelly material, and visibly connected to the body.
3. Shape changes must be readable at small size; avoid excessive glow or distortion hiding the face.
4. The character always settles back into the recognizable appendage-free default form.
5. Preserve an attractive still-frame composition; motion should enhance, not rescue, the design.

## 3. Shapeshifting design system

Brisky is not a permanently rigged humanoid. Its body is intelligent, elastic material that **forms functional extensions when needed**.

| Trigger | Body transformation | Return behavior |
|---|---|---|
| Greeting | Small arm sprouts from side, waves once or twice | Arm melts/retracts into body |
| Search begins | Short flexible antenna emerges; glowing bulb appears at tip and scans | Antenna retracts after completion |
| Thinking | Body elongates/leans; optionally a tiny hand forms for a thoughtful pose | Returns to rounded form |
| Success | Two tiny arms emerge for brief celebration; bounce/squash | Arms retract and body settles |
| Poke | Local dent + ripple, eye widening; optional playful hand pushes pointer away **later** | Spring rebound |
| Drag | Stretch along velocity vector, face and satellites lag slightly | Damped spring back home |
| Sleep | Body widens/flattens slightly; eyes close | Wakes and regains normal silhouette |
| Surprise | Brief vertical stretch and enlarged eyes | Elastic recovery |

**Morph rules:**

- **Grow, don't pop:** extension must emerge progressively from the existing surface; no instantaneous appearance or detached floating hands.
- **Retract, don't vanish:** reverse the growth into the body with secondary wobble.
- **Keep anatomy minimal:** avoid realistic fingers, joints, shoes, fixed feet, or humanoid complexity.
- **Layer safely:** do not stack incompatible transformations (e.g., drag deformation and celebration limbs) without explicit arbitration.
- **Prioritize clarity:** search antenna and greeting arm are distinct visual signals, not constant decorations.

### Implementation strategy

Start with **procedural body mesh + separate procedural extension meshes**, carefully animated at attachment points. For MVP, mask seams using matching material, overlapping geometry, controlled scaling, and deformation. **Do not claim true seamless topology if it is not implemented.** Evaluate SDF/metaball/implicit surfaces or mesh morphing only if the visual result justifies added shader and performance cost. Avoid implementing a complex soft-body simulator in phase 1.

## 4. Satellite bubbles (intentional secondary characters)

Use **3–5 small orbiting blobs**, with slight differences in size and motion. They should feel related to Brisky, not random particle effects.

| State | Satellite behavior |
|---|---|
| Idle | Gentle slow orbit / drifting, spaced around body |
| Greeting | Gather closer, small synchronized bounce |
| Thinking | Drift upward and circle slowly |
| Searching | Fan outward as tiny scouts; return when done |
| Success | Brief celebratory outward burst, then regroup |
| Dragging | Trail behind motion with delayed follow-through |
| Sleeping | Draw close and slow almost to a stop |

**Optional later interactions:** hover makes a satellite dodge the pointer; tapping a satellite makes it merge into Brisky with a temporary size increase. These are **not MVP blockers**. Cap count and motion complexity for mobile/reduced-motion modes.

## 5. Interaction and motion behavior

- **Idle:** subtle breathing, hovering, occasional blinks and micro-tilts; intermittent small horizontal wander within the stage, never constant restless motion.
- **Roaming:** bounded left↔right drift with spring easing; rare small rotations. Avoid perpetual 360° spins.
- **Eye tracking:** pupils look toward nearby pointer or focused input; clamp range; touch fallback uses attention cues.
- **Poke:** local squash/indentation, eyes widen, brief jelly ripple and rebound; repeated pokes get throttled reactions.
- **Drag:** pointer capture on character only, velocity-based stretch, soft resistance at bounds, spring return on release; satellites trail.
- **Spin:** occasional celebration or deliberate playground control, not idle default.
- **Sleep:** only after sustained inactivity and no active search; wake promptly on interaction.
- **Thought bubbles:** contextual UI boxes anchored to mascot's screen position, not baked into 3D canvas.

**Motion channels must remain independent:** position, orientation, body deformation, temporary extensions, face, satellites, and thought-bubble visibility. Compose effects with priorities instead of competing animations writing to the same property.

## 6. Behavior/event specification

| Event | State / reaction | Suggested thought bubble |
|---|---|---|
| Dashboard arrival | Wake, blink, grow tiny arm and wave | “Hey Brisky!” or “Heyyy! 👋” |
| Idle | Hover, blink, satellite orbit | Optional: “Looking for a memory?” |
| Pointer approaches | Curious lean, eye tracking | Usually none |
| Tap / poke | Squish, ripple, playful blink | “Hehe! That tickles!” |
| Drag / release | Stretch and spring home | “Wheeee!” (throttled) |
| Search input focus | Eyes turn to input, attentive | “What shall we find?” |
| Typing | Subtle curious expression | Optional: “Ooh, interesting!” |
| Search submit | Antenna grows, scanning animation, satellites spread | “On it! 🔎” |
| Search success | Antenna retracts, celebration arms, happy bounce | “Found something! ✨” |
| No results | Thoughtful tilt, calm expression | “Hmm… try another way?” |
| Search error | Mild concerned expression, recover | “Something went wrong. Try again?” |
| Long inactivity | Flatter sleepy form, closed eyes | None |

**Important:** Thought bubbles are Brisky's own speech, not labels that suggest the user is named Brisky. “Hey Brisky!” can also be used as the dashboard's greeting/brand signature; avoid confusing first-person wording.

## 7. State machine and typed event contract

Use a deterministic state machine/reducer with **persistent task state** and **interruptible temporary reactions**. A poke during a search should not cancel or visually misrepresent the ongoing search.

```ts
export type MascotTaskState =
  | 'idle' | 'greeting' | 'listening' | 'thinking'
  | 'searching' | 'success' | 'empty' | 'error' | 'sleeping';

export type MascotReaction = 'none' | 'poked' | 'dragged' | 'surprised';

export type MascotEvent =
  | { type: 'MOUNT' }
  | { type: 'POINTER_MOVE'; x: number; y: number }
  | { type: 'POKE'; x: number; y: number }
  | { type: 'DRAG_START' }
  | { type: 'DRAG_MOVE'; x: number; y: number; vx: number; vy: number }
  | { type: 'DRAG_END' }
  | { type: 'INPUT_FOCUS' }
  | { type: 'INPUT_BLUR' }
  | { type: 'INPUT_CHANGE'; value: string }
  | { type: 'SEARCH_START'; requestId: string; query: string }
  | { type: 'SEARCH_SUCCESS'; requestId: string; resultCount: number }
  | { type: 'SEARCH_EMPTY'; requestId: string }
  | { type: 'SEARCH_ERROR'; requestId: string }
  | { type: 'IDLE_TIMEOUT' }
  | { type: 'WAKE' }
  | { type: 'REDUCED_MOTION_CHANGED'; enabled: boolean };
```

**Priorities:** accessibility / visibility controls > active drag (interaction only) > authoritative search lifecycle > short playful reactions > ambient idle. Use `requestId` to ignore stale search completions. On state change/unmount cancel obsolete timers, transitions, and queued bubble messages.

## 8. Technical architecture

**Recommended starting stack:** React + TypeScript; Three.js / React Three Fiber for character; custom shader or lightweight mesh deformation for jelly effects; spring integration for movement; Motion/Framer Motion for DOM bubbles; Zustand or React reducer for state. **Inspect existing Brisky dependencies before adding libraries.** Do not add a heavyweight physics engine unless justified.

| Module | Responsibility |
|---|---|
| `BriskyMascotScene` | Canvas, camera, lights, transparency, responsive sizing, DPR |
| `BriskyBody` | Rounded jelly mesh, material, squash/stretch, shape control |
| `BriskyFace` | Eyes, mouth, blinking, expressions, eye tracking |
| `BriskyMorphs` | Procedural arms/antenna; growth/retraction timelines |
| `BriskySatellites` | 3–5 small blobs, orbit/trail/search/success behaviors |
| `BriskyMotionController` | Hover, roam, pointer, drag, spring and boundary physics |
| `BriskyMachine` | State transitions, priorities, lifecycle, timer cleanup |
| `BriskyThoughtBubble` | HTML bubble placement, queue/arbitration, accessible status |
| `BriskyCompanion` / `useBriskyMascot` | Public typed API and configuration |
| `BriskyMascotPlayground` | Debug controls and simulated search UI |
| `BriskySearchIntegration` | Adapter for real search events, not coupled to search internals |

Example public API:

```tsx
<BriskyCompanion
  mode="interactive"
  enableRoaming
  enableSatellites
  onInteraction={(event) => console.debug(event)}
/>

// Event bridge, exact API may be adapted to repository conventions:
mascot.send({ type: 'SEARCH_START', requestId, query });
mascot.send({ type: 'SEARCH_SUCCESS', requestId, resultCount: 12 });
```

**Rendering note:** Pure vertex displacement cannot always create convincing growing arms from a simple low-resolution sphere. Prototype temporary extensions separately first; ensure material continuity and good attachment. Test actual silhouette at intended dashboard size before investing in sophisticated shaders.

## 9. Thought-bubble system

- Render bubbles as **DOM/HTML overlays**, positioned relative to Brisky's projected screen coordinates.
- Only **one bubble visible** at a time; priority and cooldown prevent chatter collisions.
- Support preset copy by state/event, plus explicitly provided safe text (render as text, never raw HTML).
- Keep copy short, readable, and localized-ready; clamp within stage/viewport.
- Search-related messages replace idle messages immediately; no stale timers.
- Animate with subtle scale/opacity/vertical motion; no excessive typewriter delays.
- Avoid announcing ambient chatter to screen readers. Meaningful search status goes to a separate polite live region.
- **MVP uses curated copy, not LLM-generated text.** Context-aware dynamic wording is a future enhancement.

## 10. Playground deliverables

Create a standalone route or isolated component, using a centered search field and responsive character stage resembling the future Brisky dashboard.

Required controls:

1. **State simulator:** greeting, idle, thinking, searching, success, empty, error, sleeping, wake.
2. **Morph simulator:** grow/retract one arm, two arms, antenna; reset to neutral.
3. **Interactions:** pointer tracking, poke, drag/release, squash/stretch, bounce, optional spin.
4. **Satellites:** enable/disable and state-specific behavior preview.
5. **Thought bubbles:** preview curated messages and enter custom safe text.
6. **Motion toggles:** roaming, eye tracking, physics intensity, reduced-motion emulation, debug bounds.
7. **Tuning:** size, hover amplitude, wobble, spring stiffness/damping, roam radius, bubble duration.
8. **Debug readout:** current task state, reaction, last event, active morphs, FPS estimate, renderer/fallback mode.
9. **Responsive previews:** desktop/mobile; light/dark background.

Capture stable screenshots for **neutral, greeting, arm growth, antenna search, poke, drag, success, sleep**. Keep the playground usable without backend credentials.

## 11. Accessibility, responsiveness, performance

- Honor `prefers-reduced-motion`: stop roaming, spins, and oscillatory jelly effects; show stable poses and minimal fades.
- Preserve focus and input accessibility; mascot canvas must never cover or trap the search field or result controls.
- Pointer/touch hit areas should be limited to the character; page scrolling outside it must work normally.
- Clamp pixel ratio and shader complexity; avoid frame-loop allocations and excessive dynamic lights/postprocessing.
- Pause/throttle animation when tab is hidden or mascot is offscreen.
- Provide static/low-power fallback when WebGL is unavailable; search must not depend on canvas success.
- Avoid rapid flashes, continuous chatter, or large unrequested movements.
- Test mobile touch behavior, keyboard, screen reader search status, reduced motion, and mid-range hardware.
- Keep thought bubbles legible over light and dark backgrounds.

## 12. Phased delivery and acceptance gates

### Phase 1 — Character foundation (MVP visual gate)

- Build neutral **appendage-free** rounded jelly blob with reference-matched iridescent material, expressive eyes/mouth, **3–5 satellites**, and idle hover/blink.
- Place above centered search field; implement static/WebGL fallback.
- **Pass:** still and animated character recognizable, appealing, and responsive at 100–180 px; no permanent antenna or limbs.

### Phase 2 — Interaction and soft physics

- Add eye tracking, poke indentation/rebound, drag with velocity stretch and spring return, bounded wandering, sleep/wake.
- Satellites follow/orbit/trail and do not obscure input.
- **Pass:** responsive mouse/touch interactions, no scroll hijack, no stuck or runaway motion.

### Phase 3 — Shapeshifting and personality

- Implement **temporary arm growth + wave**, **search antenna growth + retraction**, **celebration arms**, and optional thinking pose.
- Add morph priority/arbitration and consistent body material.
- **Pass:** body parts visibly emerge from and return into Brisky; neutral silhouette restored after every interaction; no abrupt pops.

### Phase 4 — Thought bubbles and search orchestration

- Implement typed state machine, message arbitration, bubble placement, and simulated search lifecycle.
- Handle rapid/overlapping events and stale requests correctly.
- **Pass:** no overlapping bubbles, stuck morphs, or stale success/error reactions.

### Phase 5 — Dashboard integration and polish

- Connect to actual input focus, typing, submit, pending, success, empty, and error events.
- Add accessibility/performance checks, tests, README, and tunable config.
- **Pass:** search remains fast and functional with mascot disabled; character never obstructs UI.

## 13. Definition of done

- [ ] Brisky is consistently named across code, UI, and documentation; no remaining user-facing “Bri”.
- [ ] Neutral form has **no fixed arms, legs, or antenna**.
- [ ] Original blue/cyan/violet/pink iridescent material and recognizable face preserved.
- [ ] 3–5 satellite blobs move meaningfully and remain performant.
- [ ] Hover/blink, bounded roam, poke, drag/release, squash/stretch, eye tracking, and sleep/wake work.
- [ ] Greeting arm, searching antenna, and celebration arms **grow and retract** smoothly.
- [ ] State machine safely arbitrates search vs temporary interactions and stale requests.
- [ ] Thought bubbles display one at a time, stay in bounds, and use safe text.
- [ ] Desktop/mobile, reduced-motion, low-power/WebGL fallback, and accessibility tested.
- [ ] No leaked animation loops, timers, listeners, or render-frame allocations.
- [ ] Reusable `BriskyCompanion` component and standalone playground shipped.
- [ ] README explains component API, configuration, architecture, testing, and limitations.

## 14. Out of scope for first release

Do **not** build a conversational agent, voice wake-word assistant, generative morph selection, realistic fluid simulation, full skeletal rig, advanced SDF metaball renderer, persistent satellite personalities, or contextual transformations into beach waves / dog ears / party hats in the first pass. These are optional future experiments after the core character works.

## 15. Instructions to the coding agent

1. Inspect the existing repository, tooling, frontend framework, animation dependencies, and design system.
2. Locate the **two supplied visual references**; if unavailable in the workspace, request them rather than guessing exact character details.
3. Propose a minimal file tree and incremental plan consistent with the existing stack.
4. Build the **standalone playground first**; do not refactor unrelated Brisky features.
5. **First approval checkpoint:** neutral appendage-free jelly Brisky with satellites, eyes/mouth, hover/blink, and a “Hey Brisky!” bubble above a centered search bar.
6. Next implement interactions, then procedural morphs, then state orchestration and dashboard integration.
7. Keep components typed, testable, performant, and reusable; document shortcuts and visual limitations honestly.
8. Preserve the core brand rule throughout: **Brisky is a rounded, expressive jelly creature that grows temporary anatomy only when needed.**

---

**Brand north star:** *Brisky is not a robot wearing jelly skin. Brisky is a living, intelligent blob whose body becomes whatever the moment requires—and then returns to its simple, lovable form.*
