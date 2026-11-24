# M2 Script-Animation Demo

This is the M2 acceptance artifact produced on the `feat/shotweft-v2-ai-director` branch.

## Files

- `m2-demo.mp4` — real Remotion MP4, 1280×720, 30/1 fps, 2,509 frames, 83.633 s, H.264 yuv420p + AAC-LC stereo 48 kHz.
- `director-plan.json` — editable, validated DirectorPlan used for the render.
- `project.zip` — editable ShotWeft project (ZIP manifest v3) with the same plan, linked project assets, a cover image and thumbnails.
- `script.md` — verbatim Chinese source script.
- `narration.m4a` — narration track used by the plan and project.
- `media/` — local image and B-roll inputs.
- `contact-sheet.jpg` — sampled frames for visual inspection.

## Verification

- Plan: 11 shots, 1 scene, 16:9, 30/1 fps, 83.633 s.
- Shot types include title, image, chart and graphic; the storm passage has a real B-roll layer.
- One shared `海岸线` element morphs between shots 1 and 2.
- Captions are generated from the same script segments; the explicit narration track is mixed once.
- Project ZIP round-trips the plan and all five linked project assets.
- The final MP4 was decoded and sampled; see `contact-sheet.jpg`.

## Honest limitations

The narration is **synthetic Windows SAPI speech (Microsoft Huihui)**, not a human recording. It proves the narration, alignment/reflow, captions and audio-mix path, but it is **not** the human-voice acceptance required by the product spec. Replace `narration.m4a` with an authorized human recording and re-import/reflow before claiming human acceptance.

The plan uses existing local demo images/video from `public/demo-media` and does not copy any upstream wallstreet-explainer example media. The project ZIP contains only those local media files. No external service is used by the render.

## Reproduction outline

The MP4 was generated with the local LGPL FFmpeg/ffprobe build and an existing Chromium install:

```bash
node dist/cli/shotweft.js video export-remotion demos/m2/director-plan.json \
  --output demos/m2/m2-demo.mp4 \
  --ffmpeg .tmp/ffmpeg-lgpl/ffmpeg-n8.1-latest-linux64-lgpl-8.1/bin/ffmpeg \
  --ffprobe .tmp/ffmpeg-lgpl/ffmpeg-n8.1-latest-linux64-lgpl-8.1/bin/ffprobe \
  --browser "$(PLAYWRIGHT_BROWSERS_PATH=$PWD/.browsers node -e "process.stdout.write(require('playwright').chromium.executablePath())")"
```

The TTS step is deliberately outside the repository build; the generated audio is retained so the artifact remains inspectable without a network service.
