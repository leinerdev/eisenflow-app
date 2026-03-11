import { randomUUID } from 'node:crypto'
import type { Collection } from 'mongodb'
import {
  createStarterTaskInputs,
  normalizeTaskOrder,
  type Task,
  type TaskInput,
  type TaskPatch,
  type TaskReorderItem,
} from '../../shared/eisenflow'
import { getDatabase } from './mongodb'

type TaskDocument = Task & {
  _id: string
}

const COLLECTION_NAME = 'tasks'

async function getCollection(): Promise<Collection<TaskDocument>> {
  const database = await getDatabase()
  return database.collection<TaskDocument>(COLLECTION_NAME)
}

function toTask(document: TaskDocument): Task {
  return {
    id: document.id,
    title: document.title,
    notes: document.notes,
    quadrant: document.quadrant,
    status: document.status,
    position: document.position,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  }
}

async function getNextPosition(collection: Collection<TaskDocument>): Promise<number> {
  const highestTask = await collection.find({}).sort({ position: -1 }).limit(1).next()
  return highestTask ? highestTask.position + 1 : 0
}

export async function listTasks(): Promise<Task[]> {
  const collection = await getCollection()
  const tasks = await collection.find({}).sort({ position: 1, updatedAt: -1 }).toArray()
  return normalizeTaskOrder(tasks.map(toTask))
}

export async function createTask(input: TaskInput): Promise<Task> {
  const collection = await getCollection()
  const now = new Date().toISOString()
  const id = randomUUID()
  const position = await getNextPosition(collection)
  const document: TaskDocument = {
    _id: id,
    id,
    title: input.title,
    notes: input.notes,
    quadrant: input.quadrant,
    status: input.status,
    position,
    createdAt: now,
    updatedAt: now,
  }

  await collection.insertOne(document)
  return toTask(document)
}

export async function updateTask(taskId: string, patch: TaskPatch): Promise<Task | null> {
  const collection = await getCollection()
  const result = await collection.findOneAndUpdate(
    { _id: taskId },
    {
      $set: {
        ...patch,
        updatedAt: new Date().toISOString(),
      },
    },
    { returnDocument: 'after' },
  )

  return result ? toTask(result) : null
}

export async function deleteTask(taskId: string): Promise<boolean> {
  const collection = await getCollection()
  const result = await collection.deleteOne({ _id: taskId })
  return result.deletedCount === 1
}

export async function deleteCompletedTasks(): Promise<number> {
  const collection = await getCollection()
  const result = await collection.deleteMany({ status: 'done' })
  return result.deletedCount
}

export async function reorderTasks(items: TaskReorderItem[]): Promise<Task[]> {
  const collection = await getCollection()

  if (items.length > 0) {
    const updatedAt = new Date().toISOString()
    await collection.bulkWrite(
      items.map((item) => ({
        updateOne: {
          filter: { _id: item.id },
          update: {
            $set: {
              position: item.position,
              quadrant: item.quadrant,
              updatedAt,
            },
          },
        },
      })),
      { ordered: false },
    )
  }

  return listTasks()
}

export async function seedStarterTasks(): Promise<number> {
  const collection = await getCollection()
  const basePosition = await getNextPosition(collection)
  const now = new Date().toISOString()
  const documents: TaskDocument[] = createStarterTaskInputs().map((task, index) => {
    const id = randomUUID()
    return {
      _id: id,
      id,
      title: task.title,
      notes: task.notes,
      quadrant: task.quadrant,
      status: task.status,
      position: basePosition + index,
      createdAt: now,
      updatedAt: now,
    }
  })

  await collection.insertMany(documents)
  return documents.length
}
