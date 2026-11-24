# M3 Synthetic Presenter Fixture

This is a **non-human test fixture** for the M3 presenter renderer, not an acceptance video.

- `presenter.mp4`: 640×360, 23.119 s, H.264 + AAC, generated from FFmpeg `testsrc2` and a synthetic Windows SAPI (Microsoft Huihui) Chinese narration.
- `narration.wav`: synthetic SAPI source.
- `script.md`: the spoken fixture text.
- `tts.txt`: TTS input after removing the Markdown heading.

It must not be described as a real presenter, real human voice, or M3 human acceptance. No ASR model is bundled or downloaded.
