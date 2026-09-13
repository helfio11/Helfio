import webpush from 'web-push'

export interface PushSubscriptionInput { endpoint: string; keys: { p256dh: string; auth: string } }

let configured = false
function configure() {
  if (configured) return true
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim()
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim()
  const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:security@helfio.local'
  if (!publicKey || !privateKey) return false
  webpush.setVapidDetails(subject, publicKey, privateKey)
  configured = true
  return true
}

export function vapidPublicKey() { return process.env.VAPID_PUBLIC_KEY?.trim() || null }

export async function notifyPush(subscription: PushSubscriptionInput, payload: { title: string; body: string; conversationId: string }) {
  if (!configure()) return false
  try {
    await webpush.sendNotification(subscription, JSON.stringify({ ...payload, url: `/inbox/${payload.conversationId}` }))
    return true
  } catch { return false }
}