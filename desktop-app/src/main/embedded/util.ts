import { createServer } from 'net'

export function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer()
    s.unref()
    s.on('error', reject)
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      s.close(() => resolve(port))
    })
  })
}

// True if nothing is listening on the given TCP port (127.0.0.1).
export function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = createServer()
    s.unref()
    s.once('error', () => resolve(false))
    s.listen(port, '127.0.0.1', () => {
      s.close(() => resolve(true))
    })
  })
}

export function waitForPort(
  port: number,
  host = '127.0.0.1',
  timeoutMs = 30000
): Promise<void> {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const tick = (): void => {
      const sock = require('net').connect({ port, host })
      sock.once('connect', () => {
        sock.end()
        resolve()
      })
      sock.once('error', () => {
        sock.destroy()
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Port ${host}:${port} not open after ${timeoutMs}ms`))
        } else {
          setTimeout(tick, 200)
        }
      })
    }
    tick()
  })
}

export async function waitForHttp(
  url: string,
  timeoutMs = 30000
): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url)
      if (r.ok) return
    } catch {
      // not ready
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`HTTP ${url} not ready after ${timeoutMs}ms`)
}
