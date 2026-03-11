import type { VercelRequest, VercelResponse } from '@vercel/node'

export function sendJson<T>(res: VercelResponse, status: number, payload: T) {
  res.setHeader('Cache-Control', 'no-store')
  return res.status(status).json(payload)
}

export function sendError(res: VercelResponse, status: number, message: string) {
  return sendJson(res, status, { message })
}

export function methodNotAllowed(res: VercelResponse, allowed: string[]) {
  res.setHeader('Allow', allowed.join(', '))
  return sendError(res, 405, `Metodo no permitido. Usa ${allowed.join(', ')}.`)
}

export function readJsonBody<T>(req: VercelRequest): T {
  if (typeof req.body === 'string') {
    return JSON.parse(req.body) as T
  }

  return (req.body ?? {}) as T
}
