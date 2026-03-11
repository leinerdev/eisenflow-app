import {
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react'
import {
  normalizeTaskOrder,
  quadrantConfig,
  quadrantOrder,
  statusConfig,
  statusOrder,
  type QuadrantKey,
  type StatusKey,
  type Task,
  type TaskInput,
  type TaskPatch,
  withSequentialPositions,
} from '../shared/eisenflow.js'
import {
  ApiRequestError,
  clearCompletedTasks,
  createTask,
  deleteTask,
  fetchSession,
  fetchTasks,
  login,
  logout,
  reorderTasks,
  seedStarterTasks,
  updateTask,
} from './lib/api.js'
import './App.css'

type TaskDraft = TaskInput

type SessionState = 'checking' | 'anonymous' | 'authenticated'

const defaultDraft: TaskDraft = {
  title: '',
  notes: '',
  quadrant: 'do',
  status: 'pending',
}

const QUADRANT_DROP_PREFIX = 'quadrant:'

function App() {
  const [sessionState, setSessionState] = useState<SessionState>('checking')
  const [backendReady, setBackendReady] = useState(true)
  const [tasks, setTasks] = useState<Task[]>([])
  const [draft, setDraft] = useState<TaskDraft>(defaultDraft)
  const [editDraft, setEditDraft] = useState<TaskDraft>(defaultDraft)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [quadrantFilter, setQuadrantFilter] = useState<'all' | QuadrantKey>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | StatusKey>('all')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [taskError, setTaskError] = useState<string | null>(null)
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [isLoadingTasks, setIsLoadingTasks] = useState(false)
  const [isMutating, setIsMutating] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  useEffect(() => {
    document.title = 'Eisenflow'
  }, [])

  useEffect(() => {
    let isMounted = true

    void (async () => {
      setAuthError(null)

      try {
        const session = await fetchSession()
        if (!isMounted) {
          return
        }

        setBackendReady(true)
        if (!session.authenticated) {
          setSessionState('anonymous')
          return
        }

        setSessionState('authenticated')
        setIsLoadingTasks(true)

        try {
          const nextTasks = normalizeTaskOrder(await fetchTasks())
          if (!isMounted) {
            return
          }

          setTasks(nextTasks)
          setTaskError(null)
          setLastSyncedAt(new Date().toISOString())
        } catch (error) {
          if (!isMounted) {
            return
          }

          if (error instanceof ApiRequestError && error.status === 401) {
            setSessionState('anonymous')
            setTasks([])
            setEditingTaskId(null)
            setAuthError('Tu sesion expiro. Inicia sesion otra vez para seguir.')
          } else if (error instanceof ApiRequestError) {
            if (error.status === 404) {
              setBackendReady(false)
            }
            setTaskError(error.message)
          } else {
            setTaskError(getErrorMessage(error, 'No pude cargar tus tareas desde MongoDB.'))
          }
        } finally {
          if (isMounted) {
            setIsLoadingTasks(false)
          }
        }
      } catch (error) {
        if (!isMounted) {
          return
        }

        setBackendReady(!(error instanceof ApiRequestError && error.status === 404))
        setAuthError(
          error instanceof ApiRequestError && error.status === 404
            ? 'La API no esta disponible en este servidor. Usa "npm run dev:full" o despliega en Vercel.'
            : getErrorMessage(error, 'No pude validar la sesion de Eisenflow.'),
        )
        setSessionState('anonymous')
      }
    })()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (!editingTaskId) {
      return undefined
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setEditingTaskId(null)
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [editingTaskId])

  const visibleTasks = useMemo(() => {
    const query = search.trim().toLowerCase()
    return tasks.filter((task) => {
      const matchesQuery =
        query.length === 0 ||
        task.title.toLowerCase().includes(query) ||
        task.notes.toLowerCase().includes(query)
      const matchesQuadrant = quadrantFilter === 'all' || task.quadrant === quadrantFilter
      const matchesStatus = statusFilter === 'all' || task.status === statusFilter
      return matchesQuery && matchesQuadrant && matchesStatus
    })
  }, [quadrantFilter, search, statusFilter, tasks])

  const tasksByQuadrant = useMemo(() => {
    const groups: Record<QuadrantKey, Task[]> = {
      do: [],
      schedule: [],
      delegate: [],
      eliminate: [],
    }

    visibleTasks.forEach((task) => {
      groups[task.quadrant].push(task)
    })

    return groups
  }, [visibleTasks])

  const totalTasksByQuadrant = useMemo(() => {
    const groups: Record<QuadrantKey, number> = {
      do: 0,
      schedule: 0,
      delegate: 0,
      eliminate: 0,
    }

    tasks.forEach((task) => {
      groups[task.quadrant] += 1
    })

    return groups
  }, [tasks])

  const stats = useMemo(() => {
    const urgentNow = tasks.filter((task) => task.quadrant === 'do' && task.status !== 'done').length
    const planned = tasks.filter((task) => task.quadrant === 'schedule').length
    const focused = tasks.filter((task) => task.status === 'inProgress').length
    const completed = tasks.filter((task) => task.status === 'done').length
    return { urgentNow, planned, focused, completed }
  }, [tasks])

  const focusTasks = useMemo(
    () => tasks.filter((task) => task.status === 'inProgress').slice(0, 3),
    [tasks],
  )

  const urgentTasks = useMemo(
    () => tasks.filter((task) => task.quadrant === 'do' && task.status !== 'done').slice(0, 3),
    [tasks],
  )

  const activeTask = activeTaskId ? tasks.find((task) => task.id === activeTaskId) ?? null : null
  const hasActiveFilters =
    search.trim().length > 0 || quadrantFilter !== 'all' || statusFilter !== 'all'
  const busy = isAuthenticating || isLoadingTasks || isMutating

  const syncLabel = useMemo(() => {
    if (!backendReady) {
      return 'API no disponible'
    }

    if (isAuthenticating || isLoadingTasks || isMutating) {
      return 'Sincronizando...'
    }

    if (!lastSyncedAt) {
      return 'Pendiente de sincronizar'
    }

    return `Sincronizado a las ${new Intl.DateTimeFormat('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(lastSyncedAt))}`
  }, [backendReady, isAuthenticating, isLoadingTasks, isMutating, lastSyncedAt])

  async function refreshTasks(options: { silent: boolean }) {
    if (!options.silent) {
      setIsLoadingTasks(true)
    }

    try {
      const nextTasks = normalizeTaskOrder(await fetchTasks())
      setTasks(nextTasks)
      setTaskError(null)
      setLastSyncedAt(new Date().toISOString())
      setBackendReady(true)
    } catch (error) {
      handleRequestError(error, 'No pude cargar tus tareas desde MongoDB.')
    } finally {
      if (!options.silent) {
        setIsLoadingTasks(false)
      }
    }
  }

  function handleRequestError(error: unknown, fallbackMessage: string) {
    if (error instanceof ApiRequestError) {
      if (error.status === 401) {
        setSessionState('anonymous')
        setTasks([])
        setEditingTaskId(null)
        setAuthError('Tu sesion expiro. Inicia sesion otra vez para seguir.')
        return
      }

      if (error.status === 404) {
        setBackendReady(false)
      }

      setTaskError(error.message)
      return
    }

    setTaskError(getErrorMessage(error, fallbackMessage))
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedPassword = password.trim()
    if (!normalizedPassword) {
      setAuthError('Introduce la password privada de Eisenflow.')
      return
    }

    setIsAuthenticating(true)
    setAuthError(null)

    try {
      await login(normalizedPassword)
      setPassword('')
      setSessionState('authenticated')
      setBackendReady(true)
      await refreshTasks({ silent: false })
    } catch (error) {
      setAuthError(getErrorMessage(error, 'No pude iniciar sesion en Eisenflow.'))
      if (error instanceof ApiRequestError && error.status === 404) {
        setBackendReady(false)
      }
      setSessionState('anonymous')
    } finally {
      setIsAuthenticating(false)
    }
  }

  async function handleLogout() {
    setIsMutating(true)
    setTaskError(null)

    try {
      await logout()
      setSessionState('anonymous')
      setTasks([])
      setEditingTaskId(null)
      setLastSyncedAt(null)
    } catch (error) {
      handleRequestError(error, 'No pude cerrar sesion.')
    } finally {
      setIsMutating(false)
    }
  }

  async function handleCreateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const title = draft.title.trim()
    if (!title) {
      setTaskError('El titulo no puede estar vacio.')
      return
    }

    setIsMutating(true)
    setTaskError(null)

    try {
      const createdTask = await createTask({
        title,
        notes: draft.notes.trim(),
        quadrant: draft.quadrant,
        status: draft.status,
      })
      const nextTasks = withSequentialPositions([createdTask, ...tasks])
      setTasks(nextTasks)
      setDraft((currentDraft) => ({
        ...currentDraft,
        title: '',
        notes: '',
      }))
      const reorderedTasks = await reorderTasks(toReorderItems(nextTasks))
      setTasks(normalizeTaskOrder(reorderedTasks))
      setLastSyncedAt(new Date().toISOString())
    } catch (error) {
      handleRequestError(error, 'No pude crear la tarea.')
      await refreshTasks({ silent: true })
    } finally {
      setIsMutating(false)
    }
  }

  async function handleDeleteTask(taskId: string) {
    const previousTasks = tasks
    setTasks((currentTasks) => currentTasks.filter((task) => task.id !== taskId))
    setEditingTaskId((currentEditingId) => (currentEditingId === taskId ? null : currentEditingId))
    setIsMutating(true)
    setTaskError(null)

    try {
      await deleteTask(taskId)
      setLastSyncedAt(new Date().toISOString())
    } catch (error) {
      setTasks(previousTasks)
      handleRequestError(error, 'No pude borrar la tarea.')
    } finally {
      setIsMutating(false)
    }
  }

  async function handlePatchTask(taskId: string, patch: TaskPatch) {
    const previousTasks = tasks
    const optimisticTasks = normalizeTaskOrder(
      tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              ...patch,
              updatedAt: new Date().toISOString(),
            }
          : task,
      ),
    )

    setTasks(optimisticTasks)
    setTaskError(null)
    setIsMutating(true)

    try {
      const updatedTask = await updateTask(taskId, patch)
      setTasks((currentTasks) =>
        normalizeTaskOrder(
          currentTasks.map((task) => (task.id === taskId ? updatedTask : task)),
        ),
      )
      setLastSyncedAt(new Date().toISOString())
    } catch (error) {
      setTasks(previousTasks)
      handleRequestError(error, 'No pude guardar los cambios.')
    } finally {
      setIsMutating(false)
    }
  }

  async function handleSaveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingTaskId) {
      return
    }

    const title = editDraft.title.trim()
    if (!title) {
      setTaskError('El titulo no puede estar vacio.')
      return
    }

    await handlePatchTask(editingTaskId, {
      title,
      notes: editDraft.notes.trim(),
      quadrant: editDraft.quadrant,
      status: editDraft.status,
    })
    setEditingTaskId(null)
  }

  async function handleClearCompleted() {
    const previousTasks = tasks
    setTasks((currentTasks) => currentTasks.filter((task) => task.status !== 'done'))
    setIsMutating(true)
    setTaskError(null)

    try {
      await clearCompletedTasks()
      const normalizedTasks = withSequentialPositions(previousTasks.filter((task) => task.status !== 'done'))
      const reorderedTasks = await reorderTasks(toReorderItems(normalizedTasks))
      setTasks(normalizeTaskOrder(reorderedTasks))
      setLastSyncedAt(new Date().toISOString())
    } catch (error) {
      setTasks(previousTasks)
      handleRequestError(error, 'No pude limpiar las tareas hechas.')
    } finally {
      setIsMutating(false)
    }
  }

  async function handleSeedExamples() {
    setIsMutating(true)
    setTaskError(null)

    try {
      await seedStarterTasks()
      await refreshTasks({ silent: true })
    } catch (error) {
      handleRequestError(error, 'No pude cargar los ejemplos iniciales.')
    } finally {
      setIsMutating(false)
    }
  }

  function openEditor(task: Task) {
    setEditingTaskId(task.id)
    setEditDraft({
      title: task.title,
      notes: task.notes,
      quadrant: task.quadrant,
      status: task.status,
    })
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveTaskId(String(event.active.id))
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveTaskId(null)
    const { active, over } = event

    if (!over) {
      return
    }

    const activeId = String(active.id)
    const overId = String(over.id)
    if (activeId === overId) {
      return
    }

    const previousTasks = tasks
    const nextTasks = moveTask(previousTasks, activeId, overId)
    if (nextTasks === previousTasks) {
      return
    }

    setTasks(nextTasks)
    setIsMutating(true)
    setTaskError(null)

    try {
      const reorderedTasks = await reorderTasks(toReorderItems(nextTasks))
      setTasks(normalizeTaskOrder(reorderedTasks))
      setLastSyncedAt(new Date().toISOString())
    } catch (error) {
      setTasks(previousTasks)
      handleRequestError(error, 'No pude reordenar la matriz.')
    } finally {
      setIsMutating(false)
    }
  }

  if (sessionState === 'checking') {
    return (
      <div className="login-shell">
        <div className="login-card panel loading-card">
          <BrandLockup compact={false} />
          <div className="spinner-dot" aria-hidden="true" />
          <p>Conectando Eisenflow con tu tablero privado...</p>
        </div>
      </div>
    )
  }

  if (sessionState === 'anonymous') {
    return (
      <div className="login-shell">
        <div className="login-grid">
          <section className="login-card panel">
            <BrandLockup compact={false} />
            <h1>Tu matriz Eisenhower privada, lista para vivir en Vercel.</h1>
            <p>
              Eisenflow guarda tareas en MongoDB Atlas, protege el acceso con una
              password privada y mantiene la experiencia drag-and-drop que ya construimos.
            </p>

            <form className="task-form" onSubmit={handleLogin}>
              <label className="field">
                <span>Password de acceso</span>
                <input
                  type="password"
                  placeholder="Introduce tu password privada"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>

              <button type="submit" className="primary-button" disabled={isAuthenticating || !backendReady}>
                {isAuthenticating ? 'Entrando...' : 'Entrar en Eisenflow'}
              </button>
            </form>

            <div className={`status-banner ${authError ? 'is-error' : ''}`}>
              <strong>{backendReady ? 'Acceso privado' : 'Sin API conectada'}</strong>
              <p>
                {authError ??
                  'Define EISENFLOW_APP_PASSWORD y EISENFLOW_SESSION_SECRET para proteger el tablero.'}
              </p>
            </div>
          </section>

          <aside className="panel login-sidecard">
            <div className="feature-card">
              <span className="section-kicker">Stack recomendado</span>
              <h2>Vercel + MongoDB Atlas</h2>
              <p>
                Frontend estatico, funciones serverless en /api y persistencia remota sin montar un servidor tradicional.
              </p>
            </div>

            <ul className="feature-list">
              <li>
                <strong>Privado por defecto</strong>
                <span>Sesion firmada en cookie httpOnly para uso personal.</span>
              </li>
              <li>
                <strong>Deploy directo</strong>
                <span>Subes a Vercel, configuras variables y queda listo.</span>
              </li>
              <li>
                <strong>Modo local completo</strong>
                <span>Usa <code>npm run dev:full</code> para frontend + API juntos.</span>
              </li>
            </ul>
          </aside>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="app-shell">
        <header className="panel app-topbar">
          <BrandLockup compact />
          <div className="app-meta">
            <span className={`sync-badge ${busy ? 'is-busy' : ''}`}>{syncLabel}</span>
            <button type="button" className="ghost-button" onClick={() => void handleLogout()} disabled={busy}>
              Cerrar sesion
            </button>
          </div>
        </header>

        {taskError ? (
          <div className="status-banner is-error panel">
            <strong>Algo necesita revision</strong>
            <p>{taskError}</p>
          </div>
        ) : null}

        {!backendReady ? (
          <div className="status-banner panel">
            <strong>Entorno local incompleto</strong>
            <p>La API no esta disponible. Para probar MongoDB y auth en local usa <code>npm run dev:full</code>.</p>
          </div>
        ) : null}

        <section className="hero panel">
          <div className="hero-copy">
            <span className="eyebrow">Eisenflow</span>
            <h1>Tu flujo personal de decisiones, priorizado en segundos.</h1>
            <p>
              Arrastra tareas, cambia estados, sincroniza con MongoDB y manten la matriz lista en cualquier dispositivo.
            </p>
          </div>

          <div className="hero-actions">
            <div className="hero-stats">
              <StatCard label="Urgente ahora" value={stats.urgentNow} />
              <StatCard label="En foco" value={stats.focused} />
              <StatCard label="Planificadas" value={stats.planned} />
              <StatCard label="Hechas" value={stats.completed} />
            </div>

            <div className="action-row">
              <button type="button" className="secondary-button" onClick={() => void handleSeedExamples()} disabled={busy}>
                Cargar ejemplos
              </button>
              <button type="button" className="ghost-button" onClick={() => void handleClearCompleted()} disabled={busy}>
                Limpiar hechas
              </button>
            </div>
          </div>
        </section>

        <section className="panel composer-panel">
          <div className="section-heading">
            <div>
              <span className="section-kicker">Nueva tarea</span>
              <h2>Captura rapido lo que debe entrar en tu flujo</h2>
            </div>
            <span className="helper-copy">Persistencia remota con MongoDB Atlas</span>
          </div>

          <form className="task-form" onSubmit={handleCreateTask}>
            <label className="field field-title">
              <span>Titulo</span>
              <input
                type="text"
                placeholder="Ej. Cerrar propuesta para cliente"
                value={draft.title}
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
              />
            </label>

            <label className="field">
              <span>Notas</span>
              <textarea
                rows={3}
                placeholder="Agrega contexto, fecha o siguiente paso."
                value={draft.notes}
                onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
              />
            </label>

            <div className="field">
              <span>Cuadrante</span>
              <div className="choice-grid">
                {quadrantOrder.map((quadrant) => (
                  <button
                    key={quadrant}
                    type="button"
                    className={`choice-chip ${draft.quadrant === quadrant ? 'is-selected' : ''}`}
                    style={{ '--accent': quadrantConfig[quadrant].accent } as CSSProperties}
                    onClick={() => setDraft((current) => ({ ...current, quadrant }))}
                  >
                    <strong>{quadrantConfig[quadrant].title}</strong>
                    <span>{quadrantConfig[quadrant].subtitle}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <span>Estado</span>
              <div className="status-picker">
                {statusOrder.map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={`status-pill ${draft.status === status ? 'is-selected' : ''}`}
                    style={{ '--tone': statusConfig[status].tone } as CSSProperties}
                    onClick={() => setDraft((current) => ({ ...current, status }))}
                  >
                    {statusConfig[status].label}
                  </button>
                ))}
              </div>
            </div>

            <button type="submit" className="primary-button" disabled={busy}>
              {isMutating ? 'Guardando...' : 'Agregar a Eisenflow'}
            </button>
          </form>
        </section>

        <section className="panel filters-panel">
          <div className="section-heading">
            <div>
              <span className="section-kicker">Filtro rapido</span>
              <h2>Busca y enfoca tu tablero personal</h2>
            </div>
            {hasActiveFilters ? (
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  setSearch('')
                  setQuadrantFilter('all')
                  setStatusFilter('all')
                }}
              >
                Limpiar filtros
              </button>
            ) : null}
          </div>

          <div className="filters-layout">
            <label className="field">
              <span>Buscar</span>
              <input
                type="search"
                placeholder="Busca por titulo o nota"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>

            <div className="filter-group">
              <span className="filter-label">Estado</span>
              <div className="filter-pills">
                <button
                  type="button"
                  className={`filter-pill ${statusFilter === 'all' ? 'is-selected' : ''}`}
                  onClick={() => setStatusFilter('all')}
                >
                  Todos
                </button>
                {statusOrder.map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={`filter-pill ${statusFilter === status ? 'is-selected' : ''}`}
                    onClick={() => setStatusFilter(status)}
                  >
                    {statusConfig[status].label}
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-group">
              <span className="filter-label">Vista</span>
              <div className="filter-pills">
                <button
                  type="button"
                  className={`filter-pill ${quadrantFilter === 'all' ? 'is-selected' : ''}`}
                  onClick={() => setQuadrantFilter('all')}
                >
                  Toda la matriz
                </button>
                {quadrantOrder.map((quadrant) => (
                  <button
                    key={quadrant}
                    type="button"
                    className={`filter-pill ${quadrantFilter === quadrant ? 'is-selected' : ''}`}
                    onClick={() => setQuadrantFilter(quadrant)}
                  >
                    {quadrantConfig[quadrant].title}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <div className="content-grid">
          <section className="panel matrix-panel">
            <div className="section-heading">
              <div>
                <span className="section-kicker">Matriz</span>
                <h2>Arrastra tareas entre cuadrantes</h2>
              </div>
              <span className="helper-copy">
                {visibleTasks.length} {visibleTasks.length === 1 ? 'tarea visible' : 'tareas visibles'}
              </span>
            </div>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={handleDragStart}
              onDragEnd={(event) => void handleDragEnd(event)}
              onDragCancel={() => setActiveTaskId(null)}
            >
              <div className="matrix-grid">
                {quadrantOrder.map((quadrant) => (
                  <QuadrantPanel
                    key={quadrant}
                    quadrant={quadrant}
                    tasks={tasksByQuadrant[quadrant]}
                    totalTasks={totalTasksByQuadrant[quadrant]}
                    onEdit={openEditor}
                    onDelete={(taskId) => void handleDeleteTask(taskId)}
                    onStatusChange={(taskId, status) => void handlePatchTask(taskId, { status })}
                  />
                ))}
              </div>

              <DragOverlay>{activeTask ? <TaskPreview task={activeTask} /> : null}</DragOverlay>
            </DndContext>

            {!isLoadingTasks && tasks.length === 0 ? (
              <div className="empty-panel">
                <h3>Tu tablero esta vacio</h3>
                <p>Empieza creando una tarea o carga ejemplos para ver Eisenflow en accion.</p>
                <button type="button" className="primary-button" onClick={() => void handleSeedExamples()}>
                  Cargar tablero de ejemplo
                </button>
              </div>
            ) : null}
          </section>

          <aside className="panel insights-panel">
            <div className="section-heading">
              <div>
                <span className="section-kicker">Resumen</span>
                <h2>Donde poner tu energia</h2>
              </div>
            </div>

            <div className="insight-block">
              <h3>Atencion inmediata</h3>
              {urgentTasks.length > 0 ? (
                <ul className="compact-list">
                  {urgentTasks.map((task) => (
                    <li key={task.id}>
                      <button type="button" className="compact-card" onClick={() => openEditor(task)}>
                        <strong>{task.title}</strong>
                        <span>{statusConfig[task.status].label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-copy">No hay urgencias abiertas. Muy buena señal.</p>
              )}
            </div>

            <div className="insight-block">
              <h3>En foco</h3>
              {focusTasks.length > 0 ? (
                <ul className="compact-list">
                  {focusTasks.map((task) => (
                    <li key={task.id}>
                      <button type="button" className="compact-card" onClick={() => openEditor(task)}>
                        <strong>{task.title}</strong>
                        <span>{quadrantConfig[task.quadrant].title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-copy">Marca una tarea como En foco para verla aqui.</p>
              )}
            </div>

            <div className="insight-block">
              <h3>Consejo</h3>
              <p className="tip-copy">
                Mantener privada la app te permite usar Eisenflow como tablero personal real: una sola password,
                despliegue simple y datos siempre disponibles.
              </p>
            </div>
          </aside>
        </div>
      </div>

      {editingTaskId ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setEditingTaskId(null)}>
          <div className="modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="section-heading">
              <div>
                <span className="section-kicker">Editar tarea</span>
                <h2>Ajusta prioridad y estado</h2>
              </div>
              <button type="button" className="ghost-button" onClick={() => setEditingTaskId(null)}>
                Cerrar
              </button>
            </div>

            <form className="task-form" onSubmit={(event) => void handleSaveEdit(event)}>
              <label className="field field-title">
                <span>Titulo</span>
                <input
                  type="text"
                  value={editDraft.title}
                  onChange={(event) => setEditDraft((current) => ({ ...current, title: event.target.value }))}
                />
              </label>

              <label className="field">
                <span>Notas</span>
                <textarea
                  rows={4}
                  value={editDraft.notes}
                  onChange={(event) => setEditDraft((current) => ({ ...current, notes: event.target.value }))}
                />
              </label>

              <div className="field">
                <span>Cuadrante</span>
                <div className="choice-grid">
                  {quadrantOrder.map((quadrant) => (
                    <button
                      key={quadrant}
                      type="button"
                      className={`choice-chip ${editDraft.quadrant === quadrant ? 'is-selected' : ''}`}
                      style={{ '--accent': quadrantConfig[quadrant].accent } as CSSProperties}
                      onClick={() => setEditDraft((current) => ({ ...current, quadrant }))}
                    >
                      <strong>{quadrantConfig[quadrant].title}</strong>
                      <span>{quadrantConfig[quadrant].subtitle}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="field">
                <span>Estado</span>
                <div className="status-picker">
                  {statusOrder.map((status) => (
                    <button
                      key={status}
                      type="button"
                      className={`status-pill ${editDraft.status === status ? 'is-selected' : ''}`}
                      style={{ '--tone': statusConfig[status].tone } as CSSProperties}
                      onClick={() => setEditDraft((current) => ({ ...current, status }))}
                    >
                      {statusConfig[status].label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="modal-actions">
                <button type="submit" className="primary-button" disabled={busy}>
                  Guardar cambios
                </button>
                <button
                  type="button"
                  className="ghost-button danger-button"
                  onClick={() => void handleDeleteTask(editingTaskId)}
                  disabled={busy}
                >
                  Eliminar tarea
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  )
}

function BrandLockup({ compact }: { compact: boolean }) {
  return (
    <div className={`brand-lockup ${compact ? 'is-compact' : ''}`}>
      <div className="brand-mark" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div>
        <span className="eyebrow">Eisenflow</span>
        <p className="brand-copy">Matriz privada con MongoDB, auth ligera y deploy listo para Vercel.</p>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat-card">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}

function QuadrantPanel({
  quadrant,
  tasks,
  totalTasks,
  onEdit,
  onDelete,
  onStatusChange,
}: {
  quadrant: QuadrantKey
  tasks: Task[]
  totalTasks: number
  onEdit: (task: Task) => void
  onDelete: (taskId: string) => void
  onStatusChange: (taskId: string, status: StatusKey) => void
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `${QUADRANT_DROP_PREFIX}${quadrant}`,
  })

  return (
    <section
      ref={setNodeRef}
      className={`quadrant-card ${isOver ? 'is-over' : ''}`}
      style={{ '--accent': quadrantConfig[quadrant].accent } as CSSProperties}
    >
      <div className="quadrant-header">
        <div>
          <span className="quadrant-subtitle">{quadrantConfig[quadrant].subtitle}</span>
          <h3>{quadrantConfig[quadrant].title}</h3>
          <p>{quadrantConfig[quadrant].description}</p>
        </div>
        <div className="quadrant-count">
          <strong>{tasks.length}</strong>
          <span>/ {totalTasks}</span>
        </div>
      </div>

      <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
        <div className="task-list">
          {tasks.length > 0 ? (
            tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onEdit={() => onEdit(task)}
                onDelete={() => onDelete(task.id)}
                onStatusChange={onStatusChange}
              />
            ))
          ) : (
            <div className="empty-slot">
              <p>Suelta una tarea aqui o capturala desde el formulario.</p>
            </div>
          )}
        </div>
      </SortableContext>
    </section>
  )
}

function TaskCard({
  task,
  onEdit,
  onDelete,
  onStatusChange,
}: {
  task: Task
  onEdit: () => void
  onDelete: () => void
  onStatusChange: (taskId: string, status: StatusKey) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  })

  return (
    <article
      ref={setNodeRef}
      className={`task-card ${isDragging ? 'is-dragging' : ''}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        '--tone': statusConfig[task.status].tone,
      } as CSSProperties}
    >
      <div className="task-card-top">
        <button type="button" className="drag-handle" aria-label={`Mover tarea ${task.title}`} {...attributes} {...listeners}>
          Arrastrar
        </button>
        <span className="task-date">{formatTaskDate(task.updatedAt)}</span>
      </div>

      <div className="task-content">
        <div>
          <h4>{task.title}</h4>
          {task.notes ? <p>{task.notes}</p> : null}
        </div>
      </div>

      <div className="task-actions">
        <div className="mini-status-picker">
          {statusOrder.map((status) => (
            <button
              key={status}
              type="button"
              className={`mini-status-pill ${task.status === status ? 'is-selected' : ''}`}
              onClick={() => onStatusChange(task.id, status)}
            >
              {statusConfig[status].label}
            </button>
          ))}
        </div>

        <div className="task-action-row">
          <button type="button" className="text-button" onClick={onEdit}>
            Editar
          </button>
          <button type="button" className="text-button danger-text" onClick={onDelete}>
            Borrar
          </button>
        </div>
      </div>
    </article>
  )
}

function TaskPreview({ task }: { task: Task }) {
  return (
    <article className="task-card task-preview" style={{ '--tone': statusConfig[task.status].tone } as CSSProperties}>
      <div className="task-card-top">
        <span className="drag-handle preview-label">Moviendo</span>
        <span className="task-date">{quadrantConfig[task.quadrant].title}</span>
      </div>
      <div className="task-content">
        <div>
          <h4>{task.title}</h4>
          {task.notes ? <p>{task.notes}</p> : null}
        </div>
      </div>
    </article>
  )
}

function moveTask(tasks: Task[], activeId: string, overId: string): Task[] {
  const activeTask = tasks.find((task) => task.id === activeId)
  if (!activeTask) {
    return tasks
  }

  const targetQuadrant = resolveQuadrant(overId, tasks)
  if (!targetQuadrant) {
    return tasks
  }

  const movedTask: Task = {
    ...activeTask,
    quadrant: targetQuadrant,
    updatedAt: new Date().toISOString(),
  }

  const tasksWithoutActive = tasks.filter((task) => task.id !== activeId)

  if (overId.startsWith(QUADRANT_DROP_PREFIX)) {
    const insertionIndex = findInsertIndex(tasksWithoutActive, targetQuadrant)
    const nextTasks = [...tasksWithoutActive]
    nextTasks.splice(insertionIndex, 0, movedTask)
    return withSequentialPositions(nextTasks)
  }

  const overIndex = tasksWithoutActive.findIndex((task) => task.id === overId)
  if (overIndex < 0) {
    return tasks
  }

  const nextTasks = [...tasksWithoutActive]
  nextTasks.splice(overIndex, 0, movedTask)
  return withSequentialPositions(nextTasks)
}

function resolveQuadrant(targetId: string, tasks: Task[]): QuadrantKey | null {
  if (targetId.startsWith(QUADRANT_DROP_PREFIX)) {
    const quadrant = targetId.slice(QUADRANT_DROP_PREFIX.length)
    return quadrantOrder.includes(quadrant as QuadrantKey) ? (quadrant as QuadrantKey) : null
  }

  return tasks.find((task) => task.id === targetId)?.quadrant ?? null
}

function findInsertIndex(tasks: Task[], targetQuadrant: QuadrantKey): number {
  const lastSameQuadrantIndex = tasks.reduce(
    (lastIndex, task, index) => (task.quadrant === targetQuadrant ? index : lastIndex),
    -1,
  )

  if (lastSameQuadrantIndex >= 0) {
    return lastSameQuadrantIndex + 1
  }

  const targetOrder = quadrantOrder.indexOf(targetQuadrant)
  const nextQuadrantIndex = tasks.findIndex(
    (task) => quadrantOrder.indexOf(task.quadrant) > targetOrder,
  )

  return nextQuadrantIndex >= 0 ? nextQuadrantIndex : tasks.length
}

function toReorderItems(tasks: Task[]) {
  return withSequentialPositions(tasks).map((task) => ({
    id: task.id,
    quadrant: task.quadrant,
    position: task.position,
  }))
}

function formatTaskDate(dateString: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(dateString))
}

function getErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof ApiRequestError) {
    return error.message
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallbackMessage
}

export default App
