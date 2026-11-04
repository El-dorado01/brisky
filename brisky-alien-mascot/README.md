# Brisky mascot playground

Standalone, local-only React + TypeScript + Vite playground. The original specification and both reference images are preserved in this folder.

## Run

From this folder on Windows:

```powershell
npm.cmd install --workspaces=false
npm.cmd run dev
```

Open the local URL printed by Vite. `npm.cmd run build` checks TypeScript and produces `dist/`. No backend, credentials, models, or texture downloads are needed. The optional Google font falls back to the system sans-serif when offline.

## First visual checkpoint

- Rounded, appendage-free procedural jelly mesh with blue/cyan/pink vertex colors, clearcoat, and iridescence.
- Large eyes, a small smile, blink, breathing, hover, and four drifting satellites.
- Six expression previews: idle, listening, sleeping, surprised, playful, and dragged. Poke briefly widens the eyes and opens the mouth, then changes to a wink with tongue and upper teeth before restoring the current pose. Drag holds an excited open-mouth expression with teeth and tongue, then settles after release. Listening uses an attentive tilt and small curious mouth.
- Character-only pointer hit area with tap squash/rebound, bounded drag, velocity stretch, satellite trailing, spring return, pointer cancellation, and keyboard poke. Poke and drag wake the mascot; search focus also wakes it.
- Sleep is matched to the emotion grid's domed, flattened-base silhouette using a body-mesh morph, compact relaxed eyelids, a tiny resting mouth, slower breathing, and four close satellites. Its face stays above the base. Decorative painted-on highlight meshes were removed after visual inspection.
- Search mock remains usable independently of the canvas. It displays preview text only and does not perform a library search.
- CSS character fallback for unavailable WebGL/render errors; hidden-tab animation pause, capped DPR, and system reduced-motion support.

`src/BriskyCompanion.tsx` exposes `BriskyCompanion({ config, enabled, onInteraction?, pokeSignal?, greetingSignal? })`; `BriskyConfig` is the typed tuning contract. `onInteraction` receives `poke`, `drag`, or `release`; increment `pokeSignal` to preview a poke or `greetingSignal` to play a three-second greeting. `src/BriskyFace.tsx` owns expression shapes and blending. Temporary reactions restore the current pose and clean up timers on unmount. `src/BriskyGreetingArm.tsx` builds a procedural extension with progressive growth, a rounded tip, waving, and retraction. `src/main.tsx` owns the isolated playground. `src/style.css` contains responsive UI and static fallback styling. Open `/?pose=sleeping` or `/?pose=greeting` to load those poses directly.

## Greeting arm

Click **Say hello** to wake Brisky and play the greeting; the arm grows, waves, and retracts automatically. **Greeting** holds the pose for inspection; select **Idle** to retract. Happy closed eyes and an open mouth accompany the raised arm. Satellites gather and make room for it. Reduced motion uses a stable raised-arm pose and immediate growth/retraction. Poke and drag interrupt a timed greeting. Selecting a new pose or disabling the mascot clears the greeting timer. Explicitly held Greeting returns after temporary reactions, like other selected preview poses.

The arm is a separate, overlapping procedural mesh using matching physical material settings and related vertex colors. It is not welded topology or a seamless implicit surface. Lighting can reveal the join; material continuity remains a polish item. The search antenna and two-arm success celebration are implemented.

## Search antenna and simulator

Submit a nonempty query to run a 2.8-second local simulation. A short antenna grows from the top of Brisky, scans with a softly lit bulb, and retracts at completion. Eyes stay open and focused downward with subtle pupil scanning, and satellites fan outward before returning. The **Searching** expression holds the pose for inspection; **Idle** retracts it. Reduced motion uses a static antenna and gaze.

Choose Success, No results, or Error in **Demo outcome**. Cancel search stops the pending demo; submitting again replaces it. Search remains authoritative during poke/drag and works with Brisky disabled. `src/searchSimulation.ts` guards against stale, duplicate, and cancelled completions using request IDs. This is simulated UI, not real library search.

## Success celebration

Success plays a 2.3-second celebration automatically: two temporary jelly arms, excited open eyes and mouth with teeth/tongue, a damped bounce, and a short satellite burst. It then restores Idle and retracts both arms. **Celebrate** plays the same animation without a search; the **Success** expression holds the pose for inspection. Select **Idle** to retract from a held pose.

Poke, drag, input focus, a new search, or a new preview pose can interrupt a timed celebration. Empty, error, cancelled, and stale search completions do not trigger it. Reduced motion uses stable arms and expression with no bounce or burst. Both arms reuse the procedural greeting-arm mesh with a mirrored right-side instance; the joins are overlapping geometry, not welded surfaces. `review/success-celebration.png` shows the two-arm pose.

`npm.cmd test` runs focused request-lifecycle tests (Node 22+ with built-in TypeScript stripping). Headless Chrome checks passed for antenna growth/retraction, persistent antenna during poke, pending-search replacement, all three outcomes, cancellation, reduced motion, mobile overflow, and absence of uncaught exceptions. `review/search-antenna.png` shows the open-eye search pose. The antenna, like the greeting arm, uses overlapping meshes rather than welded topology.

This is a visual prototype for approval, not the complete implementation spec. The material approximates translucent jelly using color, lights, and clearcoat; it does not implement volume refraction or fluid simulation. Size is a dashboard target and varies with camera projection. Poke currently squashes the entire body rather than creating a local surface dent. Drag stretch uses axis-aligned velocity channels, not a soft-body solver. Automatic idle sleep/roaming, full search lifecycle arbitration, context-loss recovery, full debug telemetry, and dashboard integration remain pending. Physical touch-device QA remains necessary.

## Verification

TypeScript and the Vite production build passed. Visual screenshots were inspected in local headless Chrome using SwiftShader because the in-app Browser skill's execution tool was unavailable. Browser checks passed for canvas rendering, poke, mouse drag, spring return within 2 px of home, search-focus wake, reduced-motion poke, mobile layout without horizontal overflow at 390 px, and absence of uncaught JavaScript exceptions. Screenshots are in `review/`. Actual GPU rendering, physical touch scrolling/cancellation, keyboard interactions, and WebGL fallback still need device testing. The build reports a large JavaScript chunk (about 1.13 MB uncompressed / 314 KB gzip), primarily the 3D runtime; defer loading the character when integrating into the dashboard.

The expression pass additionally verified all six preview states, the surprise/playful/neutral poke sequence via an attribute observer, and held-drag emotion followed by neutral restoration. `review/expressions.html` and `review/expression-comparison.png` compare the supplied sleeping reference with the implemented face/body and show all expressions. The reference still has richer translucent lighting and more organic asymmetry; this pass aligns pose and emotion rather than claiming an exact material match.

The greeting pass verified all seven preview states, progressive arm growth through intermediate values, full extension, timed return to Idle, retraction below 1% growth, greeting from Sleep, and interruption by poke in headless Chrome. Existing poke/drag, spring return, focus wake, reduced-motion poke, mobile overflow, and exception checks passed again. `review/greeting-arm.png` shows the final rounded arm tip.

The celebration pass verified progressive extension and retraction of both arms, manual and search-triggered timed celebration, neutral recovery, absence of celebrations for empty/error/cancelled searches, poke/new-search interruption, stable reduced-motion arms, mobile overflow, and no uncaught JavaScript exceptions in headless Chrome. Both request-lifecycle unit tests also passed.
