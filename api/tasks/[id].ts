import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isAuthenticated } from '../_lib/auth'
import { methodNotAllowed, readJsonBody, sendError, sendJson } from '../_lib/http'
import { deleteTask, updateTask } from '../_lib/tasks'
import { parseTaskPatch } from '../../shared/eisenflow'

function readTaskId(req: VercelRequest): string | null {
  const rawId = req.query.id
  if (Array.isArray(rawId)) {
    return rawId[0] ?? null
  }
  return rawId ?? null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isAuthenticated(req)) {
    return sendError(res, 401, 'Necesitas iniciar sesion para usar Eisenflow.')
  }

  const taskId = readTaskId(req)
  if (!taskId) {
    return sendError(res, 400, 'Falta el identificador de la tarea.')
  }

  try {
    if (req.method === 'PATCH') {
      const patch = parseTaskPatch(readJsonBody<unknown>(req))
      if (!patch) {
        return sendError(res, 400, 'Los cambios enviados no son validos.')
      }

      const task = await updateTask(taskId, patch)
      if (!task) {
        return sendError(res, 404, 'No encontre la tarea que quieres editar.')
      }

      return sendJson(res, 200, { task })
    }

    if (req.method === 'DELETE') {
      const deleted = await deleteTask(taskId)
      if (!deleted) {
        return sendError(res, 404, 'No encontre la tarea que quieres borrar.')
      }

      return res.status(204).end()
    }

    return methodNotAllowed(res, ['PATCH', 'DELETE'])
  } catch (error) {
    console.error(error)
    return sendError(res, 500, 'No pude actualizar la tarea.')
  }
}
