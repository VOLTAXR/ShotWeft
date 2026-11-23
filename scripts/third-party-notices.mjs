import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const lock = JSON.parse(await readFile('package-lock.json', 'utf8'))
const notices = ['FrameOS Studio — runtime third-party notices', '']
for (const [path, item] of Object.entries(lock.packages)) {
  if (!path || item.dev) continue
  const metadata = JSON.parse(await readFile(join(path, 'package.json'), 'utf8'))
  const documents = (await readdir(path)).filter(name => /^(licen[cs]e|copying|notice)(\..*)?$/i.test(name))
  notices.push(metadata.name + ' ' + metadata.version + ' · ' + (metadata.license ?? 'license in package'))
  for (const name of documents) notices.push(name, (await readFile(join(path, name), 'utf8')).trim(), '')
  if (!documents.length) notices.push('The publisher declares the above license in package.json.', '')
}
await writeFile('public/THIRD_PARTY_NOTICES.txt', notices.join('\n'))

