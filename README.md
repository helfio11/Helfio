# Service Marketplace Platform — Product & Technical Specification

## 1. Purpose

Build a production-oriented web marketplace where customers can find service providers, workers can offer services or look for jobs, employers/customers can publish work requests, and administrators can manage the entire platform.

The initial product is WEB ONLY.

Do not build Android, iOS, desktop applications, or native clients in this phase.

The platform must not be designed only for cleaning services.

Cleaning is only one service category.

The architecture must support an unlimited and dynamically manageable number of service categories and subcategories.

Examples:

- Cleaning
- Construction
- Handyman
- Electrical work
- Plumbing
- Gardening
- Moving
- Transportation
- Car repair
- IT services
- Computer repair
- Child care
- Elderly care
- Beauty
- Wellness
- Education
- Tutoring
- Photography
- Events
- Waste removal
- Painting
- Home repair
- Other services

New categories must be configurable through the Admin Panel without requiring frontend code changes.

---

# 2. Product Concept

The platform has three primary user groups:

1. Customer
2. Service Provider / Worker
3. Administrator

A customer can:

- create an account
- search for services
- search for providers
- publish a service/job request
- specify location
- specify date/time
- describe the requested work
- receive applications/offers
- inspect provider profiles
- contact providers
- choose a provider
- track request/job status
- leave ratings and reviews

A provider/worker can:

- create an account
- create a professional profile
- select services/categories
- specify working location/area
- specify availability
- specify pricing where applicable
- browse available jobs
- apply to jobs
- submit offers
- manage active jobs
- communicate with customers
- receive reviews and ratings

An administrator can:

- manage users
- manage providers
- manage customers
- manage categories
- manage subcategories
- manage jobs
- manage applications/offers
- manage reviews
- manage reports
- manage platform settings
- manage roles and permissions
- manage moderation
- inspect audit logs
- activate/deactivate accounts
- activate/deactivate categories

---

# 3. Programming Languages

The project intentionally uses multiple programming languages.

Do not replace these technologies without a documented technical reason.

## Frontend

Language:

- TypeScript

Framework:

- Vue.js

Both the public/customer website and Admin Panel must use:

- Vue.js
- TypeScript

Avoid plain JavaScript where TypeScript can be used.

Use strict TypeScript configuration.

Frontend business contracts should use typed interfaces/types.

---

## Backend — Node.js Services

Language:

- TypeScript

Runtime:

- Node.js

Node.js + TypeScript should be used for services where fast API development, realtime communication, lightweight business logic, gateway functionality, notifications or integration work is appropriate.

Possible responsibilities include:

- API Gateway / Backend-for-Frontend
- Notification Service
- Search/query orchestration
- Realtime messaging
- integration services
- lightweight marketplace services

Use TypeScript throughout Node.js backend code.

Do not create JavaScript versions of TypeScript services.

---

## Backend — Java Services

Language:

- Java

Framework:

- Spring Boot

Java/Spring Boot should be used for business-critical services where strong domain modelling, transactional behaviour or more complex enterprise logic is useful.

Potential services include:

- User/Profile domain
- Job/Request domain
- Provider domain
- Booking/Contract domain
- Payment domain if implemented later

Do not duplicate the same business logic in both Node.js and Java services.

Each domain must have one canonical owner.

---

## AI Services

Language:

- Python

Python is optional and must only be introduced when real AI functionality is required.

Possible future AI use cases:

- intelligent search
- provider/job matching
- recommendation engine
- automatic categorization
- moderation
- fraud detection
- text assistance
- semantic search

Do not add Python services merely because Python is listed in the technology stack.

No AI functionality is required unless explicitly implemented as a product feature.

---

# 4. Frontend Architecture

Technology:

- Vue.js
- TypeScript

The application must be responsive and work correctly on:

- desktop
- tablet
- mobile browsers

The reference design is a clean modern marketplace layout similar to the supplied Helfio mockup.

Do not copy branding or copyrighted visual assets.

Use the reference only for layout direction and UX structure.

Primary visual characteristics:

- clean white background
- green primary accent
- strong readable typography
- modern cards
- rounded UI components
- spacious layout
- clear search functionality
- professional marketplace appearance
- service category cards
- provider cards
- strong call-to-action buttons

---

# 5. Main Website Navigation

Example public navigation:

