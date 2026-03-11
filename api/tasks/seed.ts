import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isAuthenticated } from '../_lib/auth'
import { methodNotAllowed, sendError, sendJson } from '../_lib/http'
import { seedStarterTasks } from '../_lib/tasks'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isAuthenticated(req)) {
    return sendError(res, 401, 'Necesitas iniciar sesion para usar Eisenflow.')
  }

  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST'])
  }

  try {
    const insertedCount = await seedStarterTasks()
    return sendJson(res, 201, { insertedCount })
  } catch (error) {
    console.error(error)
    return sendError(res, 500, 'No pude cargar las tareas de ejemplo.')
  }
}
