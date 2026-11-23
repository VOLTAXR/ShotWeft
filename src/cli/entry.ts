#!/usr/bin/env node

function reportFailure(error: unknown) {
  process.stderr.write(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) + '\n')
  process.exitCode = 1
}

process.stdout.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EPIPE') process.exitCode = 0
  else reportFailure(error)
})

const [major, minor] = process.versions.node.split('.').map(Number)
if (major < 22 || (major === 22 && minor < 12)) {
  reportFailure('ShotWeft CLI 需要 Node.js 22.12 或更高版本')
} else {
  // Load Node-specific APIs only after the runtime check.
  import('./main').catch(reportFailure)
}
