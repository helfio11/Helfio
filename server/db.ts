import pg from 'pg'
import type { CategoryRow } from './categories.js'
import type { AuthenticatedIdentity } from './auth.js'
import { appendDomainEvent, type DomainEventType, type SqlClient } from './events.js'

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

export async function checkDatabaseHealth() {
  await pool.query('SELECT 1')
  return true
}

async function withTransaction<T>(callback: (client: SqlClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await callback(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { client.release() }
}

async function appendEvent(client: SqlClient, eventType: DomainEventType, aggregateId: string, payload: Record<string, unknown>) {
  await appendDomainEvent(client, eventType, aggregateId, payload)
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
  anonymizedAt?: string | null
}

function mapUser(row: Record<string, unknown>): UserAccount {
  return {
    id: String(row.id), keycloakSubjectId: String(row.keycloakSubjectId), email: row.email ? String(row.email) : null,
    displayName: row.displayName ? String(row.displayName) : null, preferredLocale: row.preferredLocale as PreferredLocale,
    accountStatus: row.accountStatus as AccountStatus, createdAt: String(row.createdAt), updatedAt: String(row.updatedAt), anonymizedAt: row.anonymizedAt ? String(row.anonymizedAt) : null,
  }
}

const userSelect = `SELECT id, keycloak_subject_id AS "keycloakSubjectId", email, display_name AS "displayName",
  preferred_locale AS "preferredLocale", account_status AS "accountStatus", anonymized_at AS "anonymizedAt", created_at AS "createdAt", updated_at AS "updatedAt"
  FROM users`

export async function findOrCreateUser(identity: AuthenticatedIdentity): Promise<UserAccount> {
  const created = await pool.query(`INSERT INTO users (keycloak_subject_id, email, display_name)
    VALUES ($1, $2, $3)
    ON CONFLICT (keycloak_subject_id) DO UPDATE SET email = CASE WHEN users.anonymized_at IS NULL THEN EXCLUDED.email ELSE users.email END,
      display_name = CASE WHEN users.anonymized_at IS NULL THEN EXCLUDED.display_name ELSE users.display_name END
    RETURNING id, keycloak_subject_id AS "keycloakSubjectId", email, display_name AS "displayName",
      preferred_locale AS "preferredLocale", account_status AS "accountStatus", anonymized_at AS "anonymizedAt", created_at AS "createdAt", updated_at AS "updatedAt"`, [identity.subject, identity.email, identity.displayName])
  return mapUser(created.rows[0])
}

export async function anonymizeUserAccount(id: string): Promise<UserAccount> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await client.query(`UPDATE users SET email = NULL, display_name = 'Deleted user', account_status = 'DISABLED', anonymized_at = COALESCE(anonymized_at, now()), updated_at = now() WHERE id = $1 RETURNING id`, [id])
    if (!result.rows[0]) throw new Error('User not found')
    await client.query(`UPDATE provider_profiles SET display_name = 'Deleted provider', description = '', profile_image_ref = NULL,
      phone = NULL, contact_email = NULL, visibility = 'PRIVATE', verification_status = 'UNVERIFIED', updated_at = now() WHERE user_id = $1`, [id])
    await client.query('DELETE FROM provider_services WHERE provider_user_id = $1', [id])
    await client.query('DELETE FROM push_subscriptions WHERE user_id = $1', [id])
    await client.query('DELETE FROM ai_conversations WHERE user_id = $1', [id])
    await client.query('COMMIT')
  } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
  const account = await pool.query(`${userSelect} WHERE id = $1`, [id])
  return mapUser(account.rows[0])
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
  rating?: RatingSummary
}

export interface RatingSummary { averageRating: number | null; reviewCount: number }
export interface Review { id: string; jobId: string; providerUserId: string; rating: number; comment: string | null; reviewerDisplayName: string | null; createdAt: string; updatedAt: string }
export interface ReviewInput { rating: number; comment: string | null }

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
  return result.rows[0] ? { ...mapProvider(result.rows[0], await providerServices(userId)), rating: await getProviderRating(userId) } : null
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
  return Promise.all(result.rows.map(async (row) => {
    const userId = String(row.userId)
    return { ...mapProvider(row, await providerServices(userId)), rating: await getProviderRating(userId) }
  }))
}

export async function getPublicProvider(userId: string): Promise<ProviderProfile | null> {
  const result = await pool.query(`${providerSelect} WHERE user_id = $1 AND visibility = 'PUBLIC'`, [userId])
  return result.rows[0] ? { ...mapProvider(result.rows[0], await providerServices(userId)), rating: await getProviderRating(userId) } : null
}

