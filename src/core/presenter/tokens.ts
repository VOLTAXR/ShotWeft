// Public character offsets count Unicode code points. Match indexes from regexes count UTF-16 units.
const word = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|[\p{L}\p{N}][\p{M}]*(?:(?:['’.-](?=[\p{L}\p{N}]))?(?![\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])[\p{L}\p{N}][\p{M}]*)*/gu

export function wordTokens(text: string, script = false) {
  // Omit Markdown heading labels from speech while preserving their original offsets.
  const spoken = script ? text.replace(/^([ \t]*#{1,6}[ \t]+[^\r\n]*)/gm, line => ' '.repeat(Array.from(line).length)) : text
  let cursor = 0
  let charEnd = 0
  return [...spoken.matchAll(word)].map(match => {
    const charStart = charEnd + Array.from(spoken.slice(cursor, match.index)).length
    cursor = match.index + match[0].length
    charEnd = charStart + Array.from(match[0]).length
    return { text: match[0], key: match[0].normalize('NFKC').toLowerCase().replaceAll('’', "'"), charStart, charEnd }
  })
}
