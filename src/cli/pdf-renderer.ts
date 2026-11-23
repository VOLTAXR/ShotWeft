import { renderShotFrame } from '../export-shot'
import type { Project } from '../model'
import { storyboardPDF } from '../storyboard-pdf'

const chunkSize = 256 * 1024

async function render(project: Project, backdrops: [string, string][]) {
  const sources = new Map(backdrops)
  const pdf = await storyboardPDF(project, (shot, longEdge) => renderShotFrame(shot, project.frame, longEdge, sources.get(shot.id)))
  for (let offset = 0; offset < pdf.size; offset += chunkSize) {
    const chunk = await pdf.slice(offset, offset + chunkSize).arrayBuffer()
    await window.writeShotWeftPDFChunk(new Uint8Array(chunk))
  }
  return pdf.size
}

declare global {
  interface Window {
    renderShotWeftPDF: typeof render
    writeShotWeftPDFChunk: (chunk: Uint8Array) => Promise<void>
  }
}

window.renderShotWeftPDF = render
