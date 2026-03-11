import { MongoClient, ServerApiVersion, type Db } from 'mongodb'
import { getEnv } from './env'

declare global {
  var __eisenflowMongoClientPromise: Promise<MongoClient> | undefined
}

function createClientPromise(): Promise<MongoClient> {
  const client = new MongoClient(getEnv('MONGODB_URI'), {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  })

  return client.connect()
}

export async function getDatabase(): Promise<Db> {
  const clientPromise = globalThis.__eisenflowMongoClientPromise ?? createClientPromise()
  globalThis.__eisenflowMongoClientPromise = clientPromise
  const client = await clientPromise
  return client.db(getEnv('MONGODB_DB_NAME'))
}
