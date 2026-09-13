import { createServer } from 'node:http'
import { createApiHandler } from './app.js'
import { KeycloakTokenVerifier } from './auth.js'
import { checkDatabaseHealth, closeDatabase, getCategories } from './db.js'
import { eventWorkerHealthy, startEventWorker, stopEventWorker } from './event-worker.js'

const port = Number(process.env.PORT ?? 3001)

const server = createServer(createApiHandler({ verifier: new KeycloakTokenVerifier(), getCategories, health: async () => ({ database: await checkDatabaseHealth(), eventWorker: eventWorkerHealthy() }) }))
server.listen(port, () => { console.log(JSON.stringify({ level: 'info', message: 'api_started', port })); startEventWorker() })

let shuttingDown = false
async function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(JSON.stringify({ level: 'info', message: 'api_shutdown', signal }))
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await stopEventWorker()
  await closeDatabase()
}
process.once('SIGTERM', () => { void shutdown('SIGTERM') })
process.once('SIGINT', () => { void shutdown('SIGINT') })