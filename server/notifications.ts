import type { PushSubscriptionInput } from './push.js'
import { notifyPush } from './push.js'
import { pool } from './db.js'
import type { DomainEvent, DomainEventPayload } from './events.js'
import type { PreferredLocale } from './db.js'

export interface NotificationTranslations { en: string; de: string; sq: string; tr: string }
export interface NotificationView {
  id: string
  eventId: string
  eventType: string
  title: string
  body: string
  createdAt: string
  readAt: string | null
}

const consumerName = 'in-app-notifications-v1'
const translations: Record<string, { title: NotificationTranslations; body: NotificationTranslations; template: string }> = {
  'job.created': {
    title: { en: 'Job created', de: 'Auftrag erstellt', sq: 'Puna u krijua', tr: 'İş oluşturuldu' },
    body: { en: 'Your job draft has been saved.', de: 'Dein Auftragsentwurf wurde gespeichert.', sq: 'Drafti i punës u ruajt.', tr: 'İş taslağın kaydedildi.' },
    template: 'job-created',
  },
  'job.published': {
    title: { en: 'Job published', de: 'Auftrag veröffentlicht', sq: 'Puna u publikua', tr: 'İş yayınlandı' },
    body: { en: 'Your job is now visible to providers.', de: 'Dein Auftrag ist jetzt für Anbieter sichtbar.', sq: 'Puna jote tani është e dukshme për ofruesit.', tr: 'İşin artık hizmet verenlere görünüyor.' },
    template: 'job-published',
  },
  'offer.created': {
    title: { en: 'New offer received', de: 'Neues Angebot erhalten', sq: 'Mora një ofertë të re', tr: 'Yeni teklif alındı' },
    body: { en: 'A provider sent an offer for your job.', de: 'Ein Anbieter hat ein Angebot für deinen Auftrag gesendet.', sq: 'Një ofrues dërgoi ofertë për punën tënde.', tr: 'Bir hizmet veren işin için teklif gönderdi.' },
    template: 'offer-created',
  },
  'offer.accepted': {
    title: { en: 'Offer accepted', de: 'Angebot angenommen', sq: 'Oferta u pranua', tr: 'Teklif kabul edildi' },
    body: { en: 'Your offer was accepted.', de: 'Dein Angebot wurde angenommen.', sq: 'Oferta jote u pranua.', tr: 'Teklifin kabul edildi.' },
    template: 'offer-accepted',
  },
  'job.assigned': {
    title: { en: 'Job assigned', de: 'Auftrag zugewiesen', sq: 'Puna u caktua', tr: 'İş atandı' },
    body: { en: 'You are assigned to this job.', de: 'Dir wurde dieser Auftrag zugewiesen.', sq: 'Je caktuar për këtë punë.', tr: 'Bu iş sana atandı.' },
    template: 'job-assigned',
  },
  'job.started': {
    title: { en: 'Job started', de: 'Auftrag gestartet', sq: 'Puna filloi', tr: 'İş başladı' },
    body: { en: 'Your provider started the job.', de: 'Dein Anbieter hat den Auftrag gestartet.', sq: 'Ofruesi yt e filloi punën.', tr: 'Hizmet veren işine başladı.' },
    template: 'job-started',
  },
  'job.awaiting_confirmation': {
    title: { en: 'Completion needs confirmation', de: 'Abschluss bestätigen', sq: 'Konfirmo përfundimin', tr: 'Tamamlanmayı onayla' },
    body: { en: 'Your provider marked the job as finished.', de: 'Dein Anbieter hat den Auftrag als abgeschlossen markiert.', sq: 'Ofruesi e shënoi punën të përfunduar.', tr: 'Hizmet veren işi tamamlandı olarak işaretledi.' },
    template: 'job-awaiting-confirmation',
  },
  'job.completed': {
    title: { en: 'Job completed', de: 'Auftrag abgeschlossen', sq: 'Puna përfundoi', tr: 'İş tamamlandı' },
    body: { en: 'The customer confirmed completion.', de: 'Der Kunde hat den Abschluss bestätigt.', sq: 'Klienti konfirmoi përfundimin.', tr: 'Müşteri tamamlanmayı onayladı.' },
    template: 'job-completed',
  },
  'review.created': {
    title: { en: 'New review', de: 'Neue Bewertung', sq: 'Vlerësim i ri', tr: 'Yeni değerlendirme' },
    body: { en: 'A customer left a review for your service.', de: 'Ein Kunde hat deinen Service bewertet.', sq: 'Një klient la vlerësim për shërbimin tënd.', tr: 'Bir müşteri hizmetin için değerlendirme bıraktı.' },
    template: 'review-created',
  },
  'message.created': {
    title: { en: 'New message', de: 'Neue Nachricht', sq: 'Mesazh i ri', tr: 'Yeni mesaj' },
    body: { en: 'You received a new Helfio message.', de: 'Du hast eine neue Helfio-Nachricht erhalten.', sq: 'Morre një mesazh të ri në Helfio.', tr: 'Yeni bir Helfio mesajı aldın.' },
    template: 'message-created',
  },
}

