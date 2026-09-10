import pg from 'pg'
import type { CategoryRow } from './categories.js'
import type { AuthenticatedIdentity } from './auth.js'

const { Pool } = pg
export const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const categorySelect = `
  SELECT c.id, c.parent_id AS "parentId", c.slug, c.status, c.icon,
         c.sort_order AS "sortOrder", c.show_in_navigation AS "showInNavigation",
         c.show_on_homepage AS "showOnHomepage",
         c.created_at AS "createdAt", c.updated_at AS "updatedAt",
         COALESCE(jsonb_object_agg(t.locale, jsonb_build_object('name', t.name, 'description', t.description))
           FILTER (WHERE t.locale IS NOT NULL), '{}') AS translations
  FROM categories c
  LEFT JOIN category_translations t ON t.category_id = c.id
`

export async function getCategories(filter = ''): Promise<CategoryRow[]> {
  const result = await pool.query<CategoryRow>(`${categorySelect} ${filter} GROUP BY c.id ORDER BY c.sort_order, c.slug`)
  return result.rows
}

export async function closeDatabase() {
  await pool.end()
}

export type AccountStatus = 'ACTIVE' | 'SUSPENDED' | 'DISABLED'
export type PreferredLocale = 'en' | 'de' | 'sq' | 'tr'

export interface UserAccount {
  id: string
  keycloakSubjectId: string
  email: string | null
  displayName: string | null
  preferredLocale: PreferredLocale
  accountStatus: AccountStatus
  createdAt: string
  updatedAt: string
}

function mapUser(row: Record<string, unknown>): UserAccount {
  return {
    id: String(row.id), keycloakSubjectId: String(row.keycloakSubjectId), email: row.email ? String(row.email) : null,
    displayName: row.displayName ? String(row.displayName) : null, preferredLocale: row.preferredLocale as PreferredLocale,
    accountStatus: row.accountStatus as AccountStatus, createdAt: String(row.createdAt), updatedAt: String(row.updatedAt),
  }
}

const userSelect = `SELECT id, keycloak_subject_id AS "keycloakSubjectId", email, display_name AS "displayName",
  preferred_locale AS "preferredLocale", account_status AS "accountStatus", created_at AS "createdAt", updated_at AS "updatedAt"
  FROM users`

export async function findOrCreateUser(identity: AuthenticatedIdentity): Promise<UserAccount> {
  const created = await pool.query(`INSERT INTO users (keycloak_subject_id, email, display_name)
    VALUES ($1, $2, $3)
    ON CONFLICT (keycloak_subject_id) DO UPDATE SET email = EXCLUDED.email, display_name = EXCLUDED.display_name
    RETURNING id, keycloak_subject_id AS "keycloakSubjectId", email, display_name AS "displayName",
      preferred_locale AS "preferredLocale", account_status AS "accountStatus", created_at AS "createdAt", updated_at AS "updatedAt"`, [identity.subject, identity.email, identity.displayName])
  return mapUser(created.rows[0])
}

export async function updateUserAccount(id: string, changes: { displayName?: string | null; preferredLocale?: PreferredLocale }): Promise<UserAccount> {
  const fields: string[] = []
  const values: unknown[] = [id]
  if (changes.displayName !== undefined) {
    values.push(changes.displayName)
    fields.push(`display_name = $${values.length}`)
  }
  if (changes.preferredLocale !== undefined) {
    values.push(changes.preferredLocale)
    fields.push(`preferred_locale = $${values.length}`)
  }
  if (fields.length > 0) fields.push('updated_at = now()')
  if (fields.length === 0) {
    const unchanged = await pool.query(`${userSelect} WHERE id = $1`, values)
    if (!unchanged.rows[0]) throw new Error('User not found')
    return mapUser(unchanged.rows[0])
  }
  const updated = await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = $1 RETURNING id, keycloak_subject_id AS "keycloakSubjectId", email, display_name AS "displayName", preferred_locale AS "preferredLocale", account_status AS "accountStatus", created_at AS "createdAt", updated_at AS "updatedAt"`, values)
  if (!updated.rows[0]) throw new Error('User not found')
  return mapUser(updated.rows[0])
}