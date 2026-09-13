import { createServer } from 'node:http'
import { createApiHandler } from './app.js'
import { KeycloakTokenVerifier } from './auth.js'
import { closeDatabase, getCategories } from './db.js'
import { startEventWorker, stopEventWorker } from './event-worker.js'

const port = Number(process.env.PORT ?? 3001)

const server = createServer(createApiHandler({ verifier: new KeycloakTokenVerifier(), getCategories }))
server.listen(port, () => { console.log(`Helfio category API listening on http://localhost:${port}`); startEventWorker() })

process.on('SIGTERM', async () => {
  server.close()
  await stopEventWorker()
  await closeDatabase()
})