import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isAuthenticated } from '../_lib/auth.ts'
import { methodNotAllowed, readJsonBody, sendError, sendJson } from '../_lib/http.ts'
import { createTask, deleteCompletedTasks, listTasks } from '../_lib/tasks.ts'
import { parseTaskInput } from '../../shared/eisenflow.ts'

function readStatusQuery(req: VercelRequest): string | null {
  const rawStatus = req.query.status
  if (Array.isArray(rawStatus)) {
    return rawStatus[0] ?? null
  }
  return rawStatus ?? null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isAuthenticated(req)) {
    return sendError(res, 401, 'Necesitas iniciar sesion para usar Eisenflow.')
  }

  try {
    if (req.method === 'GET') {
      return sendJson(res, 200, { tasks: await listTasks() })
    }

    if (req.method === 'POST') {
      const input = parseTaskInput(readJsonBody<unknown>(req))
      if (!input) {
        return sendError(res, 400, 'La tarea no tiene un formato valido.')
      }

      return sendJson(res, 201, { task: await createTask(input) })
    }

    if (req.method === 'DELETE') {
      if (readStatusQuery(req) !== 'done') {
        return sendError(res, 400, 'Solo se admite borrar tareas con status=done.')
      }

      await deleteCompletedTasks()
      return res.status(204).end()
    }

    return methodNotAllowed(res, ['GET', 'POST', 'DELETE'])
  } catch (error) {
    console.error(error)
    return sendError(res, 500, 'No pude completar la operacion con tareas.')
  }
}
