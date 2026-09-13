import { chmodSync, existsSync, writeFileSync } from 'node:fs'
import webpush from 'web-push'

const target = '.env.local'
if (existsSync(target)) {
  console.error(`${target} already exists; refusing to overwrite it.`)
  process.exit(1)
}
const keys = webpush.generateVAPIDKeys()
writeFileSync(target, `VAPID_SUBJECT=mailto:security@helfio.local\nVAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\n`, { mode: 0o600 })
chmodSync(target, 0o600)
console.log(`Created ${target} with mode 600. It is ignored by git and must only be loaded by the backend.`)
console.log(`Expose only VAPID_PUBLIC_KEY to the browser build when configuring push subscriptions.`)