export async function getProviderRating(providerUserId: string): Promise<RatingSummary> {
  const result = await pool.query<{ averageRating: number | null; reviewCount: number }>(`SELECT ROUND(AVG(rating)::numeric, 1)::float AS "averageRating", count(*)::int AS "reviewCount" FROM reviews WHERE provider_user_id = $1 AND moderation_status = 'VISIBLE'`, [providerUserId])
  return { averageRating: result.rows[0].averageRating, reviewCount: Number(result.rows[0].reviewCount) }
}

function mapReview(row: Record<string, unknown>): Review {
  return { id: String(row.id), jobId: String(row.jobId), providerUserId: String(row.providerUserId), rating: Number(row.rating), comment: row.comment === null ? null : String(row.comment), reviewerDisplayName: row.reviewerDisplayName ? String(row.reviewerDisplayName) : null, createdAt: String(row.createdAt), updatedAt: String(row.updatedAt) }
}

export async function createReview(customerUserId: string, jobId: string, input: ReviewInput): Promise<Review> {
  let inserted: { id: string; providerUserId: string }
  try {
    inserted = await withTransaction(async (client) => {
      const result = await client.query<{ id: string; providerUserId: string }>(`INSERT INTO reviews (job_id, customer_user_id, provider_user_id, rating, comment)
        SELECT j.id, j.customer_user_id, j.assigned_provider_user_id, $3, $4 FROM jobs j
        WHERE j.id = $1 AND j.customer_user_id = $2 AND j.status = 'COMPLETED'
          AND j.assigned_provider_user_id IS NOT NULL AND j.assigned_provider_user_id <> j.customer_user_id
        RETURNING id, provider_user_id AS "providerUserId"`, [jobId, customerUserId, input.rating, input.comment])
      if (!result.rows[0]) throw new Error('Review not allowed')
      await appendEvent(client, 'review.created', String(result.rows[0].id), { jobId, providerUserId: result.rows[0].providerUserId, recipientUserIds: [result.rows[0].providerUserId] })
      return result.rows[0]
    })
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') throw new Error('Duplicate review')
    throw error
  }
  const result = await pool.query(`SELECT r.id, r.job_id AS "jobId", r.provider_user_id AS "providerUserId", r.rating, r.comment,
    u.display_name AS "reviewerDisplayName", r.created_at AS "createdAt", r.updated_at AS "updatedAt"
    FROM reviews r JOIN users u ON u.id = r.customer_user_id WHERE r.id = $1`, [inserted.id])
  return mapReview(result.rows[0])
}

export async function getProviderReviews(providerUserId: string): Promise<Review[]> {
  const result = await pool.query(`SELECT r.id, r.job_id AS "jobId", r.provider_user_id AS "providerUserId", r.rating, r.comment,
    u.display_name AS "reviewerDisplayName", r.created_at AS "createdAt", r.updated_at AS "updatedAt"
    FROM reviews r JOIN users u ON u.id = r.customer_user_id WHERE r.provider_user_id = $1 AND r.moderation_status = 'VISIBLE' ORDER BY r.created_at DESC`, [providerUserId])
  return result.rows.map(mapReview)
}

export type SearchKind = 'all' | 'providers' | 'jobs' | 'categories'
export type SearchSort = 'relevance' | 'newest' | 'price'
export interface SearchInput { kind: SearchKind; query: string; category: string | null; city: string | null; availability: AvailabilityStatus | null; minPrice: number | null; maxPrice: number | null; minRating?: number | null; sort: SearchSort; page: number; pageSize: number }
export interface SearchPage<T> { items: T[]; page: number; pageSize: number; total: number; hasNext: boolean }
export interface SearchResults { providers: SearchPage<PublicProviderProfile>; jobs: SearchPage<Job>; categories: SearchPage<CategoryRow> }

function pageOf<T>(items: T[], page: number, pageSize: number): SearchPage<T> {
  const start = (page - 1) * pageSize
  return { items: items.slice(start, start + pageSize), page, pageSize, total: items.length, hasNext: start + pageSize < items.length }
}

function searchTerm(input: SearchInput) { return input.query ? `%${input.query.replace(/[\\%_]/g, (value) => `\\${value}`)}%` : null }

