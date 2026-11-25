# Vendored Onda motion primitives

Source: https://github.com/degueba/onda
Pinned commit: 3c814051269597b31fee1603bef7ccfb93d091b6 (main, 2026-06-17)
License: MIT (see LICENSE below)

Files copied verbatim into this directory:

- `motion.ts`      <- `lib/motion.ts`
- `easing.ts`      <- `lib/easing.ts`
- `choreography.ts` <- `lib/choreography.ts`

They are pure TypeScript frame/spring helpers and depend only on `remotion`.
ShotWeft adapts their vocabulary (entry/exit patterns, spring tokens, house
easing, stagger) in `src/director/animation.ts`; no Onda CLI, registry or
component tree is vendored. `KenBurns` pan/zoom and `CountUp` numeric reveal are
reimplemented with these tokens and attributed to Onda's `ken-burns` and
`count-up` components.

---

MIT License

Copyright (c) 2026 Rodrigo Botelho

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
