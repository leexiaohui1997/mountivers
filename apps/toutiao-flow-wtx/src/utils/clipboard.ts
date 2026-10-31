/**
 * 复制文本。
 *
 * iPhone Safari 对 navigator.clipboard 的限制比较严格：
 * - 必须是安全上下文；
 * - 必须在用户手势中同步触发；
 * - 部分版本/内嵌浏览器会直接拒绝 Clipboard API。
 *
 * 因此 iOS 优先使用同步的 execCommand 兜底，其他平台优先 Clipboard API。
 */
export async function copyText(text: string): Promise<boolean> {
  if (isIOS()) {
    const legacyResult = legacyCopy(text)
    if (legacyResult) return true
  }

  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Safari / 内嵌浏览器可能拒绝，继续走 execCommand
    }
  }

  return legacyCopy(text)
}

function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
}

/** iOS Safari 兼容的同步复制方案 */
function legacyCopy(text: string): boolean {
  const textarea = document.createElement('textarea')
  textarea.value = text
  // iOS Safari 对 readonly textarea 的 select() 兼容性不稳定
  textarea.contentEditable = 'true'
  textarea.readOnly = false
  textarea.style.position = 'fixed'
  textarea.style.top = '0'
  textarea.style.left = '0'
  textarea.style.width = '1px'
  textarea.style.height = '1px'
  textarea.style.padding = '0'
  textarea.style.border = 'none'
  textarea.style.outline = 'none'
  textarea.style.boxShadow = 'none'
  textarea.style.background = 'transparent'
  textarea.style.fontSize = '16px'

  const activeElement = document.activeElement as HTMLElement | null
  const selection = document.getSelection()
  const ranges: Range[] = []

  if (selection) {
    for (let i = 0; i < selection.rangeCount; i++) {
      ranges.push(selection.getRangeAt(i))
    }
  }

  document.body.appendChild(textarea)

  let copied = false
  try {
    textarea.focus({ preventScroll: true })
    textarea.select()
    textarea.setSelectionRange(0, textarea.value.length)
    copied = document.execCommand('copy')
  } catch {
    copied = false
  } finally {
    document.body.removeChild(textarea)
    activeElement?.focus?.({ preventScroll: true })

    if (selection) {
      selection.removeAllRanges()
      for (const range of ranges) selection.addRange(range)
    }
  }

  return copied
}
