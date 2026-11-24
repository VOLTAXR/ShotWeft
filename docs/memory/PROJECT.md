# ShotWeft Project Memory

Last verified: 2026-11-24
Branch: `feat/shotweft-v2-ai-director`
Product codename: V2.0

## Product

ShotWeft is a local-first AI video director and pre-production workspace. It turns a user-supplied script into a planned, editable video. ShotWeft does not generate or rewrite the original screenplay. The user may write it manually or use Gemini, another model, or any external tool. ShotWeft must not bind to Gemini or any single model provider.

Production flow:

`script import → semantic understanding → director planning → asset matching → speech alignment → visual composition → motion → Remotion render → review → delivery`

Two production modes share the DirectorPlan, visual component library, director rules, and render engine:

- Mode A: script-driven animated explainer.
- Mode B: real-person presenter/talking-head video.

Existing V1.6 FFmpeg project-ZIP rendering remains supported. Remotion is an additive local renderer, not a second authoring timeline.

## Non-negotiables

- Local-first by default; no required cloud service, paid TTS, or model download.
- User script is preserved verbatim unless the user explicitly edits it.
- Two modes must not fork into separate visual systems.
- Existing V1.0/V1.5/V1.6 projects and the 45-group regression must keep working.
- No force push, main merge, npm publication, release/tag changes, or distribution decision without authorization.
- Package version remains `1.5.0` during V2 development.
- Remotion 4.0.546 is source-available/non-OSI; current use is local evaluation only.
- A user-installed LGPL FFmpeg/ffprobe is the encoder for rendered MP4s; no FFmpeg binaries are bundled.
- Authorized upstream: wallstreet-explainer at `b79bc0573455cb5fe335e78f653012e658fa9758`, MIT software; its example media is excluded.

## Quality position

Every shot must answer what the viewer understands, how it connects to the script, and how it connects to the previous/next shot. Mechanical scene rotation, decorative motion, and placeholder media presented as real evidence are defects.