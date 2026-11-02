import { waitForLong } from './browser-wait.js'
import { activatePage } from './browser.js'

import type { Page } from 'playwright'

export interface DragVerificationOptions {
  page: Page
  /** 当前正在验证的引擎名，用于嵌套验证时排除 */
  engineName: string
  /** 弹窗层元素选择器 */
  dialogSelector: string
  /** 提示文案元素选择器 */
  promptSelector: string
  /** 拖拽元素选择器 */
  dragSelector: string
  /** 图片选择器 */
  imageSelector: string
  /** 被放置元素选择器 */
  dropSelector: string
  /** 确认按钮选择器 */
  confirmSelector: string
  /** 验证失败元素选择器 */
  failureSelector: string
  /** 验证成功元素选择器 */
  successSelector: string
  /** 重试按钮选择器 */
  retrySelector: string
  /** 取消验证监听；正常回答先完成时会触发 */
  signal?: AbortSignal
  /** 验证开始时申请独占 hold；返回释放函数 */
  acquireHold?: () => Promise<() => void>
}

/** 验证已通过：当前任务应直接结束，等待下一轮角色任务 */
export class VerificationPassedError extends Error {
  constructor(message = '拖拽验证已通过，跳过当前任务') {
    super(message)
    this.name = 'VerificationPassedError'
  }
}

const MAX_ATTEMPTS = 3
const activeVerificationEngines = new Set<string>()

function abortReason(): Error {
  const error = new Error('拖拽验证监听已取消')
  error.name = 'AbortError'
  return error
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortReason()
}

/** 给不支持 AbortSignal 的 Playwright 等待包一层取消 */
function waitWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(abortReason())

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortReason())
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
  })
}

function parseIndexes(answer: string, max: number): number[] {
  const match = answer.match(/\[[\s\S]*?\]/)
  if (!match) {
    throw new Error(`验证 AI 未返回图片序号数组: ${answer.slice(0, 200)}`)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(match[0])
  } catch {
    throw new Error(`验证 AI 返回的图片序号数组不是合法 JSON: ${match[0]}`)
  }

  if (!Array.isArray(parsed)) {
    throw new Error('验证 AI 返回的图片序号不是数组')
  }

  const indexes = Array.from(
    new Set(
      parsed.filter(
        (item): item is number =>
          typeof item === 'number' && Number.isInteger(item) && item >= 1 && item <= max,
      ),
    ),
  )

  if (indexes.length === 0) {
    throw new Error(`验证 AI 没有返回有效图片序号: ${answer.slice(0, 200)}`)
  }
  return indexes
}

async function captureImages(page: Page, selector: string): Promise<File[]> {
  const images = await page.locator(selector).all()
  if (images.length === 0) throw new Error('验证图片列表为空')

  const files: File[] = []
  for (let i = 0; i < images.length; i++) {
    const image = images[i]

    // canvas 可能在异步绘制后才可见，截图前先确保已渲染
    await image.scrollIntoViewIfNeeded()
    await image.waitFor({ state: 'visible' })

    const box = await image.boundingBox()
    if (!box || box.width <= 0 || box.height <= 0) {
      throw new Error(`第 ${i + 1} 张验证图片尺寸为空`)
    }

    const buffer = await image.screenshot()
    files.push(new File([new Uint8Array(buffer)], `图片${i + 1}.png`, { type: 'image/png' }))
  }
  return files
}

function buildPrompt(prompt: string, imageCount: number): string {
  const names = Array.from({ length: imageCount }, (_, i) => `图片${i + 1}.png`).join('、')
  return [
    prompt,
    '',
    `图片已按顺序作为附件上传：${names}。`,
    '请判断所有符合要求的图片，只返回 JSON 数组形式的图片序号，例如 [1,3]。',
    '不要输出解释、Markdown 或任何其他内容。',
  ].join('\n')
}

/**
 * 处理网页拖拽防人机验证。
 * 验证成功时抛出 VerificationPassedError，让当前角色任务结束。
 */
