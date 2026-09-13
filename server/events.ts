import { randomUUID } from 'node:crypto'

export type DomainEventType =
  | 'job.created'
  | 'job.published'
  | 'offer.created'
  | 'offer.accepted'
  | 'job.assigned'
  | 'job.started'
  | 'job.awaiting_confirmation'
  | 'job.completed'
  | 'review.created'
  | 'message.created'

export interface DomainEventPayload {
  recipientUserIds?: string[]
  recipientEmails?: Record<string, string | null>
  [key: string]: unknown
}

export interface DomainEvent {
  eventId: string
  eventType: DomainEventType
  aggregateId: string
  occurredAt: string
  version: number
  payload: DomainEventPayload
}

export interface SqlClient {
  query<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: T[] }>
}

export async function appendDomainEvent(client: SqlClient, eventType: DomainEventType, aggregateId: string, payload: DomainEventPayload): Promise<DomainEvent> {
  const event = {
    eventId: randomUUID(),
    eventType,
    aggregateId,
    occurredAt: new Date().toISOString(),
    version: 1,
    payload,
  }
  await client.query(`INSERT INTO domain_events (event_id, event_type, aggregate_id, occurred_at, version, payload)
    VALUES ($1, $2, $3, $4, $5, $6::jsonb)`, [event.eventId, event.eventType, event.aggregateId, event.occurredAt, event.version, JSON.stringify(event.payload)])
  return event
}