- Home
- Services
- For Customers
- For Providers
- How It Works
- About
- Help
- Login
- Register
- Language selector

Navigation must be dynamic where appropriate.

Service categories must NEVER be hardcoded directly into the navigation.

---

# 6. Dynamic Category System

This is a critical requirement.

Categories and subcategories must be stored in the backend/database.

Example:

Home & Household
├── Cleaning
├── Home Repair
├── Plumbing
└── Electrical

Transport
├── Moving
├── Delivery
└── Vehicle Transport

IT & Technology
├── Computer Repair
├── Network Setup
└── Software Services

The Admin Panel must allow:

- create category
- edit category
- delete/archive category
- activate/deactivate category
- create subcategory
- choose parent category
- configure display order
- configure icon
- configure description
- configure URL slug
- configure SEO title
- configure SEO description

Example:

Name:
Pet Care

Slug:
pet-care

URL:

/services/pet-care

Once an administrator creates a category, the system must automatically make it available in:

- Services navigation
- category pages
- homepage category section where configured
- provider registration
- provider service selection
- job/request creation
- search
- filters

No developer should need to modify Vue source code just to add a new service category.

---

# 7. Routing

Use dynamic routing.

Examples:

/services
/services/cleaning
/services/gardening
/services/it-technology

/providers
/providers/:providerSlug

/jobs
/jobs/:jobId

/account
/account/profile
/account/jobs
/account/messages
/account/settings

/provider/dashboard
/provider/profile
/provider/services
/provider/jobs
/provider/applications
/provider/settings

/admin
/admin/users
/admin/providers
/admin/jobs
/admin/categories
/admin/reviews
/admin/settings

Route structure may evolve, but must remain predictable and REST-friendly.

---

# 8. Homepage

Homepage should approximately contain:

## Header

- logo
- Services
- For Customers
- For Providers
- About
- Help
- language selector
- Login
- Register

## Hero Section

Primary message similar in concept to:

"What do you need?"

Search fields:

- service/query
- postal code/location
- search button

Example search:

"What do you need?"
Electrician

"Where?"
Berlin

Search

## Popular Services

Show popular service shortcuts.

Examples:

- Cleaning
- Electrician
- Gardening
- Moving
- Painting
- Car Repair

These values must come from data/configuration rather than being permanently hardcoded.

## Service Categories

Display category cards.

Each card should contain:

- icon
- category name
- optional short description
- link

## Recommended Providers

Provider cards should support:

- image/avatar
- business/provider name
- online/availability indicator
- rating
- review count
- location
- distance if location functionality exists
- service tags
- starting price if available
- View Profile action

## How It Works

Example:

1. Submit Request
2. Receive Matching Providers
3. Contact Provider
4. Complete Job

## Registration CTA

Call-to-action for customers/providers to register.

---

# 9. Authentication and Authorization

Use:

- Keycloak

Keycloak is the central authentication and authorization system.

Support roles such as:

- CUSTOMER
- PROVIDER
- ADMIN

Potential future roles:

- SUPPORT
- MODERATOR
- SUPER_ADMIN

Do not implement a parallel custom authentication system unless absolutely required.

Authentication responsibilities should include:

- registration
- login
- logout
- email verification where configured
- password reset
- session management
- role-based access control
- protected routes
- protected APIs

Frontend permissions must never replace backend authorization.

Backend services must validate authorization independently.

---

# 10. User Profiles

Base user information may include:

- id
- first name
- last name
- email
- phone
- avatar
- language
- status
- createdAt
- updatedAt

Do not expose sensitive internal fields publicly.

---

# 11. Provider Profiles

Provider profile may include:

- provider ID
- user ID
- provider/business name
- profile photo
- description
- services
- categories
- location
- working radius
- availability
- pricing
- experience
- verification status
- rating
- review count
- completed jobs

A provider may support multiple services.

Do not create one account per service.

---

# 12. Jobs / Service Requests

Customers must be able to publish requests.

Possible fields:

- title
- description
- category
- subcategory
- location
- postal code
- preferred date
- preferred time
- budget
- pricing type
- attachments
- status

Possible statuses:

- DRAFT
- OPEN
- MATCHING
- IN_PROGRESS
- COMPLETED
- CANCELLED
- CLOSED

Avoid scattering status strings throughout frontend/backend code.

Use centralized enums/domain definitions.

---

