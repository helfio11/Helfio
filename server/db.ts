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

export type AvailabilityStatus = 'AVAILABLE' | 'BUSY' | 'UNAVAILABLE'
export type ProfileVisibility = 'PUBLIC' | 'PRIVATE'
export type VerificationStatus = 'UNVERIFIED' | 'PENDING' | 'VERIFIED'

export interface ProviderProfileInput {
  displayName: string
  description: string
  profileImageRef?: string | null
  phone?: string | null
  contactEmail?: string | null
  city: string
  postalCode: string
  serviceRadiusKm: number
  availabilityStatus: AvailabilityStatus
  yearsExperience: number
  startingPrice?: number | null
  currency: string
  visibility: ProfileVisibility
}

export interface ProviderService { id: string; slug: string; icon: string | null; translations: CategoryRow['translations'] }
export interface ProviderProfile extends ProviderProfileInput {
  userId: string
  verificationStatus: VerificationStatus
  createdAt: string
  updatedAt: string
  services: ProviderService[]
}

function mapProvider(row: Record<string, unknown>, services: ProviderService[]): ProviderProfile {
  return {
    userId: String(row.userId), displayName: String(row.displayName), description: String(row.description ?? ''),
    profileImageRef: row.profileImageRef ? String(row.profileImageRef) : null, phone: row.phone ? String(row.phone) : null,
    contactEmail: row.contactEmail ? String(row.contactEmail) : null, city: String(row.city), postalCode: String(row.postalCode),
    serviceRadiusKm: Number(row.serviceRadiusKm), availabilityStatus: row.availabilityStatus as AvailabilityStatus,
    yearsExperience: Number(row.yearsExperience), startingPrice: row.startingPrice === null ? null : Number(row.startingPrice),
    currency: String(row.currency), visibility: row.visibility as ProfileVisibility,
    verificationStatus: row.verificationStatus as VerificationStatus, createdAt: String(row.createdAt), updatedAt: String(row.updatedAt), services,
  }
}

const providerSelect = `SELECT user_id AS "userId", display_name AS "displayName", description,
  profile_image_ref AS "profileImageRef", phone, contact_email AS "contactEmail", city, postal_code AS "postalCode",
  service_radius_km AS "serviceRadiusKm", availability_status AS "availabilityStatus", years_experience AS "yearsExperience",
  starting_price AS "startingPrice", currency, visibility, verification_status AS "verificationStatus",
  created_at AS "createdAt", updated_at AS "updatedAt" FROM provider_profiles`

async function providerServices(userId: string): Promise<ProviderService[]> {
  const result = await pool.query<ProviderService>(`SELECT c.id, c.slug, c.icon,
    COALESCE(jsonb_object_agg(t.locale, jsonb_build_object('name', t.name, 'description', t.description))
      FILTER (WHERE t.locale IS NOT NULL), '{}') AS translations
    FROM provider_services ps JOIN categories c ON c.id = ps.category_id
    LEFT JOIN category_translations t ON t.category_id = c.id
    WHERE ps.provider_user_id = $1 GROUP BY c.id ORDER BY c.sort_order, c.slug`, [userId])
  return result.rows
}

export async function getProviderProfile(userId: string): Promise<ProviderProfile | null> {
  const result = await pool.query(`${providerSelect} WHERE user_id = $1`, [userId])
  return result.rows[0] ? mapProvider(result.rows[0], await providerServices(userId)) : null
}

export async function saveProviderProfile(userId: string, input: ProviderProfileInput): Promise<ProviderProfile> {
  const upsert = await pool.query(`INSERT INTO provider_profiles
    (user_id, display_name, description, profile_image_ref, phone, contact_email, city, postal_code, service_radius_km,
     availability_status, years_experience, starting_price, currency, visibility)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    ON CONFLICT (user_id) DO UPDATE SET display_name = EXCLUDED.display_name, description = EXCLUDED.description,
      profile_image_ref = EXCLUDED.profile_image_ref, phone = EXCLUDED.phone, contact_email = EXCLUDED.contact_email,
      city = EXCLUDED.city, postal_code = EXCLUDED.postal_code, service_radius_km = EXCLUDED.service_radius_km,
      availability_status = EXCLUDED.availability_status, years_experience = EXCLUDED.years_experience,
      starting_price = EXCLUDED.starting_price, currency = EXCLUDED.currency, visibility = EXCLUDED.visibility, updated_at = now()
    RETURNING user_id AS "userId", display_name AS "displayName", description, profile_image_ref AS "profileImageRef",
      phone, contact_email AS "contactEmail", city, postal_code AS "postalCode", service_radius_km AS "serviceRadiusKm",
      availability_status AS "availabilityStatus", years_experience AS "yearsExperience", starting_price AS "startingPrice",
      currency, visibility, verification_status AS "verificationStatus", created_at AS "createdAt", updated_at AS "updatedAt"`,
  [userId, input.displayName, input.description, input.profileImageRef ?? null, input.phone ?? null, input.contactEmail ?? null,
    input.city, input.postalCode, input.serviceRadiusKm, input.availabilityStatus, input.yearsExperience, input.startingPrice ?? null,
    input.currency, input.visibility])
  return mapProvider(upsert.rows[0], await providerServices(userId))
}

export async function setProviderServices(userId: string, categoryIds: string[]): Promise<ProviderProfile> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const valid = await client.query<{ id: string }>(`SELECT id FROM categories WHERE id = ANY($1::uuid[]) AND status = 'active'`, [categoryIds])
    if (valid.rowCount !== categoryIds.length) throw new Error('Invalid provider service category')
    await client.query('DELETE FROM provider_services WHERE provider_user_id = $1', [userId])
    if (categoryIds.length) await client.query(`INSERT INTO provider_services (provider_user_id, category_id) SELECT $1, unnest($2::uuid[])`, [userId, categoryIds])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { client.release() }
  const profile = await getProviderProfile(userId)
  if (!profile) throw new Error('Provider profile not found')
  return profile
}

export async function getPublicProviders(): Promise<ProviderProfile[]> {
  const result = await pool.query(`${providerSelect} WHERE visibility = 'PUBLIC' ORDER BY updated_at DESC LIMIT 24`)
  return Promise.all(result.rows.map((row) => providerServices(String(row.userId)).then((services) => mapProvider(row, services))))
}

export async function getPublicProvider(userId: string): Promise<ProviderProfile | null> {
  const result = await pool.query(`${providerSelect} WHERE user_id = $1 AND visibility = 'PUBLIC'`, [userId])
  return result.rows[0] ? mapProvider(result.rows[0], await providerServices(userId)) : null
}