export async function searchMarketplace(input: SearchInput): Promise<SearchResults> {
  const term = searchTerm(input)
  const providers: PublicProviderProfile[] = []
  if (input.kind === 'all' || input.kind === 'providers') {
    const values: unknown[] = []; const filters = ["p.visibility = 'PUBLIC'"]
    if (term) { values.push(term); filters.push(`(p.display_name ILIKE $${values.length} OR p.description ILIKE $${values.length} OR p.city ILIKE $${values.length})`) }
    if (input.city) { values.push(`%${input.city}%`); filters.push(`p.city ILIKE $${values.length}`) }
    if (input.category) { values.push(input.category); filters.push(`EXISTS (SELECT 1 FROM provider_services ps JOIN categories pc ON pc.id = ps.category_id WHERE ps.provider_user_id = p.user_id AND (pc.id::text = $${values.length} OR pc.slug = $${values.length}))`) }
    if (input.availability) { values.push(input.availability); filters.push(`p.availability_status = $${values.length}`) }
    if (input.minPrice !== null) { values.push(input.minPrice); filters.push(`p.starting_price >= $${values.length}`) }
    if (input.maxPrice !== null) { values.push(input.maxPrice); filters.push(`p.starting_price IS NULL OR p.starting_price <= $${values.length}`) }
    if (input.minRating !== null && input.minRating !== undefined) { values.push(input.minRating); filters.push(`COALESCE((SELECT AVG(r.rating) FROM reviews r WHERE r.provider_user_id = p.user_id), 0) >= $${values.length}`) }
    const order = input.sort === 'price' ? 'p.starting_price NULLS LAST, p.updated_at DESC' : 'p.updated_at DESC'
    const result = await pool.query(`${providerSelect} p WHERE ${filters.join(' AND ')} ORDER BY ${order}`, values)
    for (const row of result.rows) {
      const userId = String(row.userId)
      providers.push(publicProvider({ ...mapProvider(row, await providerServices(userId)), rating: await getProviderRating(userId) })!)
    }
  }
  const jobs: Job[] = []
  if (input.kind === 'all' || input.kind === 'jobs') {
    const values: unknown[] = [input.query ? term : null]; const filters = ["j.status = 'OPEN'"]
    if (term) filters.push(`(j.title ILIKE $1 OR j.description ILIKE $1 OR j.city ILIKE $1 OR c.slug ILIKE $1)`)
    else values.length = 0
    if (input.city) { values.push(`%${input.city}%`); filters.push(`j.city ILIKE $${values.length}`) }
    if (input.category) { values.push(input.category); filters.push(`(j.category_id::text = $${values.length} OR c.slug = $${values.length})`) }
    if (input.minPrice !== null) { values.push(input.minPrice); filters.push(`COALESCE(j.budget_max, j.budget_min, 0) >= $${values.length}`) }
    if (input.maxPrice !== null) { values.push(input.maxPrice); filters.push(`COALESCE(j.budget_min, j.budget_max, 0) <= $${values.length}`) }
    const order = input.sort === 'price' ? 'COALESCE(j.budget_min, j.budget_max) NULLS LAST, j.updated_at DESC' : 'j.updated_at DESC'
    const result = await pool.query(`${jobSelect} WHERE ${filters.join(' AND ')} ORDER BY ${order}`, values)
    jobs.push(...await Promise.all(result.rows.map(mapJob)))
  }
  const categories: CategoryRow[] = []
  if (input.kind === 'all' || input.kind === 'categories') {
    const escapedCategory = input.category?.replace(/'/g, "''")
    const categoryFilter = escapedCategory ? ` AND (c.id::text = '${escapedCategory}' OR c.slug = '${escapedCategory}')` : ''
    const filter = term ? `WHERE c.status = 'active'${categoryFilter} AND (c.slug ILIKE '${term.replace(/'/g, "''")}' OR EXISTS (SELECT 1 FROM category_translations ct WHERE ct.category_id = c.id AND (ct.name ILIKE '${term.replace(/'/g, "''")}' OR ct.description ILIKE '${term.replace(/'/g, "''")}')))` : `WHERE c.status = 'active'${categoryFilter}`
    categories.push(...await getCategories(filter))
  }
  return { providers: pageOf(providers, input.page, input.pageSize), jobs: pageOf(jobs, input.page, input.pageSize), categories: pageOf(categories, input.page, input.pageSize) }
}

export type JobStatus = 'DRAFT' | 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'AWAITING_CONFIRMATION' | 'COMPLETED' | 'CANCELLED'
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
  assignedProviderUserId: string | null
  status: JobStatus
  createdAt: string
  updatedAt: string
  assignedAt: string | null
  startedAt: string | null
  finishedAt: string | null
  completedAt: string | null
  cancelledAt: string | null
  category: CategoryRow
}

const jobSelect = `SELECT j.id, j.customer_user_id AS "customerUserId", j.category_id AS "categoryId",
  j.title, j.description, j.city, j.postal_code AS "postalCode", j.country_code AS "countryCode",
  j.budget_type AS "budgetType", j.budget_min AS "budgetMin", j.budget_max AS "budgetMax", j.currency,
  j.preferred_date AS "preferredDate", j.preferred_time_text AS "preferredTimeText", j.status,
  j.assigned_provider_user_id AS "assignedProviderUserId", j.created_at AS "createdAt", j.updated_at AS "updatedAt",
  j.assigned_at AS "assignedAt", j.started_at AS "startedAt", j.finished_at AS "finishedAt", j.completed_at AS "completedAt", j.cancelled_at AS "cancelledAt",
  c.id AS "category_id", c.parent_id AS "category_parent_id", c.slug AS "category_slug", c.status AS "category_status",
  c.icon AS "category_icon", c.sort_order AS "category_sort_order", c.show_in_navigation AS "category_show_in_navigation",
  c.show_on_homepage AS "category_show_on_homepage", c.created_at AS "category_created_at", c.updated_at AS "category_updated_at"
  FROM jobs j JOIN categories c ON c.id = j.category_id`