function localize(value: NotificationTranslations, locale: PreferredLocale) { return value[locale] || value.en }
function eventPayload(event: DomainEvent): DomainEventPayload { return event.payload ?? {} }

export function notificationText(eventType: string) { return translations[eventType] ?? translations['message.created'] }

export async function consumeDomainEvent(event: DomainEvent, push: (subscription: PushSubscriptionInput, payload: { title: string; body: string; conversationId: string }) => Promise<boolean> = notifyPush) {
  const text = notificationText(event.eventType)
  const payload = eventPayload(event)
  const recipients = [...new Set((payload.recipientUserIds ?? []).filter((id): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/.test(id)))]
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const consumed = await client.query(`INSERT INTO event_consumptions (consumer_name, event_id) VALUES ($1, $2)
      ON CONFLICT (consumer_name, event_id) DO NOTHING RETURNING event_id`, [consumerName, event.eventId])
    if (!consumed.rows.length) { await client.query('COMMIT'); return }
    if (recipients.length) {
      await client.query(`INSERT INTO notifications (user_id, event_id, event_type, title, body)
        SELECT recipient, $1, $2, $3::jsonb, $4::jsonb FROM unnest($5::uuid[]) AS recipient
        ON CONFLICT (user_id, event_id) DO NOTHING`, [event.eventId, event.eventType, JSON.stringify(text.title), JSON.stringify(text.body), recipients])
      await client.query(`INSERT INTO email_notification_outbox (event_id, user_id, email, template, payload)
        SELECT $1, u.id, u.email, $2, $3::jsonb FROM users u WHERE u.id = ANY($4::uuid[])
        ON CONFLICT (event_id, user_id, template) DO NOTHING`, [event.eventId, text.template, JSON.stringify(payload), recipients])
    }
    await client.query('COMMIT')
  } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }

  if (event.eventType === 'message.created' && recipients.length) {
    const subscriptions = await pool.query<{ endpoint: string; p256dh: string; auth: string }>(`SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ANY($1::uuid[])`, [recipients])
    const body = typeof payload.messagePreview === 'string' ? payload.messagePreview : text.body.en
    for (const subscription of subscriptions.rows) await push({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, { title: text.title.en, body, conversationId: typeof payload.conversationId === 'string' ? payload.conversationId : event.aggregateId })
  }
}

export async function listNotifications(userId: string, locale: PreferredLocale, limit = 50): Promise<NotificationView[]> {
  const result = await pool.query(`SELECT id, event_id AS "eventId", event_type AS "eventType", title, body, created_at AS "createdAt", read_at AS "readAt"
    FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`, [userId, limit])
  return result.rows.map((row) => ({ id: String(row.id), eventId: String(row.eventId), eventType: String(row.eventType), title: localize(row.title as NotificationTranslations, locale), body: localize(row.body as NotificationTranslations, locale), createdAt: String(row.createdAt), readAt: row.readAt ? String(row.readAt) : null }))
}

export async function getUnreadNotificationCount(userId: string) {
  const result = await pool.query<{ count: number }>('SELECT count(*)::int AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL', [userId])
  return Number(result.rows[0].count)
}

export async function markNotificationRead(id: string, userId: string) {
  const result = await pool.query('UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId])
  return Boolean(result.rows[0])
}

export async function markAllNotificationsRead(userId: string) {
  const result = await pool.query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [userId])
  return result.rowCount ?? 0
}
