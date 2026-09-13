import assert from 'node:assert/strict'
import test from 'node:test'
import { appendDomainEvent, type SqlClient } from './events.js'
import { notificationText } from './notifications.js'

const aggregateId = '11111111-1111-4111-8111-111111111111'

test('domain events use a stable versioned envelope and persist atomically through the supplied transaction client', async () => {
  const queries: Array<{ text: string; values?: unknown[] }> = []
  const client: SqlClient = { async query(text, values) { queries.push({ text, values }); return { rows: [] } } }
  const event = await appendDomainEvent(client, 'job.created', aggregateId, { recipientUserIds: [aggregateId], title: 'Move furniture' })
  assert.equal(event.eventType, 'job.created')
  assert.equal(event.aggregateId, aggregateId)
  assert.equal(event.version, 1)
  assert.match(event.eventId, /^[0-9a-f-]{36}$/)
  assert.ok(Number.isNaN(Date.parse(event.occurredAt)) === false)
  assert.equal(queries.length, 1)
  assert.equal(queries[0].values?.[0], event.eventId)
  assert.equal(JSON.parse(String(queries[0].values?.[5])).title, 'Move furniture')
})

test('every required domain event has localized notification text', () => {
  const eventTypes = ['job.created', 'job.published', 'offer.created', 'offer.accepted', 'job.assigned', 'job.started', 'job.awaiting_confirmation', 'job.completed', 'review.created', 'message.created']
  for (const eventType of eventTypes) {
    const text = notificationText(eventType)
    assert.ok(text.title.en && text.title.de && text.title.sq && text.title.tr, eventType)
    assert.ok(text.body.en && text.body.de && text.body.sq && text.body.tr, eventType)
  }
})
