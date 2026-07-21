import { app } from 'electron'
import { is } from '@electron-toolkit/utils'
import path from 'path'
import fs from 'fs'

// The Browser Agent backend is a CommonJS Express app (backend/server.js in the
// repo). In DEV we require the source directly (it needs no build step); in a
// packaged build we require the esbuild-bundled copy shipped under resources/.
export function serverBundlePath(): string {
  if (is.dev) {
    return path.resolve(app.getAppPath(), '..', 'backend', 'server.js')
  }
  return path.join(process.resourcesPath, 'server', 'server.cjs')
}

export function userDataDir(sub?: string): string {
  const root = app.getPath('userData')
  const p = sub ? path.join(root, sub) : root
  fs.mkdirSync(p, { recursive: true })
  return p
}
