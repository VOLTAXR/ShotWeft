// Unique tokens provide anchors. The longest increasing chain excludes crossings.
function uniqueAnchors(script: string[], spoken: string[]) {
  const occurrences = (keys: string[]) => {
    const positions = new Map<string, number>()
    keys.forEach((key, index) => positions.set(key, positions.has(key) ? -1 : index))
    return positions
  }
  const left = occurrences(script), right = occurrences(spoken)
  const pairs = script.flatMap((key, i) => {
    const j = right.get(key) ?? -1
    return left.get(key) === i && j >= 0 ? [{ i, j }] : []
  })
  const tails: number[] = []
  const previous: number[] = []
  for (const [index, pair] of pairs.entries()) {
    let lo = 0, hi = tails.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (pairs[tails[mid]].j < pair.j) lo = mid + 1
      else hi = mid
    }
    previous[index] = tails[lo - 1] ?? -1
    tails[lo] = index
  }
  const anchors: typeof pairs = []
  for (let index = tails.at(-1) ?? -1; index >= 0; index = previous[index]) anchors.push(pairs[index])
  return anchors.reverse()
}

/** Banded sequence matching. Positional distance breaks ties between equally many matches. */
export function matchSequence(script: string[], spoken: string[]): Map<number, number> {
  const matched = new Map<number, number>()
  let i0 = 0, j0 = 0
  for (const { i, j } of [...uniqueAnchors(script, spoken), { i: script.length, j: spoken.length }]) {
    const rows = i - i0, columns = j - j0
    if (rows && columns) {
      // Small gaps use a wide band. Large passages keep working memory bounded.
      const band = Math.max(8, Math.min(64, Math.floor(1_000_000 / rows / 2), 8 + Math.abs(rows - columns) * 2))
      const stride = 2 * band + 1
      const steps = new Uint8Array((rows + 1) * stride)
      let prior = new Float64Array(stride)
      let scores = new Float64Array(stride)
      const origin = (row: number) => Math.round(row * columns / rows) - band
      // A scaled diagonal can jump over an entire band when one side is very sparse.
      // In that case each script word searches forward near its proportional position.
      if (columns > rows * band) {
        let next = 0
        for (let row = 0; row < rows; row++) {
          const center = Math.floor(row * columns / rows)
          for (let col = Math.max(next, center - band); col < Math.min(columns, center + band + 1); col++) {
            if (script[i0 + row] !== spoken[j0 + col]) continue
            matched.set(i0 + row, j0 + col)
            next = col + 1
            break
          }
        }
      } else {
        const weight = (rows + 1) * (band + 1)
        for (let row = 0; row <= rows; row++) {
          scores.fill(-Infinity)
          const start = origin(row)
          const lastStart = origin(row - 1)
          for (let col = Math.max(0, start); col <= Math.min(columns, start + stride - 1); col++) {
            const index = col - start
            if (!row && !col) { scores[index] = 0; continue }
            const skipScript = row ? prior[col - lastStart] ?? -Infinity : -Infinity
            const skipSpoken = scores[index - 1] ?? -Infinity
            let score = skipScript, step = 1
            if (skipSpoken > score) { score = skipSpoken; step = 2 }
            if (row && col && script[i0 + row - 1] === spoken[j0 + col - 1]) {
              const pair = (prior[col - 1 - lastStart] ?? -Infinity) + weight - Math.abs(index - band)
              if (pair >= score) { score = pair; step = 3 }
            }
            scores[index] = score
            if (Number.isFinite(score)) steps[row * stride + index] = step
          }
          ;[prior, scores] = [scores, prior]
        }
        let row = rows, col = columns
        while (row || col) {
          const step = steps[row * stride + col - origin(row)]
          if (step === 3) { matched.set(i0 + --row, j0 + --col); continue }
          if (step === 1) row--
          else if (step === 2) col--
          else break
        }
      }
    }
    if (i < script.length) matched.set(i, j)
    i0 = i + 1
    j0 = j + 1
  }
  return matched
}
