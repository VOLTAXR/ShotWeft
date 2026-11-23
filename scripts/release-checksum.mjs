import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const directory = process.argv[2] ?? 'artifacts'

function checksumLine({ filename, sha256 }) {
  if (!/[\\\r\n]/.test(filename)) return `${sha256}  ${filename}`
  // Match sha256sum's escaping so each filename occupies a single line.
  const escaped = filename.replaceAll('\\', '\\\\').replaceAll('\r', '\\r').replaceAll('\n', '\\n')
  return `\\${sha256}  ${escaped}`
}

try {
  const entries = await readdir(directory, { withFileTypes: true })
  const names = entries.filter(entry => entry.isFile() && entry.name.endsWith('.tgz'))
    .map(entry => entry.name).sort()
  if (!names.length) throw new Error('No .tgz files found')

  const { name, version, engines } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  const files = []
  for (const filename of names) {
    const hash = createHash('sha256')
    let bytes = 0
    for await (const chunk of createReadStream(join(directory, filename))) {
      hash.update(chunk)
      bytes += chunk.length
    }
    files.push({ filename, bytes, sha256: hash.digest('hex') })
  }

  const manifest = {
    name,
    version,
    engines,
    files,
    generatedBy: 'scripts/release-checksum.mjs',
    description: 'Package metadata comes from the repository package.json. Sizes and SHA-256 hashes are calculated from the .tgz files in the artifact directory.',
  }
  await writeFile(join(directory, 'release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  await writeFile(join(directory, 'SHA256SUMS.txt'), files.map(checksumLine).join('\n') + '\n')
  console.log(`Wrote SHA256SUMS.txt and release-manifest.json for ${files.length} tarball(s)`)
} catch (error) {
  console.error(`Release checksums failed: ${error.message}`)
  process.exitCode = 1
}