async function mapJob(row: Record<string, unknown>): Promise<Job> {
  const translations = await pool.query(`SELECT locale, jsonb_build_object('name', name, 'description', description) AS translation FROM category_translations WHERE category_id = $1`, [row.categoryId])
  return {
    id: String(row.id), customerUserId: String(row.customerUserId), assignedProviderUserId: row.assignedProviderUserId ? String(row.assignedProviderUserId) : null, categoryId: String(row.categoryId), title: String(row.title),
    description: String(row.description), city: String(row.city), postalCode: row.postalCode ? String(row.postalCode) : null,
    countryCode: String(row.countryCode), budgetType: row.budgetType as BudgetType, budgetMin: row.budgetMin === null ? null : Number(row.budgetMin),
    budgetMax: row.budgetMax === null ? null : Number(row.budgetMax), currency: String(row.currency),
    preferredDate: row.preferredDate ? String(row.preferredDate).slice(0, 10) : null,
    preferredTimeText: row.preferredTimeText ? String(row.preferredTimeText) : null, status: row.status as JobStatus,
    createdAt: String(row.createdAt), updatedAt: String(row.updatedAt), assignedAt: row.assignedAt ? String(row.assignedAt) : null,
    startedAt: row.startedAt ? String(row.startedAt) : null, finishedAt: row.finishedAt ? String(row.finishedAt) : null,
    completedAt: row.completedAt ? String(row.completedAt) : null,
    cancelledAt: row.cancelledAt ? String(row.cancelledAt) : null, category: {
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

export async function getAssignedJobs(providerUserId: string): Promise<Job[]> {
  const result = await pool.query(`${jobSelect} WHERE j.assigned_provider_user_id = $1 ORDER BY j.updated_at DESC`, [providerUserId])
  return Promise.all(result.rows.map(mapJob))
}

export async function getJob(id: string, customerUserId?: string): Promise<Job | null> {
  return findJob(id, customerUserId)
}

export async function createJob(customerUserId: string, input: JobInput): Promise<Job> {
  const jobId = await withTransaction(async (client) => {
    const category = await client.query(`SELECT id FROM categories WHERE id = $1 AND status = 'active'`, [input.categoryId])
    if (!category.rows[0]) throw new Error('Invalid active category')
    const result = await client.query<{ id: string }>(`INSERT INTO jobs
      (customer_user_id, category_id, title, description, city, postal_code, country_code, budget_type, budget_min, budget_max, currency, preferred_date, preferred_time_text)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
    [customerUserId, input.categoryId, input.title, input.description, input.city, input.postalCode, input.countryCode, input.budgetType, input.budgetMin, input.budgetMax, input.currency, input.preferredDate, input.preferredTimeText])
    await appendEvent(client, 'job.created', String(result.rows[0].id), { customerUserId, recipientUserIds: [customerUserId] })
    return result.rows[0].id
  })
  const job = await findJob(jobId, customerUserId)
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
  const allowed = (from === 'DRAFT' && to === 'OPEN') || (to === 'CANCELLED' && (from === 'DRAFT' || from === 'OPEN' || from === 'ASSIGNED'))
  if (!allowed) throw new Error('Invalid job transition')
  await withTransaction(async (client) => {
    const result = await client.query(`UPDATE jobs SET status = $1, cancelled_at = CASE WHEN $1 = 'CANCELLED' THEN now() ELSE cancelled_at END, updated_at = now()
      WHERE id = $2 AND customer_user_id = $3 AND status = $4 AND status <> 'COMPLETED' RETURNING id`, [to, id, customerUserId, from])
    if (!result.rows[0]) throw new Error('Invalid job transition')
    if (to === 'OPEN') await appendEvent(client, 'job.published', id, { customerUserId, title: 'job', recipientUserIds: [customerUserId] })
  })
  const job = await findJob(id, customerUserId)
  if (!job) throw new Error('Job not found')
  return job
}

export async function startJob(id: string, providerUserId: string): Promise<Job> {
  await withTransaction(async (client) => {
    const result = await client.query(`UPDATE jobs SET status = 'IN_PROGRESS', started_at = now(), updated_at = now()
      WHERE id = $1 AND assigned_provider_user_id = $2 AND status = 'ASSIGNED' RETURNING id, customer_user_id AS "customerUserId"`, [id, providerUserId])
    if (!result.rows[0]) throw new Error('Invalid job transition')
    await appendEvent(client, 'job.started', id, { customerUserId: result.rows[0].customerUserId, providerUserId, recipientUserIds: [String(result.rows[0].customerUserId)] })
  })
  const job = await findJob(id)
  if (!job) throw new Error('Job not found')
  return job
}

export async function finishJob(id: string, providerUserId: string): Promise<Job> {
  await withTransaction(async (client) => {
    const result = await client.query(`UPDATE jobs SET status = 'AWAITING_CONFIRMATION', finished_at = now(), updated_at = now()
      WHERE id = $1 AND assigned_provider_user_id = $2 AND status = 'IN_PROGRESS' RETURNING id, customer_user_id AS "customerUserId"`, [id, providerUserId])
    if (!result.rows[0]) throw new Error('Invalid job transition')
    await appendEvent(client, 'job.awaiting_confirmation', id, { customerUserId: result.rows[0].customerUserId, providerUserId, recipientUserIds: [String(result.rows[0].customerUserId)] })
  })
  const job = await findJob(id)
  if (!job) throw new Error('Job not found')
  return job
}

export async function confirmJob(id: string, customerUserId: string): Promise<Job> {
  await withTransaction(async (client) => {
    const result = await client.query(`UPDATE jobs SET status = 'COMPLETED', completed_at = now(), updated_at = now()
      WHERE id = $1 AND customer_user_id = $2 AND status = 'AWAITING_CONFIRMATION' RETURNING id, assigned_provider_user_id AS "providerUserId"`, [id, customerUserId])
    if (!result.rows[0]) throw new Error('Invalid job transition')
    await appendEvent(client, 'job.completed', id, { customerUserId, providerUserId: result.rows[0].providerUserId, recipientUserIds: [String(result.rows[0].providerUserId)] })
  })
  const job = await findJob(id, customerUserId)
  if (!job) throw new Error('Job not found')
  return job
}

export type OfferStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN'
export interface OfferInput { price: number; currency: string; message: string; estimatedDuration?: string | null; availableFrom?: string | null }
export interface PublicProviderProfile {
  userId: string
  displayName: string
  description: string
  profileImageRef: string | null
  city: string
  postalCode: string
  serviceRadiusKm: number
  availabilityStatus: AvailabilityStatus
  yearsExperience: number
  startingPrice: number | null
  currency: string
  services: ProviderService[]
  rating?: RatingSummary
}
export interface Offer extends OfferInput { id: string; jobId: string; providerUserId: string; provider: PublicProviderProfile | null; status: OfferStatus; createdAt: string; updatedAt: string }

function publicProvider(profile: ProviderProfile | null): PublicProviderProfile | null {
  if (!profile) return null
  return {
    userId: profile.userId, displayName: profile.displayName, description: profile.description,
    profileImageRef: profile.profileImageRef ?? null, city: profile.city, postalCode: profile.postalCode,
    serviceRadiusKm: profile.serviceRadiusKm, availabilityStatus: profile.availabilityStatus,
    yearsExperience: profile.yearsExperience, startingPrice: profile.startingPrice ?? null,
    currency: profile.currency, services: profile.services, rating: profile.rating,
  }
}

function mapOffer(row: Record<string, unknown>, provider: PublicProviderProfile | null): Offer {
  return { id: String(row.id), jobId: String(row.jobId), providerUserId: String(row.providerUserId), price: Number(row.price), currency: String(row.currency), message: String(row.message), estimatedDuration: row.estimatedDuration ? String(row.estimatedDuration) : null, availableFrom: row.availableFrom ? String(row.availableFrom).slice(0, 10) : null, status: row.status as OfferStatus, createdAt: String(row.createdAt), updatedAt: String(row.updatedAt), provider }
}

const offerSelect = `SELECT o.id, o.job_id AS "jobId", o.provider_user_id AS "providerUserId", o.price,
  o.currency, o.message, o.estimated_duration AS "estimatedDuration", o.available_from AS "availableFrom",
  o.status, o.created_at AS "createdAt", o.updated_at AS "updatedAt" FROM offers o`

async function hydrateOffers(rows: Record<string, unknown>[]): Promise<Offer[]> {
  return Promise.all(rows.map(async (row) => mapOffer(row, publicProvider(await getPublicProvider(String(row.providerUserId))))))
}

export async function getOpenJobsForProvider(categoryId?: string, city?: string): Promise<Job[]> {
  const values: unknown[] = []
  const filters = ["j.status = 'OPEN'"]
  if (categoryId) { values.push(categoryId); filters.push(`j.category_id = $${values.length}`) }
  if (city) { values.push(`%${city}%`); filters.push(`j.city ILIKE $${values.length}`) }
  const result = await pool.query(`${jobSelect} WHERE ${filters.join(' AND ')} ORDER BY j.updated_at DESC LIMIT 100`, values)
  return Promise.all(result.rows.map(mapJob))
}

export async function getOffersForJob(jobId: string): Promise<Offer[]> {
  const result = await pool.query(`${offerSelect} WHERE o.job_id = $1 ORDER BY o.created_at`, [jobId])
  return hydrateOffers(result.rows)
}

export async function getOffersForProvider(providerUserId: string): Promise<Offer[]> {
  const result = await pool.query(`${offerSelect} WHERE o.provider_user_id = $1 ORDER BY o.updated_at DESC`, [providerUserId])
  return hydrateOffers(result.rows)
}

export async function createOffer(jobId: string, providerUserId: string, input: OfferInput): Promise<Offer> {
  let inserted: { id: string; customerUserId: string }
  try {
    inserted = await withTransaction(async (client) => {
      const result = await client.query<{ id: string; customerUserId: string }>(`INSERT INTO offers (job_id, provider_user_id, price, currency, message, estimated_duration, available_from)
        SELECT $1, $2, $3, $4, $5, $6, $7 FROM jobs j JOIN provider_profiles p ON p.user_id = $2
        WHERE j.id = $1 AND j.status = 'OPEN' AND j.customer_user_id <> $2
        RETURNING id, (SELECT customer_user_id FROM jobs WHERE id = $1) AS "customerUserId"`, [jobId, providerUserId, input.price, input.currency, input.message, input.estimatedDuration ?? null, input.availableFrom ?? null])
      if (!result.rows[0]) throw new Error('Offer cannot be submitted')
      await appendEvent(client, 'offer.created', String(result.rows[0].id), { jobId, providerUserId, customerUserId: result.rows[0].customerUserId, recipientUserIds: [String(result.rows[0].customerUserId)] })
      return result.rows[0]
    })
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') throw new Error('Duplicate active offer')
    throw error
  }
  const offer = await pool.query(`${offerSelect} WHERE o.id = $1`, [inserted.id])
  return (await hydrateOffers(offer.rows))[0]
}

export async function updateOffer(id: string, providerUserId: string, input: Partial<OfferInput>): Promise<Offer> {
  const fields: string[] = ['updated_at = now()']; const values: unknown[] = [id, providerUserId]
  for (const key of ['price', 'currency', 'message', 'estimatedDuration', 'availableFrom'] as const) {
    if (input[key] !== undefined) { values.push(input[key]); fields.push(`${key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)} = $${values.length}`) }
  }
  const result = await pool.query(`UPDATE offers SET ${fields.join(', ')} WHERE id = $1 AND provider_user_id = $2 AND status = 'PENDING' RETURNING id`, values)
  if (!result.rows[0]) throw new Error('Offer cannot be edited')
  const offer = await pool.query(`${offerSelect} WHERE o.id = $1`, [id]); return (await hydrateOffers(offer.rows))[0]
}

export async function withdrawOffer(id: string, providerUserId: string): Promise<Offer> {
  const result = await pool.query(`UPDATE offers SET status = 'WITHDRAWN', updated_at = now() WHERE id = $1 AND provider_user_id = $2 AND status = 'PENDING' RETURNING id`, [id, providerUserId])
  if (!result.rows[0]) throw new Error('Offer cannot be withdrawn')
  const offer = await pool.query(`${offerSelect} WHERE o.id = $1`, [id]); return (await hydrateOffers(offer.rows))[0]
}

export async function transitionOffer(id: string, customerUserId: string, next: 'ACCEPTED' | 'REJECTED'): Promise<Offer> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const current = await client.query(`SELECT o.id, o.job_id, o.provider_user_id FROM offers o JOIN jobs j ON j.id = o.job_id WHERE o.id = $1 AND j.customer_user_id = $2 FOR UPDATE`, [id, customerUserId])
    if (!current.rows[0]) throw new Error('Offer ownership required')
    if (next === 'ACCEPTED') {
      const openJob = await client.query(`SELECT id FROM jobs WHERE id = $1 AND status = 'OPEN' FOR UPDATE`, [current.rows[0].job_id])
      if (!openJob.rows[0]) throw new Error('Invalid offer transition')
      const updated = await client.query(`UPDATE offers SET status = 'ACCEPTED', updated_at = now() WHERE id = $1 AND status = 'PENDING' RETURNING id`, [id])
      if (!updated.rows[0]) throw new Error('Invalid offer transition')
      await client.query(`UPDATE offers SET status = 'REJECTED', updated_at = now() WHERE job_id = $1 AND id <> $2 AND status = 'PENDING'`, [current.rows[0].job_id, id])
      await client.query(`UPDATE jobs SET status = 'ASSIGNED', assigned_provider_user_id = $2, assigned_at = now(), updated_at = now()
        WHERE id = $1 AND status = 'OPEN'`, [current.rows[0].job_id, current.rows[0].provider_user_id])
      await appendEvent(client, 'offer.accepted', String(current.rows[0].id), { jobId: current.rows[0].job_id, providerUserId: current.rows[0].provider_user_id, customerUserId, recipientUserIds: [String(current.rows[0].provider_user_id)] })
      await appendEvent(client, 'job.assigned', String(current.rows[0].job_id), { jobId: current.rows[0].job_id, providerUserId: current.rows[0].provider_user_id, customerUserId, recipientUserIds: [String(current.rows[0].provider_user_id)] })
    } else {
      const updated = await client.query(`UPDATE offers SET status = 'REJECTED', updated_at = now() WHERE id = $1 AND status = 'PENDING' RETURNING id`, [id])
      if (!updated.rows[0]) throw new Error('Invalid offer transition')
    }
    await client.query('COMMIT')
  } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
  const offer = await pool.query(`${offerSelect} WHERE o.id = $1`, [id]); return (await hydrateOffers(offer.rows))[0]
}

export interface AiMessage { role: 'user' | 'assistant'; content: string; createdAt: string }
export async function getAiConversation(userId: string): Promise<{ id: string; messages: AiMessage[] } | null> {
  await pool.query(`DELETE FROM ai_conversations WHERE user_id = $1 AND expires_at <= now()`, [userId])
  const conversation = await pool.query(`SELECT id FROM ai_conversations WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1`, [userId])
  if (!conversation.rows[0]) return null
  const messages = await pool.query<AiMessage>(`SELECT role, content, created_at AS "createdAt" FROM ai_messages WHERE conversation_id = $1 ORDER BY created_at`, [conversation.rows[0].id])
  return { id: String(conversation.rows[0].id), messages: messages.rows }
}
export async function appendAiConversation(userId: string, userMessage: string, assistantMessage: string): Promise<{ id: string; messages: AiMessage[] }> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const existing = await client.query(`SELECT id FROM ai_conversations WHERE user_id = $1 AND expires_at > now() ORDER BY updated_at DESC LIMIT 1 FOR UPDATE`, [userId])
    const conversation = existing.rows[0] ? existing : await client.query(`INSERT INTO ai_conversations (user_id, expires_at) VALUES ($1, now() + interval '24 hours') RETURNING id`, [userId])
    const id = conversation.rows[0].id
    await client.query(`INSERT INTO ai_messages (conversation_id, role, content) VALUES ($1, 'user', $2), ($1, 'assistant', $3)`, [id, userMessage, assistantMessage])
    await client.query(`UPDATE ai_conversations SET updated_at = now(), expires_at = now() + interval '24 hours' WHERE id = $1`, [id])
    await client.query('COMMIT')
    return { id, messages: [{ role: 'user', content: userMessage, createdAt: new Date().toISOString() }, { role: 'assistant', content: assistantMessage, createdAt: new Date().toISOString() }] }
  } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
}

export interface Message { id: string; conversationId: string; senderUserId: string; content: string; readAt: string | null; createdAt: string }
export interface Conversation { id: string; customerUserId: string; providerUserId: string; jobId: string; offerId: string | null; jobTitle: string; offerStatus: OfferStatus | null; updatedAt: string; messages: Message[]; unreadCount: number }
export interface ConversationInput { jobId: string; offerId: string }
export interface PushSubscription { endpoint: string; keys: { p256dh: string; auth: string } }

function mapMessage(row: Record<string, unknown>): Message {
  return { id: String(row.id), conversationId: String(row.conversationId), senderUserId: String(row.senderUserId), content: String(row.content), readAt: row.readAt ? String(row.readAt) : null, createdAt: String(row.createdAt) }
}

const conversationSelect = `SELECT c.id, c.customer_user_id AS "customerUserId", c.provider_user_id AS "providerUserId",
  c.job_id AS "jobId", c.offer_id AS "offerId", j.title AS "jobTitle", o.status AS "offerStatus",
  c.updated_at AS "updatedAt" FROM conversations c JOIN jobs j ON j.id = c.job_id LEFT JOIN offers o ON o.id = c.offer_id`

async function hydrateConversation(row: Record<string, unknown>, userId: string): Promise<Conversation> {
  const messages = await pool.query(`SELECT id, conversation_id AS "conversationId", sender_user_id AS "senderUserId", content,
    read_at AS "readAt", created_at AS "createdAt" FROM messages WHERE conversation_id = $1 ORDER BY created_at`, [row.id])
  const unread = await pool.query(`SELECT count(*)::int AS count FROM messages WHERE conversation_id = $1 AND sender_user_id <> $2 AND read_at IS NULL`, [row.id, userId])
  return { id: String(row.id), customerUserId: String(row.customerUserId), providerUserId: String(row.providerUserId), jobId: String(row.jobId), offerId: row.offerId ? String(row.offerId) : null, jobTitle: String(row.jobTitle), offerStatus: row.offerStatus as OfferStatus | null, updatedAt: String(row.updatedAt), messages: messages.rows.map(mapMessage), unreadCount: Number(unread.rows[0].count) }
}

export async function getConversations(userId: string, limit = 50, offset = 0): Promise<Conversation[]> {
  const result = await pool.query(`${conversationSelect} WHERE c.customer_user_id = $1 OR c.provider_user_id = $1 ORDER BY c.updated_at DESC LIMIT $2 OFFSET $3`, [userId, Math.min(100, Math.max(1, limit)), Math.max(0, offset)])
  return Promise.all(result.rows.map((row) => hydrateConversation(row, userId)))
}

export async function getConversation(id: string, userId: string): Promise<Conversation | null> {
  const result = await pool.query(`${conversationSelect} WHERE c.id = $1 AND (c.customer_user_id = $2 OR c.provider_user_id = $2)`, [id, userId])
  return result.rows[0] ? hydrateConversation(result.rows[0], userId) : null
}

export async function createConversation(userId: string, input: ConversationInput): Promise<Conversation> {
  const result = await pool.query(`INSERT INTO conversations (customer_user_id, provider_user_id, job_id, offer_id)
    SELECT j.customer_user_id, o.provider_user_id, j.id, o.id FROM jobs j JOIN offers o ON o.job_id = j.id
    WHERE j.id = $1 AND o.id = $2 AND j.customer_user_id = $3 AND o.status IN ('PENDING', 'ACCEPTED') AND o.provider_user_id <> $3
    ON CONFLICT (job_id, provider_user_id) DO UPDATE SET offer_id = COALESCE(conversations.offer_id, EXCLUDED.offer_id), updated_at = now()
    RETURNING id`, [input.jobId, input.offerId, userId])
  if (!result.rows[0]) throw new Error('Invalid conversation context')
  const conversation = await getConversation(String(result.rows[0].id), userId)
  if (!conversation) throw new Error('Conversation access denied')
  return conversation
}

export async function sendMessage(conversationId: string, userId: string, content: string): Promise<Message> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const participant = await client.query(`SELECT id, customer_user_id AS "customerUserId", provider_user_id AS "providerUserId" FROM conversations WHERE id = $1 AND (customer_user_id = $2 OR provider_user_id = $2) FOR UPDATE`, [conversationId, userId])
    if (!participant.rows[0]) throw new Error('Conversation access denied')
    const inserted = await client.query(`INSERT INTO messages (conversation_id, sender_user_id, content) VALUES ($1, $2, $3)
      RETURNING id, conversation_id AS "conversationId", sender_user_id AS "senderUserId", content, read_at AS "readAt", created_at AS "createdAt"`, [conversationId, userId, content])
    await client.query(`UPDATE conversations SET updated_at = now() WHERE id = $1`, [conversationId])
    const recipientUserId = String(participant.rows[0].customerUserId) === userId ? String(participant.rows[0].providerUserId) : String(participant.rows[0].customerUserId)
    await appendEvent(client, 'message.created', String(inserted.rows[0].id), { conversationId, recipientUserIds: [recipientUserId] })
    await client.query('COMMIT')
    return mapMessage(inserted.rows[0])
  } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
}

export async function markConversationRead(conversationId: string, userId: string): Promise<number> {
  const participant = await pool.query(`SELECT id FROM conversations WHERE id = $1 AND (customer_user_id = $2 OR provider_user_id = $2)`, [conversationId, userId])
  if (!participant.rows[0]) throw new Error('Conversation access denied')
  const result = await pool.query(`UPDATE messages m SET read_at = now() FROM conversations c
    WHERE m.conversation_id = c.id AND c.id = $1 AND (c.customer_user_id = $2 OR c.provider_user_id = $2)
    AND m.sender_user_id <> $2 AND m.read_at IS NULL`, [conversationId, userId])
  return result.rowCount ?? 0
}

export async function getUnreadMessageCount(userId: string): Promise<number> {
  const result = await pool.query(`SELECT count(*)::int AS count FROM messages m JOIN conversations c ON c.id = m.conversation_id
    WHERE (c.customer_user_id = $1 OR c.provider_user_id = $1) AND m.sender_user_id <> $1 AND m.read_at IS NULL`, [userId])
  return Number(result.rows[0].count)
}

export async function savePushSubscription(userId: string, subscription: PushSubscription): Promise<void> {
  await pool.query(`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1, $2, $3, $4)
    ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, updated_at = now()`, [userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth])
}

export async function getPushSubscriptions(userId: string): Promise<PushSubscription[]> {
  const result = await pool.query(`SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1`, [userId])
  return result.rows.map((row) => ({ endpoint: String(row.endpoint), keys: { p256dh: String(row.p256dh), auth: String(row.auth) } }))
}