# 13. Applications and Offers

Providers can apply to jobs.

An application/offer may contain:

- provider
- job
- message
- proposed price
- estimated duration
- availability
- status
- createdAt

Example states:

- PENDING
- ACCEPTED
- REJECTED
- WITHDRAWN

Only authorized users must be able to accept/reject offers.

---

# 14. Search

Search should support:

- text
- category
- subcategory
- location
- provider
- rating
- availability
- price where applicable

Do not introduce Elasticsearch/OpenSearch initially unless requirements justify it.

Start with PostgreSQL-compatible search/filtering where practical.

Architecture should allow replacing/extending search later.

---

# 15. Location

Initial system should support:

- city
- postal code
- provider service region

If GPS/maps are added later, keep geographic functionality behind a dedicated abstraction/service.

Do not tightly couple business logic to one map provider.

---

# 16. Ratings and Reviews

Customers should be able to review providers after eligible completed work.

Review fields may include:

- rating
- comment
- customer
- provider
- job
- createdAt
- moderation status

Prevent arbitrary users from creating fake reviews without an eligible relationship where the product rules require verification.

---

# 17. Messaging

The architecture should support customer/provider communication.

MVP can start with basic internal messaging.

NATS may be used where low-latency service communication is useful.

Do not use Kafka and NATS for the exact same responsibility without a reason.

---

# 18. Notifications

Support notification architecture for events such as:

- new application
- accepted application
- rejected application
- new message
- job status changed
- account verification
- provider request
- review received

Possible channels:

- in-app
- email
- browser notification later

Notification preferences must be configurable.

---

# 19. User Settings

Settings should include:

## Account

- name
- profile image
- email
- phone
- language

## Security

- change password through authentication system
- active session management where supported
- 2FA where supported
- logout

## Notifications

Individual notification preferences.

## Privacy

- account visibility where applicable
- data/privacy preferences
- account deletion workflow

---

# 20. Provider Settings

Provider-specific settings:

- services
- categories
- pricing
- availability
- work location
- working radius
- profile visibility
- notification preferences
- verification information

Example availability:

- AVAILABLE
- BUSY
- OFFLINE

---

# 21. Admin Panel

Frontend:

- Vue.js
- TypeScript

The Admin Panel must be part of the same product ecosystem but should have clearly separated protected routes/components.

Admin capabilities should include:

## Dashboard

- users
- providers
- active jobs
- completed jobs
- categories
- reviews
- platform activity

## User Management

- search users
- view user
- activate/deactivate
- change allowed administrative states
- inspect role
- account moderation

## Provider Management

- provider status
- verification
- profile
- categories
- services
- reviews

## Job Management

- inspect jobs
- statuses
- reports
- moderation

## Category Management

This must be fully dynamic.

## Reviews

- inspect
- moderate
- hide/remove according to moderation rules

## Platform Settings

Examples:

- platform name
- support email
- registration flags
- default language
- enabled languages
- category display settings
- feature flags where appropriate

## Audit Logs

Important administrative operations should be auditable.

---

# 22. Languages / Localization

The interface must be designed from the beginning for localization.

Initial expected languages:

- German
- Albanian

Do not hardcode UI text directly into components where localization is expected.

Use translation files/resources.

Example:

de
sq

Architecture should allow additional languages later.

The language selector must be visible in the public website.

---

# 23. Database Technologies

## PostgreSQL

PostgreSQL is the primary relational database.

Use PostgreSQL for structured transactional domain data such as:

- users
- provider profiles
- categories
- services
- jobs
- applications
- offers
- reviews
- settings
- audit references

Use proper:

- foreign keys
- indexes
- constraints
- migrations

Avoid schema-less design for strongly relational data.

---

# 24. Redis

Redis should be used when justified for:

- cache
- temporary state
- rate limiting
- distributed sessions if required
- short-lived data
- performance optimization

Redis must not become the canonical source for permanent business data.

---

# 25. Cassandra

Cassandra is part of the approved technology options but should only be introduced if a real scalability/data-pattern requirement justifies it.

Do not add Cassandra to the MVP merely because it appears in the technology stack.

Potential future scenarios:

- extremely high-volume distributed event/history data
- high write throughput
- large-scale denormalized access patterns

PostgreSQL remains the default database.

---

# 26. Kafka

Kafka is the event streaming/message handling technology.

