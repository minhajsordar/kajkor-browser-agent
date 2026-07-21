import { autoUpdater, UpdateInfo } from 'electron-updater'
import { BrowserWindow } from 'electron'
import { createLogger } from './utils/logger'

const log = createLogger('AutoUpdater')
const UPDATE_CHECK_INTERVAL = 4 * 60 * 60 * 1000 // 4 hours

let updateCheckTimer: ReturnType<typeof setInterval> | null = null

export function setupAutoUpdater(mainWindow: BrowserWindow): void {
  // Configure auto-updater
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  // ── Event Handlers ──

  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for updates...')
    mainWindow.webContents.send('updater:checking')
  })

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    log.info('Update available', { version: info.version })
    mainWindow.webContents.send('updater:available', {
      version: info.version,
      releaseDate: info.releaseDate
    })
  })

  autoUpdater.on('update-not-available', () => {
    log.info('No updates available')
    mainWindow.webContents.send('updater:not-available')
  })

  autoUpdater.on('download-progress', (progress) => {
    log.debug('Download progress', { percent: Math.round(progress.percent) })
    mainWindow.webContents.send('updater:progress', {
      percent: Math.round(progress.percent),
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total
    })
  })

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    log.info('Update downloaded', { version: info.version })
    mainWindow.webContents.send('updater:downloaded', {
      version: info.version,
      releaseDate: info.releaseDate
    })
  })

  autoUpdater.on('error', (error) => {
    log.error('Auto-updater error', { message: error.message })
    mainWindow.webContents.send('updater:error', {
      error: error.message
    })
  })

  // ── IPC Handlers ──

  const { ipcMain } = require('electron')

  ipcMain.handle('updater:check', async () => {
    try {
      const result = await autoUpdater.checkForUpdates()
      return { success: true, data: result?.updateInfo }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      return { success: false, error: msg }
    }
  })

  ipcMain.handle('updater:install', () => {
    log.info('User requested quit and install')
    autoUpdater.quitAndInstall(false, true)
  })

  // ── Initial check + periodic ──

  // Check after a short delay to avoid blocking startup
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      log.warn('Initial update check failed', { error: err.message })
    })
  }, 10_000) // 10 seconds after startup

  // Periodic check
  updateCheckTimer = setInterval(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      log.warn('Periodic update check failed', { error: err.message })
    })
  }, UPDATE_CHECK_INTERVAL)

  log.info('Auto-updater initialized')
}

export function stopAutoUpdater(): void {
  if (updateCheckTimer) {
    clearInterval(updateCheckTimer)
    updateCheckTimer = null
  }
}
