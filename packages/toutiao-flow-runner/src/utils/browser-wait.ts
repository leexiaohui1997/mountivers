import { errors, type Locator } from 'playwright'

/** 浏览器长等待的最长时间：10 分钟 */
export const BROWSER_WAIT_TIMEOUT_MS = 10 * 60 * 1000

export type BrowserWaitState = 'attached' | 'detached' | 'visible' | 'hidden'

export class BrowserWaitTimeoutError extends Error {
  constructor(
    public readonly label: string,
    public readonly timeoutMs: number,
    public readonly state: BrowserWaitState,
  ) {
    super(`浏览器等待超时（${label}, state=${state}, timeout=${timeoutMs}ms）`)
    this.name = 'BrowserWaitTimeoutError'
  }
}

/** 带最大等待时间的 locator.waitFor；超时抛出 BrowserWaitTimeoutError */
export async function waitForLong(
  locator: Locator,
  options: { state?: BrowserWaitState; label: string },
): Promise<void> {
  const state = options.state ?? 'visible'

  try {
    await locator.waitFor({ state, timeout: BROWSER_WAIT_TIMEOUT_MS })
  } catch (error) {
    if (error instanceof errors.TimeoutError) {
      throw new BrowserWaitTimeoutError(options.label, BROWSER_WAIT_TIMEOUT_MS, state)
    }
    throw error
  }
}
