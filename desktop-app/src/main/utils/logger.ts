import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, appendFileSync, readdirSync, unlinkSync, statSync } from 'fs'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
}

const MAX_LOG_FILES = 5
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

let logDir = ''
let currentLogFile = ''
let minLevel: LogLevel = 'info'

function getLogDir(): string {
  if (!logDir) {
    try {
      logDir = join(app.getPath('userData'), 'logs')
    } catch {
      // app not ready yet (during early init)
      logDir = join(process.cwd(), 'logs')
    }
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true })
    }
  }
  return logDir
}

function getLogFile(): string {
  if (!currentLogFile) {
    const date = new Date().toISOString().split('T')[0]
    currentLogFile = join(getLogDir(), `app-${date}.log`)
  }
  return currentLogFile
}

function rotateLogsIfNeeded(): void {
  try {
    const dir = getLogDir()
    const files = readdirSync(dir)
      .filter((f) => f.startsWith('app-') && f.endsWith('.log'))
      .map((f) => ({
        name: f,
        path: join(dir, f),
        mtime: statSync(join(dir, f)).mtime.getTime()
      }))
      .sort((a, b) => b.mtime - a.mtime)

    // Remove old files beyond MAX_LOG_FILES
    if (files.length > MAX_LOG_FILES) {
      for (const file of files.slice(MAX_LOG_FILES)) {
        try {
          unlinkSync(file.path)
        } catch {
          // ignore
        }
      }
    }

    // Rotate current file if too large
    const logFile = getLogFile()
    if (existsSync(logFile)) {
      const stats = statSync(logFile)
      if (stats.size > MAX_FILE_SIZE) {
        const ts = Date.now()
        const rotated = logFile.replace('.log', `-${ts}.log`)
        try {
          const { renameSync } = require('fs')
          renameSync(logFile, rotated)
        } catch {
          // ignore
        }
        currentLogFile = ''
      }
    }
  } catch {
    // logging should never crash the app
  }
}

function formatMessage(level: LogLevel, context: string, message: string, data?: unknown): string {
  const timestamp = new Date().toISOString()
  const prefix = `[${timestamp}] [${level.toUpperCase()}] [${context}]`
  let line = `${prefix} ${message}`
  if (data !== undefined) {
    try {
      line += ` ${JSON.stringify(data)}`
    } catch {
      line += ` [unserializable data]`
    }
  }
  return line
}

function writeLog(level: LogLevel, context: string, message: string, data?: unknown): void {
  if (LOG_LEVELS[level] < LOG_LEVELS[minLevel]) return

  const line = formatMessage(level, context, message, data)

  // Always write to console
  switch (level) {
    case 'error':
      console.error(line)
      break
    case 'warn':
      console.warn(line)
      break
    default:
      console.log(line)
  }

  // Write to file
  try {
    appendFileSync(getLogFile(), line + '\n')
  } catch {
    // silently fail
  }
}

/**
 * Create a scoped logger for a specific module/context.
 *
 * Usage:
 *   const log = createLogger('SyncEngine')
 *   log.info('Sync started')
 *   log.error('Failed to push', { table: 'products', error: err.message })
 */
export function createLogger(context: string) {
  return {
    debug: (message: string, data?: unknown) => writeLog('debug', context, message, data),
    info: (message: string, data?: unknown) => writeLog('info', context, message, data),
    warn: (message: string, data?: unknown) => writeLog('warn', context, message, data),
    error: (message: string, data?: unknown) => writeLog('error', context, message, data)
  }
}

/**
 * Set the minimum log level. Default is 'info'.
 */
export function setLogLevel(level: LogLevel): void {
  minLevel = level
}

/**
 * Initialize the logger — call once at app startup.
 * Performs initial log rotation.
 */
export function initLogger(): void {
  rotateLogsIfNeeded()
  const log = createLogger('Logger')
  log.info('Logger initialized', { logDir: getLogDir(), level: minLevel })
}

/**
 * Get the log directory path (for display in settings UI).
 */
export function getLogPath(): string {
  return getLogDir()
}