export async function handleDragVerification(opts: DragVerificationOptions): Promise<void> {
  // 选择器尚未配置时保持空等待，不影响正常回答流程
  if (!opts.dialogSelector) {
    return new Promise<void>(() => undefined)
  }

  if (
    !opts.promptSelector ||
    !opts.dragSelector ||
    !opts.imageSelector ||
    !opts.dropSelector ||
    !opts.confirmSelector ||
    !opts.failureSelector ||
    !opts.successSelector ||
    !opts.retrySelector
  ) {
    throw new Error('拖拽验证选择器配置不完整')
  }

  if (!opts.engineName) {
    throw new Error('拖拽验证缺少 engineName')
  }

  const dialog = opts.page.locator(opts.dialogSelector).first()
  await waitWithAbort(
    waitForLong(dialog, { state: 'visible', label: 'drag-verification.dialog' }),
    opts.signal,
  )
  throwIfAborted(opts.signal)

  // 先登记当前引擎，后续嵌套验证必须同时排除所有验证中引擎
  activeVerificationEngines.add(opts.engineName)

  let ai: import('../ai/types.js').Ai | null = null
  let releaseHold: (() => void) | undefined

  try {
    releaseHold = await opts.acquireHold?.()
    throwIfAborted(opts.signal)

    const [{ pickEngine }, { AiPageAdapter }] = await Promise.all([
      import('../ai/helper.js'),
      import('../ai/adapter.js'),
    ])

    const initialImages = await captureImages(opts.page, opts.imageSelector)

    const engine = await pickEngine({
      capability: 'text',
      attachments: initialImages.map((file) => file.name),
      exclude: [...activeVerificationEngines],
    })
    if (!engine) {
      throw new Error('拖拽验证没有可用的生文引擎')
    }

    ai = new AiPageAdapter(engine)

    const dropTarget = opts.page.locator(opts.dropSelector).first()
    const confirm = opts.page.locator(opts.confirmSelector).first()
    const success = opts.page.locator(opts.successSelector).first()
    const failure = opts.page.locator(opts.failureSelector).first()
    const retry = opts.page.locator(opts.retrySelector).first()

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      await activatePage(opts.page)

      const prompt = await opts.page.locator(opts.promptSelector).first().innerText()
      const imageFiles = await captureImages(opts.page, opts.imageSelector)
      const dragElements = await opts.page.locator(opts.dragSelector).all()
      if (dragElements.length !== imageFiles.length) {
        throw new Error(
          `拖拽元素数量(${dragElements.length})与图片数量(${imageFiles.length})不一致`,
        )
      }

      const answer = await waitWithAbort(
        ai.text2text({
          prompt: buildPrompt(prompt, imageFiles.length),
          attaches: imageFiles,
        }),
        opts.signal,
      )
      throwIfAborted(opts.signal)

      const indexes = parseIndexes(answer, imageFiles.length)

      await activatePage(opts.page)
      for (const index of indexes) {
        if (await success.isVisible().catch(() => false)) break
        if (await failure.isVisible().catch(() => false)) break
        await dragElements[index - 1].dragTo(dropTarget)
      }

      if (await confirm.isVisible().catch(() => false)) {
        await confirm.click()
      }

      const outcome = await waitWithAbort(
        Promise.race([
          waitForLong(success, {
            state: 'visible',
            label: 'drag-verification.success',
          }).then(() => 'success' as const),
          waitForLong(failure, {
            state: 'visible',
            label: 'drag-verification.failure',
          }).then(() => 'failure' as const),
        ]),
        opts.signal,
      )

      if (outcome === 'success') {
        throw new VerificationPassedError()
      }

      if (attempt === MAX_ATTEMPTS) {
        throw new Error(`拖拽验证连续失败 ${MAX_ATTEMPTS} 次`)
      }

      await activatePage(opts.page)
      await retry.click()
      await opts.page.waitForTimeout(500)
    }
  } finally {
    try {
      await ai?.release()
    } catch (error) {
      console.error(
        `[drag-verification] 释放验证引擎失败: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    } finally {
      activeVerificationEngines.delete(opts.engineName)
      releaseHold?.()
    }
  }
}
