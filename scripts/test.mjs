import assert from 'node:assert/strict'
import { testPhaseTwo } from './test-phase2.mjs'
import { testPhaseThree } from './test-phase3.mjs'
import { testV1 } from './test-v1.mjs'
import { testCLI } from './test-cli.mjs'
import { testVideoModel } from './test-video-model.mjs'
import { testVideoWorkspace } from './test-video-workspace.mjs'
import { access, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

await mkdir('.tmp', { recursive: true })
await mkdir('docs/screenshots', { recursive: true })
process.env.TEMP = resolve('.tmp')
process.env.TMP = process.env.TEMP
process.env.TMPDIR = process.env.TEMP
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve('.browsers')
const { chromium } = await import('playwright')
const { preview } = await import('vite')
await access('dist/index.html').catch(() => { throw new Error('Run npm run build before npm test.') })
const server = await preview({ preview: { host: '127.0.0.1', port: 0 } })
let browser

async function noHorizontalOverflow(page) {
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
  assert(fits, 'The page must fit horizontally')
}

async function waitForCanvas(page, frame) {
  const canvas = page.getByRole('img', { name: '分镜画布 ' + frame }).locator('canvas').first()
  await canvas.waitFor({ state: 'visible' })
  await page.waitForFunction(() => {
    const canvas = document.querySelector('.monitor-frame canvas')
    return canvas && Number(canvas.getAttribute('width')) > 100
  })
  return canvas
}

try {
  const url = new URL(server.resolvedUrls.local[0]).origin
  browser = await chromium.launch()
  const releaseOnly = process.argv.includes('--v1-only')
  const cliOnly = process.argv.includes('--cli-only')
  const phase2Only = process.argv.includes('--phase2-only')
  const phase3Only = process.argv.includes('--phase3-only')
  const videoOnly = process.argv.includes('--video-workspace-only')
  const fullSuite = !releaseOnly && !cliOnly && !phase2Only && !phase3Only && !videoOnly
  if (videoOnly || fullSuite) await testVideoWorkspace(browser, url)
  if (fullSuite) {
    await testVideoModel(browser)
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
    const page = await context.newPage()
    page.setDefaultTimeout(9000)
    const errors = []
    const external = []
    context.on('request', request => {
      if (!request.url().startsWith(url)) external.push(request.url())
    })
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    page.on('response', response => { if (response.status() >= 400) errors.push(response.status() + ' ' + response.url()) })

    await page.goto(url)
    await page.getByRole('heading', { name: '项目工作台' }).waitFor()
    await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0))
    await noHorizontalOverflow(page)
    await page.screenshot({ path: 'docs/screenshots/01-projects.png', fullPage: true })
    await page.getByRole('link', { name: '打开工作台' }).click()
    await waitForCanvas(page, '2.39:1')
    await page.locator('.image-empty').waitFor({ state: 'hidden' })
    await noHorizontalOverflow(page)
    await page.screenshot({ path: 'docs/screenshots/02-editor.png', fullPage: true })
    await page.getByRole('button', { name: '三分线' }).click()
    assert.equal(await page.getByRole('button', { name: '三分线' }).getAttribute('aria-pressed'), 'false')
    await page.getByRole('button', { name: '下一镜头' }).click()
    await page.getByRole('button', { name: '镜头 02 穿过松林' }).waitFor()
    assert.equal(await page.getByRole('button', { name: '镜头 02 穿过松林' }).getAttribute('aria-pressed'), 'true')
    await page.getByRole('link', { name: '预演', exact: true }).click()
    await page.getByRole('heading', { name: '动态预演' }).waitFor()
    await page.getByRole('button', { name: '播放', exact: true }).click()
    await page.getByRole('button', { name: '暂停', exact: true }).waitFor()
    await page.getByRole('button', { name: '镜头 03 沿岸寻找' }).and(page.locator('[aria-pressed="true"]')).waitFor({ timeout: 7000 })
    await page.getByRole('button', { name: '暂停', exact: true }).click()
    console.log('PASS home, real images, Konva guides, and timed playback')

    await page.getByRole('link', { name: '项目', exact: true }).click()
    await page.getByRole('button', { name: '新建项目', exact: true }).click()
    await page.getByRole('dialog').waitFor()
    await page.getByRole('textbox', { name: '项目名称' }).fill('海边来信')
    await page.getByRole('radio', { name: '9:16' }).check()
    await page.getByRole('button', { name: '创建项目', exact: true }).click()
    await page.getByRole('heading', { name: '海边来信' }).waitFor()
    await waitForCanvas(page, '9:16')
    await page.getByRole('textbox', { name: '镜头名称' }).fill('海岸第一镜')
    await page.getByRole('textbox', { name: '镜头名称' }).press('Tab')
    await page.getByRole('button', { name: '镜头 01 海岸第一镜' }).waitFor()
    await page.getByRole('link', { name: '剧本', exact: true }).click()
    await page.getByRole('button', { name: '添加场景', exact: true }).click()
    const newScene = page.getByRole('button', { name: '02 未命名场景' })
    await newScene.waitFor()
    const sceneId = await newScene.getAttribute('data-scene-id')
    await page.locator('.scene-form[data-scene-id="' + sceneId + '"]').getByRole('textbox', { name: '地点' }).fill('岸边码头')
    await page.getByRole('button', { name: '02 岸边码头' }).waitFor()
    await page.reload()
    await page.getByRole('button', { name: '02 岸边码头' }).waitFor()
    await page.getByRole('link', { name: '镜头', exact: true }).click()
    await page.getByRole('link', { name: '海岸第一镜' }).waitFor()
    await page.getByRole('button', { name: '添加镜头', exact: true }).first().click()
    await page.getByRole('button', { name: '上移镜头 02' }).click()
    await page.getByRole('button', { name: '镜头 01 未命名镜头' }).waitFor()
    await page.getByRole('link', { name: '分镜', exact: true }).click()
    await page.getByRole('combobox', { name: '画幅' }).selectOption('16:9')
    await waitForCanvas(page, '16:9')
    await page.reload()
    assert.equal(await page.getByRole('combobox', { name: '画幅' }).inputValue(), '16:9')
    console.log('PASS project creation, scene edit, shot edit, ordering, ratio, and reload')

    await page.getByRole('button', { name: '项目操作' }).click()
    await page.getByRole('button', { name: '重命名' }).click()
    await page.getByRole('textbox', { name: '项目名称' }).fill('海边来信 修订版')
    await page.getByRole('button', { name: '保存名称' }).click()
    await page.getByRole('heading', { name: '海边来信 修订版' }).waitFor()
    await page.getByRole('button', { name: '项目操作' }).click()
    await page.getByRole('button', { name: '复制项目' }).click()
    await page.getByRole('heading', { name: '海边来信 修订版 副本' }).waitFor()
    await page.getByRole('button', { name: '项目操作' }).click()
    await page.getByRole('button', { name: '归档项目', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('.back-link')?.getAttribute('href') === '#/archive')
    await page.getByRole('link', { name: '项目', exact: true }).click()
    await page.getByRole('heading', { name: '归档项目' }).waitFor()
    await page.getByRole('link', { name: '打开项目 海边来信 修订版 副本' }).click()
    await page.getByRole('button', { name: '项目操作' }).click()
    await page.getByRole('button', { name: '删除项目', exact: true }).click()
    await page.getByRole('button', { name: '确认删除' }).click()
    await page.getByRole('heading', { name: '暂无归档项目' }).waitFor()
    await page.getByRole('link', { name: '项目', exact: true }).click()
    await page.getByRole('link', { name: '打开项目 海边来信 修订版' }).waitFor()
    console.log('PASS rename, duplicate, archive, confirmed delete, and project isolation')

    await page.locator('.toast').waitFor({ state: 'hidden' })
    for (const width of [1366, 1920, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
      await noHorizontalOverflow(page)
      await page.getByRole('link', { name: '打开工作台' }).click()
      await waitForCanvas(page, '2.39:1')
      await noHorizontalOverflow(page)
      if (width === 390) {
        await page.locator('.image-empty').waitFor({ state: 'hidden' })
        await page.screenshot({ path: 'docs/screenshots/03-editor-mobile.png', fullPage: true })
      }
      await page.getByRole('link', { name: '项目', exact: true }).click()
      await page.getByRole('heading', { name: '项目工作台' }).waitFor()
  }
    assert.deepEqual(errors, [], 'Browser must report no errors')
    assert.deepEqual(external, [], 'The app must not make external requests')
    console.log('PASS 1366, 1440, 1920, and 390 px layout; no console errors or external requests')
  }
  if (!videoOnly && !releaseOnly && !cliOnly && !phase3Only) await testPhaseTwo(browser, url)
  if (!videoOnly && !releaseOnly && !phase2Only) await testPhaseThree(browser, url)
  if (!videoOnly && !cliOnly && !phase2Only && !phase3Only) await testV1(browser, url)
  if (!videoOnly && !releaseOnly && !phase2Only && !phase3Only) await testCLI(browser, url)
} finally {
  try {
    await browser?.close()
  } finally {
    await server.close()
  }
}