Possible future/useful events:

- UserRegistered
- ProviderRegistered
- JobCreated
- ApplicationSubmitted
- ApplicationAccepted
- JobStarted
- JobCompleted
- ReviewCreated

Kafka should be used for asynchronous domain events where there is actual value.

Do not create Kafka infrastructure for trivial synchronous operations.

---

# 27. NATS

NATS may be used for lightweight internal messaging and service-to-service communication.

Possible cases:

- fast internal messages
- request/reply communication
- realtime service signalling

Kafka and NATS serve different architectural purposes.

Avoid unnecessary overlap.

---

# 28. Microservices

The backend should support a microservice architecture.

Potential bounded services:

- Identity/Auth integration
- User Service
- Provider Service
- Category/Service Catalog Service
- Job Service
- Application/Offer Service
- Review Service
- Notification Service

Do NOT blindly create dozens of tiny services.

Prefer bounded domain services with clear ownership.

The number of services should follow actual domain boundaries.

---

# 29. Service Ownership

Every piece of business data must have one canonical owner.

Example:

User Service
owns user/domain profile data.

Category Service
owns categories and service definitions.

Job Service
owns jobs and job lifecycle.

Review Service
owns ratings/reviews.

Avoid multiple services writing directly to another service's internal tables.

Use APIs/events between bounded contexts.

---

# 30. API Design

Use versioned HTTP APIs where appropriate.

Example:

/api/v1/categories
/api/v1/providers
/api/v1/jobs
/api/v1/applications

Use consistent:

- validation
- error responses
- pagination
- authentication
- authorization
- request IDs
- logging

Do not return raw internal exceptions to users.

---

# 31. Security

Security is mandatory.

Implement:

- Keycloak authorization
- server-side permission checks
- input validation
- secure headers
- CORS configuration
- rate limiting where appropriate
- secure cookie/token handling
- protection against injection
- protection against XSS
- CSRF protection where relevant
- file upload validation
- access control checks

Never trust frontend validation alone.

Never store secrets in source code.

Use environment variables/secrets management.

---

# 32. File Uploads

Possible uploads:

- profile photos
- job photos
- provider verification documents later

File storage must be abstracted from domain logic.

Do not store large files directly in PostgreSQL unless specifically justified.

---

# 33. SEO

Public pages should be SEO-friendly where appropriate.

Dynamic categories should support:

- slug
- SEO title
- SEO description
- canonical URL strategy

Example:

/services/cleaning
/services/electrician
/services/gardening

---

# 34. Performance

Avoid premature optimization.

However:

- paginate large lists
- index frequently queried PostgreSQL fields
- avoid N+1 database queries
- cache only where justified
- lazy-load frontend modules/images where appropriate
- optimize public landing pages

---

# 35. Observability

Services should support:

- structured logging
- correlation/request IDs
- health endpoints
- clear error logging

Architecture should allow metrics/tracing later.

---

# 36. Development Environment

The repository must be able to run consistently in GitHub Codespaces.

Provide clear scripts/documentation for:

- installing dependencies
- starting frontend
- starting backend services
- starting infrastructure
- running tests
- running typecheck
- building production packages

Prefer Docker / Docker Compose for local infrastructure where useful.

---

# 37. Repository Structure

Do not force this exact tree if the repository already has an established architecture.

A possible structure is:

apps/
  web/
  admin/

services/
  gateway/
  user-service/
  provider-service/
  category-service/
  job-service/
  notification-service/

infra/
  docker/
  keycloak/
  kafka/
  postgres/
  redis/

packages/
  shared-types/
  api-contracts/

docs/

Do not duplicate existing canonical packages.

Before creating a package or service, inspect the repository first.

---

# 38. Shared Contracts

Frontend and backend APIs must use clear versioned contracts.

Do not allow frontend assumptions to silently diverge from backend models.

Where TypeScript services share contracts, use a dedicated package if appropriate.

Java must implement the same documented API contracts without depending on TypeScript runtime code.

---

# 39. Testing

Every meaningful feature should have appropriate automated testing.

At minimum:

Frontend:
- component/unit tests where valuable
- critical user flows

Backend:
- unit tests
- service tests
- API tests
- authorization tests

Integration:
- database integration
- authentication
- important workflows

Critical workflow example:

Customer registers
→ creates request
→ provider finds request
→ provider applies
→ customer accepts
→ job becomes active
→ job completes
→ customer reviews provider

