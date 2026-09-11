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

export type JobStatus = 'DRAFT' | 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
export type BudgetType = 'FIXED' | 'RANGE' | 'NEGOTIABLE'

export interface JobInput {
  categoryId: string
  title: string
  description: string
  city: string
  postalCode: string | null
  countryCode: string
  budgetType: BudgetType
  budgetMin: number | null
  budgetMax: number | null
  currency: string
  preferredDate: string | null
  preferredTimeText: string | null
}

export interface Job extends JobInput {
  id: string
  customerUserId: string
  status: JobStatus
  createdAt: string
  updatedAt: string
  category: CategoryRow
}

const jobSelect = `SELECT j.id, j.customer_user_id AS "customerUserId", j.category_id AS "categoryId",
  j.title, j.description, j.city, j.postal_code AS "postalCode", j.country_code AS "countryCode",
  j.budget_type AS "budgetType", j.budget_min AS "budgetMin", j.budget_max AS "budgetMax", j.currency,
  j.preferred_date AS "preferredDate", j.preferred_time_text AS "preferredTimeText", j.status,
  j.created_at AS "createdAt", j.updated_at AS "updatedAt",
  c.id AS "category_id", c.parent_id AS "category_parent_id", c.slug AS "category_slug", c.status AS "category_status",
  c.icon AS "category_icon", c.sort_order AS "category_sort_order", c.show_in_navigation AS "category_show_in_navigation",
  c.show_on_homepage AS "category_show_on_homepage", c.created_at AS "category_created_at", c.updated_at AS "category_updated_at"
  FROM jobs j JOIN categories c ON c.id = j.category_id`

async function mapJob(row: Record<string, unknown>): Promise<Job> {
  const translations = await pool.query(`SELECT locale, jsonb_build_object('name', name, 'description', description) AS translation FROM category_translations WHERE category_id = $1`, [row.categoryId])
  return {
    id: String(row.id), customerUserId: String(row.customerUserId), categoryId: String(row.categoryId), title: String(row.title),
    description: String(row.description), city: String(row.city), postalCode: row.postalCode ? String(row.postalCode) : null,
    countryCode: String(row.countryCode), budgetType: row.budgetType as BudgetType, budgetMin: row.budgetMin === null ? null : Number(row.budgetMin),
    budgetMax: row.budgetMax === null ? null : Number(row.budgetMax), currency: String(row.currency),
    preferredDate: row.preferredDate ? String(row.preferredDate).slice(0, 10) : null,
    preferredTimeText: row.preferredTimeText ? String(row.preferredTimeText) : null, status: row.status as JobStatus,
    createdAt: String(row.createdAt), updatedAt: String(row.updatedAt), category: {
      id: String(row.category_id), parentId: row.category_parent_id ? String(row.category_parent_id) : null, slug: String(row.category_slug),
      status: row.category_status as 'active' | 'inactive', icon: row.category_icon ? String(row.category_icon) : null, sortOrder: Number(row.category_sort_order),
      showInNavigation: Boolean(row.category_show_in_navigation), showOnHomepage: Boolean(row.category_show_on_homepage), createdAt: String(row.category_created_at),
      updatedAt: String(row.category_updated_at), translations: Object.fromEntries(translations.rows.map((item) => [item.locale, item.translation])),
    },
  }
}

async function findJob(id: string, customerUserId?: string): Promise<Job | null> {
  const values = customerUserId ? [id, customerUserId] : [id]
  const result = await pool.query(`${jobSelect} WHERE j.id = $1${customerUserId ? ' AND j.customer_user_id = $2' : ''}`, values)
  return result.rows[0] ? mapJob(result.rows[0]) : null
}

async function assertActiveCategory(categoryId: string) {
  const result = await pool.query(`SELECT id FROM categories WHERE id = $1 AND status = 'active'`, [categoryId])
  if (!result.rows[0]) throw new Error('Invalid active category')
}

export async function getJobs(customerUserId: string): Promise<Job[]> {
  const result = await pool.query(`${jobSelect} WHERE j.customer_user_id = $1 ORDER BY j.updated_at DESC`, [customerUserId])
  return Promise.all(result.rows.map(mapJob))
}

export async function getJob(id: string, customerUserId?: string): Promise<Job | null> {
  return findJob(id, customerUserId)
}

export async function createJob(customerUserId: string, input: JobInput): Promise<Job> {
  await assertActiveCategory(input.categoryId)
  const result = await pool.query<{ id: string }>(`INSERT INTO jobs
    (customer_user_id, category_id, title, description, city, postal_code, country_code, budget_type, budget_min, budget_max, currency, preferred_date, preferred_time_text)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
  [customerUserId, input.categoryId, input.title, input.description, input.city, input.postalCode, input.countryCode, input.budgetType, input.budgetMin, input.budgetMax, input.currency, input.preferredDate, input.preferredTimeText])
  const job = await findJob(result.rows[0].id, customerUserId)
  if (!job) throw new Error('Job not found after creation')
  return job
}

export async function updateJob(id: string, customerUserId: string, changes: Partial<JobInput>): Promise<Job> {
  if (changes.categoryId !== undefined) await assertActiveCategory(changes.categoryId)
  const fields: string[] = []
  const values: unknown[] = [id, customerUserId]
  for (const key of ['categoryId', 'title', 'description', 'city', 'postalCode', 'countryCode', 'budgetType', 'budgetMin', 'budgetMax', 'currency', 'preferredDate', 'preferredTimeText'] as const) {
    if (changes[key] !== undefined) {
      values.push(changes[key])
      fields.push(`${key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)} = $${values.length}`)
    }
  }
  if (fields.length === 0) {
    const job = await findJob(id, customerUserId)
    if (!job) throw new Error('Job not found')
    return job
  }
  fields.push('updated_at = now()')
  const result = await pool.query(`UPDATE jobs SET ${fields.join(', ')} WHERE id = $1 AND customer_user_id = $2 RETURNING id`, values)
  if (!result.rows[0]) throw new Error('Job not found')
  const job = await findJob(id, customerUserId)
  if (!job) throw new Error('Job not found')
  return job
}

export async function transitionJob(id: string, customerUserId: string, from: JobStatus, to: JobStatus): Promise<Job> {
  const result = await pool.query(`UPDATE jobs SET status = $1, updated_at = now() WHERE id = $2 AND customer_user_id = $3 AND status = $4 RETURNING id`, [to, id, customerUserId, from])
  if (!result.rows[0]) throw new Error('Invalid job transition')
  const job = await findJob(id, customerUserId)
  if (!job) throw new Error('Job not found')
  return job
}