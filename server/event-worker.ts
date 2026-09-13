import { Kafka, type Producer } from 'kafkajs'
import { connect, StringCodec, type NatsConnection } from 'nats'
import { pool } from './db.js'
import type { DomainEvent, DomainEventPayload, DomainEventType } from './events.js'
import { consumeDomainEvent } from './notifications.js'

let producer: Producer | null = null
let nats: NatsConnection | null = null
let timer: NodeJS.Timeout | null = null
let lastRunAt = 0
let lastSuccessAt = 0
let lastFailureAt = 0
let dispatching = false
const codec = StringCodec()
export const MAX_EVENT_ATTEMPTS = 8

export function retryDelaySeconds(attempt: number) {
  return Math.min(300, 2 ** Math.min(Math.max(1, attempt), 8))
}

function brokers() { return (process.env.KAFKA_BROKERS ?? '').split(',').map((value) => value.trim()).filter(Boolean) }
async function kafkaProducer() {
  const configured = brokers()
  if (!configured.length) return null
  if (!producer) {
    producer = new Kafka({ clientId: process.env.KAFKA_CLIENT_ID ?? 'helfio-api', brokers: configured, retry: { retries: 5 } }).producer()
    await producer.connect()
  }
  return producer
}
async function natsConnection() {
  const url = process.env.NATS_URL?.trim()
  if (!url) return null
  if (!nats) nats = await connect({ servers: url, name: process.env.NATS_CLIENT_NAME ?? 'helfio-api' })
  return nats
}

async function publishExternal(event: DomainEvent) {
  const kafka = await kafkaProducer()
  if (kafka) await kafka.send({ topic: process.env.KAFKA_TOPIC ?? 'helfio.domain-events', messages: [{ key: event.aggregateId, value: JSON.stringify(event) }] })
  const connection = await natsConnection()
  if (connection) connection.publish(`${process.env.NATS_SUBJECT_PREFIX ?? 'helfio.events'}.${event.eventType}`, codec.encode(JSON.stringify(event)))
}

async function pendingEvents() {
  const result = await pool.query(`SELECT event_id AS "eventId", event_type AS "eventType", aggregate_id AS "aggregateId", occurred_at AS "occurredAt", version, payload
    FROM domain_events WHERE published_at IS NULL AND attempts < ${MAX_EVENT_ATTEMPTS} AND next_attempt_at <= now() ORDER BY occurred_at LIMIT 50`)
  return result.rows.map((row) => ({ eventId: String(row.eventId), eventType: row.eventType as DomainEventType, aggregateId: String(row.aggregateId), occurredAt: new Date(row.occurredAt as string).toISOString(), version: Number(row.version), payload: row.payload as DomainEventPayload }))
}

export async function dispatchPendingEvents() {
  if (dispatching) return
  dispatching = true
  lastRunAt = Date.now()
  try {
    for (const event of await pendingEvents()) {
      try {
        await consumeDomainEvent(event)
        await publishExternal(event)
        await pool.query('UPDATE domain_events SET published_at = now(), attempts = attempts + 1, last_error = NULL WHERE event_id = $1', [event.eventId])
      } catch (error) {
        lastFailureAt = Date.now()
        const message = error instanceof Error ? error.message.slice(0, 1000) : 'Unknown event delivery failure'
        await pool.query(`UPDATE domain_events SET attempts = attempts + 1, last_error = $2,
          next_attempt_at = now() + make_interval(secs => LEAST(300, power(2, LEAST(attempts + 1, ${MAX_EVENT_ATTEMPTS}))::int)) WHERE event_id = $1`, [event.eventId, message])
      }
    }
    lastSuccessAt = Date.now()
  } catch (error) {
    lastFailureAt = Date.now()
    console.error(JSON.stringify({ level: 'error', message: 'event_worker_poll_failed', error: error instanceof Error ? error.message.slice(0, 500) : 'unknown' }))
  } finally { dispatching = false }
}

export function eventWorkerHealthy() {
  if (!timer) return false
  if (lastFailureAt > lastSuccessAt) return false
  return Date.now() - lastRunAt < Math.max(30_000, Number(process.env.EVENT_POLL_INTERVAL_MS ?? 5000) * 12)
}

export function startEventWorker() {
  if (timer) return
  timer = setInterval(() => { void dispatchPendingEvents() }, Number(process.env.EVENT_POLL_INTERVAL_MS ?? 5000))
  timer.unref()
  void dispatchPendingEvents()
}

export async function stopEventWorker() {
  if (timer) clearInterval(timer)
  timer = null
  if (producer) await producer.disconnect().catch(() => undefined)
  producer = null
  if (nats) await nats.drain().catch(() => undefined)
  nats = null
}
