import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createSessionCookie, isPasswordValid } from '../_lib/auth'
import { methodNotAllowed, readJsonBody, sendError, sendJson } from '../_lib/http'

type LoginBody = {
  password?: string
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST'])
  }

  try {
    const body = readJsonBody<LoginBody>(req)
    if (typeof body.password !== 'string' || !body.password.trim()) {
      return sendError(res, 400, 'Introduce la password privada de Eisenflow.')
    }

    if (!isPasswordValid(body.password.trim())) {
      return sendError(res, 401, 'La password no es valida.')
    }

    res.setHeader('Set-Cookie', createSessionCookie())
    return sendJson(res, 200, { authenticated: true })
  } catch (error) {
    console.error(error)
    return sendError(res, 500, 'No pude iniciar sesion.')
  }
}
