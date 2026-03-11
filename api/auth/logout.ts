import type { VercelRequest, VercelResponse } from '@vercel/node'
import { clearSessionCookie } from '../_lib/auth.js'
import { methodNotAllowed, sendError, sendJson } from '../_lib/http.js'

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST'])
  }

  try {
    res.setHeader('Set-Cookie', clearSessionCookie())
    return sendJson(res, 200, { authenticated: false })
  } catch (error) {
    console.error(error)
    return sendError(res, 500, 'No pude cerrar sesion.')
  }
}
