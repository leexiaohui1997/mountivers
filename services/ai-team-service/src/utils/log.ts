export const log = console.log
export const info = console.info
export const warn = console.warn
export const error = console.error
export const debug = console.debug

export const successLog = console.log.bind(console, '✅')
export const errorLog = console.error.bind(console, '❌')
export const warnLog = console.warn.bind(console, '⚠️')
export const infoLog = console.info.bind(console, 'ℹ️ ')
