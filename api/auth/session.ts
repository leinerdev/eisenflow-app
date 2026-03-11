import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isAuthenticated } from '../_lib/auth'
import { methodNotAllowed, sendError, sendJson } from '../_lib/http'

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET'])
  }

  try {
    return sendJson(res, 200, { authenticated: isAuthenticated(req) })
  } catch (error) {
    console.error(error)
    return sendError(res, 500, 'No pude validar la sesion.')
  }
}
