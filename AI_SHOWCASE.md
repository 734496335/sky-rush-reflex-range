# AI Showcase — Building Sky Rush with an AI-Assisted Workflow

*Bonus prize write-up for the Cloud9 x JetBrains: Sky's The Limit Hackathon
2026. This document describes how Sky Rush was designed, built, and tested
with an AI coding agent working inside a JetBrains IDE–centered workflow.*

## The problem

The deliverable was a booth mini-game with an unusual constraint profile:
it had to be *finished*, not just demoed. Sixty-second rounds, zero install,
any device, readable across a crowded booth, and robust enough that event
staff never have to touch it. The tech budget was deliberately tiny — one
static folder, no build step, no assets — which meant the interesting work
was game-feel tuning and edge-case discipline, not framework plumbing.

The workflow question was just as important as the game question: **how do
you split work between a human directing and an AI agent implementing, so
the result is a coherent, tuned game instead of a pile of generated code?**

## The workflow

The project lived in IntelliJ IDEA as a plain static web project. The loop
for every work session was:

1. **Human sets the brief.** A short written spec per iteration: the exact
   behavior wanted, the constraints (no external assets, English UI,
   original art only), and the acceptance check ("a round must start, score,
   pause, and end cleanly").
2. **Agent drafts the implementation.** The AI agent produced or revised
   whole files (`js/game.js`, `js/audio.js`, `js/leaderboard.js`,
   `css/style.css`) rather than scattered snippets, so each iteration could
   be reviewed as a unit in the IDE.
3. **Human reviews in the IDE.** Diff review, rename passes, and deletion of
   anything that didn't earn its place. Several agent suggestions were
   rejected at this step (see Iterations).
4. **Verify, then tune.** Syntax checks on every JS file, a manual playtest
   pass against a written checklist (start → pause → visibility-change
   pause → decoy hit → golden hit → time-up → leaderboard save), and only
   then numeric tuning of the difficulty curve.

## What the agent did vs. what the human directed

**The human directed:**

- The game concept and its booth-first design pillars (60-second rounds,
  decoys as the skill element, attract screen with a live leaderboard).
- Every numeric decision that defines game feel: spawn interval curve,
  target lifetimes, decoy probability, the −150 points / −1 second decoy
  penalty, and the x5 combo cap.
- All acceptance calls: what "done" means for each screen and state, and
  which agent suggestions were cut.

**The agent did:**

- Implemented the explicit state machine (attract / playing / paused /
  ended) and the single `requestAnimationFrame` loop with clamped
  frame-time.
- Wrote the canvas renderer (targets, lifetime rings, hit bursts, floating
  score text, screen shake) and the WebAudio synthesizer for all sound
  effects — no audio files.
- Built the `localStorage` top-5 leaderboard with initials entry, including
  graceful degradation when storage is unavailable.
- Drafted the documentation set (README methodology, this showcase, and the
  demo video script) from the actual implementation, and ran the syntax
  verification passes.

## Iterations worth mentioning

1. **Module format.** The agent's first instinct was ES modules; the human
   rejected that because `file://` module loading is unreliable across
   browsers, and "runs by double-clicking index.html" was a hard
   requirement. The shipped code uses classic scripts with namespaced
   globals (`SkyAudio`, `SkyBoard`) — less fashionable, and it works from a
   USB stick.
2. **Decoy fairness.** Early tuning made decoys visually subtle. Playtest
   feedback: at booth distance, subtle reads as *unfair*, not clever.
   Decoys became unmistakable (red disc, white panel, bold X) and the skill
   moved to reaction discipline under time pressure instead of eyesight.
3. **Pause semantics.** The agent initially paused only via the pause
   button. The human required automatic pause on tab visibility change —
   the single most likely booth interruption — plus a clamped frame delta
   so returning to the tab can never fast-forward the clock.
4. **Score feedback.** Floating score text and pitch-rising hit sounds were
   added after the first silent playtest felt flat; both were cheap to
   implement and changed the perceived quality more than any visual change.

## Result

A complete, dependency-free game in five source files, built through short
brief → draft → review → verify loops, with every game-feel decision owned
by the human and the implementation volume carried by the agent. The same
loop produced the README, this showcase, and the video script — the
documentation describes the code that actually shipped, because it was
written from it, not before it.
