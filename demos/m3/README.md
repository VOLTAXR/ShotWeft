# M3 Synthetic Presenter Test

**Engineering fixture only.** This is not a real presenter, human voice, automatic speech recognition result, or the 60-second presenter acceptance demo.

- [`m3-synthetic.mp4`](m3-synthetic.mp4): 23.100 s, 640×360, 30 fps, 693 frames, H.264/yuv420p and one stereo 48 kHz AAC-LC audio stream.
- [`director-plan.json`](director-plan.json): editable DirectorPlan with full-frame, picture-in-picture, left split, and full-screen B-roll layouts. It uses cuts, not a morph.
- [`fixture/`](fixture/): original Chinese script, interpolated transcript and local source media. The presenter video is an FFmpeg `testsrc2` pattern with synthetic Microsoft Huihui SAPI speech. The B-roll is synthetic SMPTE color bars plus a test tone; it is muted in the final mix.
- [`captions.srt`](captions.srt) and [`captions.vtt`](captions.vtt): caption exports from the validated plan. These formats do not carry the Player's word highlights.

## Reproduce from a source checkout

Build with `npm run build`, and configure `FFMPEG_PATH`, `FFPROBE_PATH`, and `PLAYWRIGHT_BROWSERS_PATH` for the existing LGPL FFmpeg/ffprobe and Chromium. Export to a new path; these commands refuse to overwrite existing outputs.

```bash
mkdir -p .tmp/m3-demo
node dist/cli/shotweft.js director validate-presenter demos/m3/director-plan.json
node dist/cli/shotweft.js director export-captions demos/m3/director-plan.json --output .tmp/m3-demo/captions.srt
node dist/cli/shotweft.js video export-remotion demos/m3/director-plan.json --output .tmp/m3-demo/presenter.mp4
```

The tests decode all four layouts, confirm the voice is mixed once and the B-roll tone is muted, and exercise round PiP, right split, and a vertical presenter window in the shared Player. Local model execution and real-person editorial and sync review remain separate acceptance gates. No model or upstream example footage is bundled.
