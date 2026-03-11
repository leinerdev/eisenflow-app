export type QuadrantKey = 'do' | 'schedule' | 'delegate' | 'eliminate'
export type StatusKey = 'pending' | 'inProgress' | 'done'

export type TaskInput = {
  title: string
  notes: string
  quadrant: QuadrantKey
  status: StatusKey
}

export type Task = TaskInput & {
  id: string
  position: number
  createdAt: string
  updatedAt: string
}

export type TaskPatch = Partial<TaskInput> & {
  position?: number
}

export type TaskReorderItem = {
  id: string
  quadrant: QuadrantKey
  position: number
}

export const quadrantOrder: QuadrantKey[] = ['do', 'schedule', 'delegate', 'eliminate']
export const statusOrder: StatusKey[] = ['pending', 'inProgress', 'done']

export const quadrantConfig: Record<
  QuadrantKey,
  {
    title: string
    subtitle: string
    description: string
    accent: string
  }
> = {
  do: {
    title: 'Hacer ahora',
    subtitle: 'Urgente e importante',
    description: 'Lo que merece accion inmediata y foco total.',
    accent: '#ff6b6b',
  },
  schedule: {
    title: 'Planificar',
    subtitle: 'Importante, no urgente',
    description: 'Trabajo estrategico para reservar con calma.',
    accent: '#6c63ff',
  },
  delegate: {
    title: 'Delegar',
    subtitle: 'Urgente, no importante',
    description: 'Elementos operativos que puedes mover o repartir.',
    accent: '#22c55e',
  },
  eliminate: {
    title: 'Eliminar',
    subtitle: 'Ni urgente ni importante',
    description: 'Ruido, distracciones o tareas que conviene soltar.',
    accent: '#f59e0b',
  },
}

export const statusConfig: Record<
  StatusKey,
  {
    label: string
    tone: string
  }
> = {
  pending: {
    label: 'Por hacer',
    tone: '#64748b',
  },
  inProgress: {
    label: 'En foco',
    tone: '#2563eb',
  },
  done: {
    label: 'Hecha',
    tone: '#16a34a',
  },
}

const starterTaskInputs: TaskInput[] = [
  {
    title: 'Preparar demo semanal',
    notes: 'Resume avances, riesgos y siguiente paso en una historia corta.',
    quadrant: 'do',
    status: 'inProgress',
  },
  {
    title: 'Definir objetivos del trimestre',
    notes: 'Reserva una sesion larga y convierte metas en resultados medibles.',
    quadrant: 'schedule',
    status: 'pending',
  },
  {
    title: 'Reasignar correos operativos',
    notes: 'Agrupa respuestas repetitivas y envia lo delegable de una vez.',
    quadrant: 'delegate',
    status: 'pending',
  },
  {
    title: 'Cancelar reunion sin agenda',
    notes: 'Libera tiempo de trabajo profundo para el resto de la semana.',
    quadrant: 'eliminate',
    status: 'done',
  },
]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export function createStarterTaskInputs(): TaskInput[] {
  return starterTaskInputs.map((task) => ({ ...task }))
}

export function isQuadrantKey(value: string): value is QuadrantKey {
  return quadrantOrder.includes(value as QuadrantKey)
}

export function isStatusKey(value: string): value is StatusKey {
  return statusOrder.includes(value as StatusKey)
}

export function parseTaskInput(value: unknown): TaskInput | null {
  if (!isRecord(value)) {
    return null
  }

  const { title, notes, quadrant, status } = value
  if (
    typeof title !== 'string' ||
    typeof notes !== 'string' ||
    typeof quadrant !== 'string' ||
    typeof status !== 'string'
  ) {
    return null
  }

  const normalizedTitle = title.trim()
  if (!normalizedTitle || !isQuadrantKey(quadrant) || !isStatusKey(status)) {
    return null
  }

  return {
    title: normalizedTitle,
    notes: notes.trim(),
    quadrant,
    status,
  }
}

export function parseTaskPatch(value: unknown): TaskPatch | null {
  if (!isRecord(value)) {
    return null
  }

  const patch: TaskPatch = {}

  if ('title' in value) {
    if (typeof value.title !== 'string' || !value.title.trim()) {
      return null
    }
    patch.title = value.title.trim()
  }

  if ('notes' in value) {
    if (typeof value.notes !== 'string') {
      return null
    }
    patch.notes = value.notes.trim()
  }

  if ('quadrant' in value) {
    if (typeof value.quadrant !== 'string' || !isQuadrantKey(value.quadrant)) {
      return null
    }
    patch.quadrant = value.quadrant
  }

  if ('status' in value) {
    if (typeof value.status !== 'string' || !isStatusKey(value.status)) {
      return null
    }
    patch.status = value.status
  }

  if ('position' in value) {
    if (typeof value.position !== 'number' || !Number.isFinite(value.position) || value.position < 0) {
      return null
    }
    patch.position = Math.trunc(value.position)
  }

  return Object.keys(patch).length > 0 ? patch : null
}

export function parseTaskReorderItems(value: unknown): TaskReorderItem[] | null {
  if (!Array.isArray(value)) {
    return null
  }

  const items = value.flatMap((item) => {
    if (!isRecord(item)) {
      return []
    }

    const { id, quadrant, position } = item
    if (
      typeof id !== 'string' ||
      typeof quadrant !== 'string' ||
      typeof position !== 'number' ||
      !isQuadrantKey(quadrant) ||
      !Number.isFinite(position) ||
      position < 0
    ) {
      return []
    }

    return [
      {
        id,
        quadrant,
        position: Math.trunc(position),
      },
    ]
  })

  return items.length === value.length ? items : null
}

export function normalizeTaskOrder(tasks: Task[]): Task[] {
  return [...tasks].sort((left, right) => {
    if (left.position !== right.position) {
      return left.position - right.position
    }

    return right.updatedAt.localeCompare(left.updatedAt)
  })
}

export function withSequentialPositions(tasks: Task[]): Task[] {
  return tasks.map((task, index) => ({
    ...task,
    position: index,
  }))
}