---

# 40. MVP Scope

Initial WEB MVP should prioritize:

1. Authentication
2. Customer profile
3. Provider profile
4. Dynamic categories/subcategories
5. Provider service configuration
6. Search/browse providers
7. Create service/job request
8. Browse jobs
9. Provider application/offer
10. Customer accepts/rejects application
11. Basic job lifecycle
12. Ratings/reviews
13. Notifications
14. Basic messaging if required
15. User settings
16. Provider settings
17. Admin Panel
18. Localization German + Albanian
19. Responsive design
20. Production-capable deployment configuration

Do not expand into native mobile apps in the MVP.

---

# 41. Features Reserved for Later

Unless explicitly requested, these are NOT initial priorities:

- Android app
- iOS app
- native desktop app
- advanced AI recommendation engine
- Cassandra deployment
- complex event sourcing
- advanced Kafka ecosystem
- Elasticsearch/OpenSearch
- advanced payment marketplace
- automated provider payouts
- complex map/GPS tracking
- video calling

Architect for reasonable extension, but do not build speculative infrastructure.

---

# 42. Architecture Principle

Use this general communication model:

Vue.js + TypeScript
        |
        v
API / Gateway
        |
        +-------------------------+
        |                         |
        v                         v
Node.js + TypeScript        Java + Spring Boot
Services                    Services
        |                         |
        +------------+------------+
                     |
                     v
                PostgreSQL
                     |
                   Redis

Supporting infrastructure where required:

Keycloak
Kafka
NATS

Optional future:

Python AI Services
Cassandra

---

# 43. Important Architectural Rules

The coding agent MUST follow these rules:

1. Inspect existing repository architecture before creating new files.
2. Do not create duplicate services or duplicate implementations.
3. Do not rewrite working architecture unnecessarily.
4. Do not replace Vue with React.
5. Do not replace TypeScript with JavaScript.
6. Do not replace Spring Boot with another Java framework without explicit approval.
7. Use PostgreSQL as primary persistent storage.
8. Use Redis only for suitable transient/cache workloads.
9. Use Cassandra only when technically justified.
10. Use Keycloak as the authentication/authorization authority.
11. Do not implement a competing authentication system.
12. Do not hardcode categories.
13. Do not hardcode service navigation.
14. Do not hardcode German/Albanian strings into components when localization should be used.
15. Do not put business-critical authorization only in frontend code.
16. Keep clear boundaries between microservices.
17. Do not duplicate the same business domain across Node.js and Java.
18. Add Kafka/NATS only where the communication pattern requires them.
19. Keep the system extendable but avoid unnecessary complexity.
20. Always run relevant tests/typechecks/builds after modifications.

---

# 44. Agent Workflow

Before implementing a requested feature:

1. Read this document.
2. Inspect relevant existing code.
3. Identify the canonical implementation location.
4. Identify dependencies and service ownership.
5. Make the smallest coherent implementation.
6. Avoid unrelated refactors.
7. Add/update tests.
8. Run focused tests.
9. Run relevant typecheck/build.
10. Report exactly:
   - what changed
   - files changed
   - tests run
   - result
   - remaining known limitations

Do not keep searching indefinitely once the root cause or implementation location is established.

Do not spend tokens repeatedly re-reading unrelated files.

---

# 45. Product Direction

The visual reference represents the intended marketplace experience:

- prominent search
- broad service categories
- provider discovery
- verified profiles
- ratings
- location-aware results
- clear customer/provider paths
- simple onboarding
- modern trustworthy design

However, the platform is broader than a cleaning marketplace.

The core concept is:

CUSTOMERS NEED WORK DONE.

PROVIDERS OFFER SKILLS/SERVICES.

THE PLATFORM CONNECTS THEM.

The architecture, database, routing, APIs and UI must reflect this general marketplace model rather than being specialized for one service industry.

---

# 46. Source of Truth

This document is the project-level product and technical specification.

When implementation decisions conflict with this document:

- do not silently choose another direction
- identify the conflict
- explain the technical reason
- preserve existing compatible architecture
- request clarification only when the decision materially changes product architecture

For routine implementation details, make a reasonable engineering decision and continue.

The goal is a maintainable, secure, extensible web marketplace — not a demo and not a collection of disconnected generated pages.
