import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isAuthenticated } from '../_lib/auth'
import { methodNotAllowed, readJsonBody, sendError, sendJson } from '../_lib/http'
import { reorderTasks } from '../_lib/tasks'
import { parseTaskReorderItems } from '../../shared/eisenflow'

type ReorderBody = {
  items?: unknown
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isAuthenticated(req)) {
    return sendError(res, 401, 'Necesitas iniciar sesion para usar Eisenflow.')
  }

  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST'])
  }

  try {
    const body = readJsonBody<ReorderBody>(req)
    const items = parseTaskReorderItems(body.items)
    if (!items) {
      return sendError(res, 400, 'El nuevo orden de tareas no es valido.')
    }

    return sendJson(res, 200, { tasks: await reorderTasks(items) })
  } catch (error) {
    console.error(error)
    return sendError(res, 500, 'No pude guardar el nuevo orden.')
  }
}
