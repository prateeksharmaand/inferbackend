-- CreateEnum
CREATE TYPE "OrgStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INVITED', 'DISABLED');

-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('SUPER_ADMIN', 'SUPPORT', 'NONE');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('ANDROID', 'IOS');

-- CreateEnum
CREATE TYPE "AdProvider" AS ENUM ('GOOGLE_ADS', 'APPLE_ADS', 'META_ADS', 'TIKTOK_ADS');

-- CreateEnum
CREATE TYPE "AnalyticsProviderKind" AS ENUM ('FIREBASE', 'GA4', 'APPSFLYER', 'ADJUST');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('PENDING', 'CONNECTED', 'EXPIRED', 'REVOKED', 'ERROR', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'READY', 'ACTIVE', 'PAUSED', 'FAILED', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AutonomyLevel" AS ENUM ('RECOMMENDATION', 'APPROVED_AUTOMATION', 'AUTONOMOUS');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CreativeType" AS ENUM ('AD_COPY', 'HEADLINE', 'DESCRIPTION', 'IMAGE', 'VIDEO', 'VIDEO_SCRIPT', 'SOCIAL_POST', 'BANNER', 'SCREENSHOT_CONCEPT');

-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'AWAITING_REVIEW');

-- CreateEnum
CREATE TYPE "InstallKind" AS ENUM ('FIRST_INSTALL', 'REINSTALL');

-- CreateEnum
CREATE TYPE "AttributionType" AS ENUM ('ORGANIC', 'PAID', 'UNATTRIBUTED');

-- CreateEnum
CREATE TYPE "AttributionGranularity" AS ENUM ('USER_LEVEL', 'AGGREGATE');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "OrgStatus" NOT NULL DEFAULT 'ACTIVE',
    "suspendedReason" TEXT,
    "country" TEXT NOT NULL DEFAULT 'IN',
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "brandColors" JSONB NOT NULL DEFAULT '[]',
    "brandVoice" TEXT NOT NULL DEFAULT '',
    "brandGuidelines" TEXT NOT NULL DEFAULT '',
    "logoAssetKey" TEXT,
    "autonomyLevel" "AutonomyLevel" NOT NULL DEFAULT 'RECOMMENDATION',
    "automationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emergencyStopAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "platformRole" "PlatformRole" NOT NULL DEFAULT 'NONE',
    "emailVerifiedAt" TIMESTAMPTZ,
    "mfaSecretEnc" TEXT,
    "mfaEnabledAt" TIMESTAMPTZ,
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ,
    "lastLoginAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "organization_members" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "organizationId" UUID,
    "ip" TEXT,
    "userAgent" TEXT,
    "mfaVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "usedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "usedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "roleKey" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "invitedById" UUID,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "acceptedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "priceMinor" BIGINT NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "interval" TEXT NOT NULL DEFAULT 'month',
    "trialDays" INTEGER NOT NULL DEFAULT 0,
    "maxApps" INTEGER NOT NULL,
    "maxMembers" INTEGER NOT NULL,
    "maxAdAccounts" INTEGER NOT NULL,
    "aiGenerationsMonth" INTEGER NOT NULL,
    "aiTokensMonth" BIGINT NOT NULL,
    "features" JSONB NOT NULL DEFAULT '{}',
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "currentPeriodStart" TIMESTAMPTZ NOT NULL,
    "currentPeriodEnd" TIMESTAMPTZ NOT NULL,
    "trialEndsAt" TIMESTAMPTZ,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "externalId" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "subscriptionId" UUID,
    "number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "subtotalMinor" BIGINT NOT NULL,
    "taxMinor" BIGINT NOT NULL DEFAULT 0,
    "totalMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "periodStart" TIMESTAMPTZ NOT NULL,
    "periodEnd" TIMESTAMPTZ NOT NULL,
    "lines" JSONB NOT NULL DEFAULT '[]',
    "issuedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMPTZ,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "invoiceId" UUID,
    "amountMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'succeeded',
    "externalId" TEXT,
    "receivedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" UUID,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "targetAudience" TEXT NOT NULL DEFAULT '',
    "iconAssetKey" TEXT,
    "monthlyInstallTarget" INTEGER NOT NULL DEFAULT 10000,
    "targetCpiMinor" BIGINT,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL DEFAULT 'active',
    "onboardingStatus" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_platforms" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "platform" "Platform" NOT NULL,
    "storeId" TEXT NOT NULL,
    "storeUrl" TEXT NOT NULL DEFAULT '',
    "appleAppId" TEXT,
    "validatedAt" TIMESTAMPTZ,
    "validationNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_platforms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_store_listings" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "platform" "Platform" NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'IN',
    "language" TEXT NOT NULL DEFAULT 'en',
    "title" TEXT NOT NULL DEFAULT '',
    "subtitle" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "developer" TEXT NOT NULL DEFAULT '',
    "rating" DECIMAL(3,2),
    "ratingCount" INTEGER,
    "iconUrl" TEXT NOT NULL DEFAULT '',
    "screenshotUrls" JSONB NOT NULL DEFAULT '[]',
    "raw" JSONB NOT NULL DEFAULT '{}',
    "source" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "fetchedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_store_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_assets" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_countries" (
    "organizationId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "country" CHAR(2) NOT NULL,

    CONSTRAINT "application_countries_pkey" PRIMARY KEY ("applicationId","country")
);

-- CreateTable
CREATE TABLE "application_languages" (
    "organizationId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "language" TEXT NOT NULL,

    CONSTRAINT "application_languages_pkey" PRIMARY KEY ("applicationId","language")
);

-- CreateTable
CREATE TABLE "application_targets" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "month" DATE NOT NULL,
    "installs" INTEGER NOT NULL,
    "targetCpiMinor" BIGINT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_events" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_providers" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "readiness" TEXT NOT NULL DEFAULT 'not_configured',
    "readinessNote" TEXT NOT NULL DEFAULT '',
    "docsUrl" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "integration_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connected_accounts" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "providerKey" TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" CHAR(3),
    "timezone" TEXT,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'PENDING',
    "statusDetail" TEXT NOT NULL DEFAULT '',
    "scopes" TEXT[],
    "automationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "connectedById" UUID,
    "lastSyncedAt" TIMESTAMPTZ,
    "tokenExpiresAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "connected_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_tokens" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "connectedAccountId" UUID NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT,
    "tokenType" TEXT NOT NULL DEFAULT 'Bearer',
    "expiresAt" TIMESTAMPTZ,
    "refreshedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "oauth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_states" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "providerKey" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "codeVerifierEnc" TEXT,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "usedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_permissions" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "connectedAccountId" UUID NOT NULL,
    "capability" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "checkedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "detail" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "integration_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_applications" (
    "organizationId" UUID NOT NULL,
    "connectedAccountId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,

    CONSTRAINT "account_applications_pkey" PRIMARY KEY ("connectedAccountId","applicationId")
);

-- CreateTable
CREATE TABLE "integration_sync_logs" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "connectedAccountId" UUID,
    "providerKey" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "httpStatus" INTEGER,
    "errorCode" TEXT,
    "message" TEXT NOT NULL DEFAULT '',
    "durationMs" INTEGER,
    "startedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_endpoints" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "providerKey" TEXT NOT NULL,
    "secretEnc" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "providerKey" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "signatureValid" BOOLEAN NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMPTZ,
    "error" TEXT,
    "receivedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_research" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "executionId" UUID,
    "summary" TEXT NOT NULL,
    "markets" JSONB NOT NULL,
    "audiences" JSONB NOT NULL,
    "opportunities" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "confidence" DECIMAL(3,2) NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_research_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitors" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'ai',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitor_apps" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "competitorId" UUID NOT NULL,
    "platform" "Platform" NOT NULL,
    "storeId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "rating" DECIMAL(3,2),
    "ratingCount" INTEGER,
    "lastFetchedAt" TIMESTAMPTZ,

    CONSTRAINT "competitor_apps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "keyword_research" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "platform" "Platform",
    "country" TEXT NOT NULL DEFAULT 'IN',
    "keyword" TEXT NOT NULL,
    "relevance" DECIMAL(3,2) NOT NULL,
    "estimatedPopularity" TEXT NOT NULL DEFAULT 'unknown',
    "competition" TEXT NOT NULL DEFAULT 'unknown',
    "source" TEXT NOT NULL DEFAULT 'ai',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "keyword_research_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aso_audits" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "platform" "Platform" NOT NULL,
    "listingId" UUID,
    "executionId" UUID,
    "score" INTEGER NOT NULL,
    "findings" JSONB NOT NULL,
    "suggestedTitle" TEXT NOT NULL DEFAULT '',
    "suggestedSubtitle" TEXT NOT NULL DEFAULT '',
    "suggestedKeywords" JSONB NOT NULL DEFAULT '[]',
    "localization" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aso_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audience_segments" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "countries" TEXT[],
    "ageRange" TEXT NOT NULL DEFAULT '',
    "interests" TEXT[],
    "source" TEXT NOT NULL DEFAULT 'ai',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audience_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_strategies" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "executionId" UUID,
    "month" DATE,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "channels" JSONB NOT NULL,
    "countryAllocations" JSONB NOT NULL,
    "estimatedCpiMinor" BIGINT,
    "estimatedBudgetMinor" BIGINT,
    "forecastInstalls" JSONB NOT NULL,
    "campaignPlan" JSONB NOT NULL,
    "assumptions" JSONB NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" UUID,
    "decidedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketing_strategies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_kits" (
    "organizationId" UUID NOT NULL,
    "colors" JSONB NOT NULL DEFAULT '[]',
    "voice" TEXT NOT NULL DEFAULT '',
    "guidelines" TEXT NOT NULL DEFAULT '',
    "bannedClaims" TEXT[],
    "logoStorageKey" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "brand_kits_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "creative_projects" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "campaignId" UUID,
    "name" TEXT NOT NULL,
    "brief" TEXT NOT NULL DEFAULT '',
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creative_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creative_assets" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "campaignId" UUID,
    "type" "CreativeType" NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "policyFlags" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "creative_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creative_versions" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "promptId" UUID,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "costMicros" BIGINT NOT NULL DEFAULT 0,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creative_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creative_prompts" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "type" "CreativeType" NOT NULL,
    "prompt" TEXT NOT NULL,
    "parameters" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creative_prompts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creative_approvals" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ApprovalStatus" NOT NULL,
    "comment" TEXT NOT NULL DEFAULT '',
    "decidedById" UUID NOT NULL,
    "decidedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creative_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creative_performance" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "impressions" BIGINT NOT NULL DEFAULT 0,
    "clicks" BIGINT NOT NULL DEFAULT 0,
    "installs" INTEGER NOT NULL DEFAULT 0,
    "spendMinor" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "creative_performance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_groups" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "strategyId" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "connectedAccountId" UUID,
    "groupId" UUID,
    "strategyId" UUID,
    "name" TEXT NOT NULL,
    "provider" "AdProvider" NOT NULL,
    "platform" "Platform" NOT NULL,
    "objective" TEXT NOT NULL DEFAULT 'installs',
    "countries" TEXT[],
    "languages" TEXT[],
    "dailyBudgetMinor" BIGINT NOT NULL,
    "monthlyBudgetMinor" BIGINT,
    "targetCpiMinor" BIGINT,
    "currency" CHAR(3) NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "statusReason" TEXT NOT NULL DEFAULT '',
    "externalCampaignId" TEXT,
    "externalStatus" TEXT,
    "tracking" JSONB NOT NULL DEFAULT '{}',
    "automationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMPTZ,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_adsets" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "targeting" JSONB NOT NULL DEFAULT '{}',
    "externalId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_adsets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_ads" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "adsetId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "creativeAssetId" UUID,
    "externalId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_ads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_creatives" (
    "organizationId" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "creativeAssetId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "externalAssetId" TEXT,
    "uploadedAt" TIMESTAMPTZ,

    CONSTRAINT "campaign_creatives_pkey" PRIMARY KEY ("campaignId","creativeAssetId")
);

-- CreateTable
CREATE TABLE "campaign_budgets" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "dailyMinor" BIGINT NOT NULL,
    "monthlyMinor" BIGINT,
    "effectiveFrom" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedBy" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "campaign_budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_metrics" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "country" CHAR(2) NOT NULL DEFAULT 'ZZ',
    "impressions" BIGINT NOT NULL DEFAULT 0,
    "clicks" BIGINT NOT NULL DEFAULT 0,
    "installs" INTEGER NOT NULL DEFAULT 0,
    "spendMinor" BIGINT NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL,
    "syncedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_actions" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "request" JSONB NOT NULL DEFAULT '{}',
    "response" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ,

    CONSTRAINT "campaign_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_experiments" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "hypothesis" TEXT NOT NULL,
    "variants" JSONB NOT NULL,
    "metric" TEXT NOT NULL DEFAULT 'cpi',
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "result" JSONB,
    "startedAt" TIMESTAMPTZ,
    "endedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_experiments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_providers" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL DEFAULT '',
    "apiKeyEnc" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ai_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_models" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "modelId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'text',
    "inputCostPerMTok" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "outputCostPerMTok" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ai_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_agent_definitions" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "schedule" TEXT,
    "timeoutSec" INTEGER NOT NULL DEFAULT 120,
    "maxRetries" INTEGER NOT NULL DEFAULT 2,
    "providerKey" TEXT,
    "modelId" TEXT,
    "manualReview" BOOLEAN NOT NULL DEFAULT false,
    "tools" TEXT[],
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ai_agent_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_agent_tools" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "inputSchema" JSONB NOT NULL,
    "mutating" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_agent_tools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_agent_executions" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "agentKey" TEXT NOT NULL,
    "applicationId" UUID,
    "campaignId" UUID,
    "workflowExecutionId" UUID,
    "trigger" TEXT NOT NULL,
    "status" "ExecutionStatus" NOT NULL DEFAULT 'QUEUED',
    "input" JSONB NOT NULL,
    "output" JSONB,
    "error" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costMicros" BIGINT NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "requestedById" UUID,
    "reviewedById" UUID,
    "startedAt" TIMESTAMPTZ,
    "finishedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_agent_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_execution_logs" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "executionId" UUID NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'info',
    "message" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_execution_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" BIGINT NOT NULL DEFAULT 0,
    "outputTokens" BIGINT NOT NULL DEFAULT 0,
    "generations" INTEGER NOT NULL DEFAULT 0,
    "costMicros" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_policies" (
    "organizationId" UUID NOT NULL,
    "autonomyLevel" "AutonomyLevel" NOT NULL DEFAULT 'RECOMMENDATION',
    "maxDailySpendMinor" BIGINT,
    "maxMonthlySpendMinor" BIGINT,
    "maxCampaignBudgetMinor" BIGINT,
    "maxBudgetIncreasePct" INTEGER NOT NULL DEFAULT 20,
    "maxConcurrentCampaigns" INTEGER NOT NULL DEFAULT 10,
    "reservePct" INTEGER NOT NULL DEFAULT 10,
    "allowedProviders" "AdProvider"[],
    "autoPauseOnCpiMultiple" DECIMAL(4,2) NOT NULL DEFAULT 2.0,
    "updatedById" UUID,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "automation_policies_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "automation_workflows" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "schedule" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "automation_workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_versions" (
    "id" UUID NOT NULL,
    "workflowId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "steps" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_executions" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "workflowKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "subjectType" TEXT,
    "subjectId" UUID,
    "idempotencyKey" TEXT NOT NULL,
    "status" "ExecutionStatus" NOT NULL DEFAULT 'QUEUED',
    "currentStep" TEXT,
    "steps" JSONB NOT NULL DEFAULT '[]',
    "error" TEXT,
    "startedAt" TIMESTAMPTZ,
    "finishedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_jobs" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "queue" TEXT NOT NULL,
    "cron" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMPTZ,
    "lastStatus" TEXT,
    "lastError" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "scheduled_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "optimization_decisions" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "campaignId" UUID,
    "agentKey" TEXT NOT NULL,
    "executionId" UUID,
    "kind" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "rationale" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "blockedReason" TEXT,
    "approvedById" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "optimization_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attribution_sources" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "provider" "AnalyticsProviderKind" NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "secretEnc" TEXT,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'PENDING',
    "statusDetail" TEXT NOT NULL DEFAULT '',
    "attributionWindowDays" INTEGER NOT NULL DEFAULT 7,
    "lastSyncedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attribution_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "install_events" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "platform" "Platform" NOT NULL,
    "source" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "deviceIdHash" TEXT,
    "kind" "InstallKind" NOT NULL,
    "attribution" "AttributionType" NOT NULL,
    "campaignId" UUID,
    "externalCampaignId" TEXT,
    "mediaSource" TEXT,
    "country" CHAR(2) NOT NULL DEFAULT 'ZZ',
    "installedAt" TIMESTAMPTZ NOT NULL,
    "receivedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "install_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attribution_events" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "granularity" "AttributionGranularity" NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "campaignId" UUID,
    "externalCampaignId" TEXT,
    "country" CHAR(2) NOT NULL DEFAULT 'ZZ',
    "date" DATE NOT NULL,
    "installs" INTEGER NOT NULL,
    "conversionValue" INTEGER,
    "raw" JSONB NOT NULL DEFAULT '{}',
    "receivedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attribution_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversion_events" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "eventKey" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "deviceIdHash" TEXT,
    "campaignId" UUID,
    "country" CHAR(2) NOT NULL DEFAULT 'ZZ',
    "valueMinor" BIGINT,
    "currency" CHAR(3),
    "occurredAt" TIMESTAMPTZ NOT NULL,
    "receivedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversion_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_daily" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "platform" "Platform" NOT NULL,
    "date" DATE NOT NULL,
    "firstInstalls" INTEGER NOT NULL DEFAULT 0,
    "reinstalls" INTEGER NOT NULL DEFAULT 0,
    "organicInstalls" INTEGER NOT NULL DEFAULT 0,
    "paidInstalls" INTEGER NOT NULL DEFAULT 0,
    "unattributedInstalls" INTEGER NOT NULL DEFAULT 0,
    "aggregateAttributedInstalls" INTEGER NOT NULL DEFAULT 0,
    "registrations" INTEGER NOT NULL DEFAULT 0,
    "activeUsers" INTEGER NOT NULL DEFAULT 0,
    "spendMinor" BIGINT NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL,
    "computedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_campaign_daily" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "impressions" BIGINT NOT NULL DEFAULT 0,
    "clicks" BIGINT NOT NULL DEFAULT 0,
    "platformInstalls" INTEGER NOT NULL DEFAULT 0,
    "attributedInstalls" INTEGER NOT NULL DEFAULT 0,
    "registrations" INTEGER NOT NULL DEFAULT 0,
    "spendMinor" BIGINT NOT NULL DEFAULT 0,
    "cpiMinor" BIGINT,
    "computedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_campaign_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retention_metrics" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "cohortDate" DATE NOT NULL,
    "campaignId" UUID,
    "source" TEXT NOT NULL DEFAULT 'all',
    "cohortSize" INTEGER NOT NULL,
    "d1" DECIMAL(5,4),
    "d7" DECIMAL(5,4),
    "d30" DECIMAL(5,4),
    "computedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retention_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "country_metrics" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "country" CHAR(2) NOT NULL,
    "date" DATE NOT NULL,
    "installs" INTEGER NOT NULL DEFAULT 0,
    "paidInstalls" INTEGER NOT NULL DEFAULT 0,
    "spendMinor" BIGINT NOT NULL DEFAULT 0,
    "registrations" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "country_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_budgets" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "month" DATE NOT NULL,
    "monthlyLimitMinor" BIGINT NOT NULL,
    "dailyLimitMinor" BIGINT,
    "currency" CHAR(3) NOT NULL,
    "alertThresholds" INTEGER[] DEFAULT ARRAY[50, 75, 90]::INTEGER[],
    "alertsSent" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "organization_budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "advertising_budget_allocations" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "budgetId" UUID NOT NULL,
    "applicationId" UUID,
    "provider" "AdProvider",
    "platform" "Platform",
    "country" CHAR(2),
    "limitMinor" BIGINT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "advertising_budget_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "advertising_spend" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "connectedAccountId" UUID NOT NULL,
    "campaignId" UUID,
    "provider" "AdProvider" NOT NULL,
    "date" DATE NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "syncedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "advertising_spend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_transactions" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "subscriptionId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "fromPlanKey" TEXT,
    "toPlanKey" TEXT,
    "actor" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_charges" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "month" DATE NOT NULL,
    "metric" TEXT NOT NULL,
    "quantity" BIGINT NOT NULL,
    "amountMinor" BIGINT NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL,
    "invoiceId" UUID,

    CONSTRAINT "usage_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_records" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amountMicros" BIGINT NOT NULL,
    "date" DATE NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "userId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "dedupeKey" TEXT,
    "readAt" TIMESTAMPTZ,
    "emailedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "inApp" BOOLEAN NOT NULL DEFAULT true,
    "email" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "applicationId" UUID,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "data" JSONB,
    "pdfKey" TEXT,
    "csvKey" TEXT,
    "error" TEXT,
    "requestedById" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readyAt" TIMESTAMPTZ,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "actorUserId" UUID,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "security" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "openedById" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "assignedToId" UUID,
    "messages" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "feature_flags" (
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "orgAllowList" TEXT[],
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "api_logs" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "userId" UUID,
    "method" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "error_logs" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "service" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "context" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "error_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_key_key" ON "roles"("key");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE INDEX "organization_members_userId_idx" ON "organization_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "organization_members_organizationId_userId_key" ON "organization_members"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "user_sessions_userId_idx" ON "user_sessions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_sessionId_idx" ON "refresh_tokens"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_tokenHash_key" ON "invitations"("tokenHash");

-- CreateIndex
CREATE INDEX "invitations_organizationId_idx" ON "invitations"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_key_key" ON "subscription_plans"("key");

-- CreateIndex
CREATE INDEX "subscriptions_organizationId_status_idx" ON "subscriptions"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices"("number");

-- CreateIndex
CREATE INDEX "invoices_organizationId_issuedAt_idx" ON "invoices"("organizationId", "issuedAt");

-- CreateIndex
CREATE INDEX "payments_organizationId_idx" ON "payments"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_method_externalId_key" ON "payments"("method", "externalId");

-- CreateIndex
CREATE INDEX "applications_organizationId_deletedAt_idx" ON "applications"("organizationId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "application_platforms_applicationId_platform_key" ON "application_platforms"("applicationId", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "application_platforms_organizationId_platform_storeId_key" ON "application_platforms"("organizationId", "platform", "storeId");

-- CreateIndex
CREATE INDEX "application_store_listings_applicationId_platform_fetchedAt_idx" ON "application_store_listings"("applicationId", "platform", "fetchedAt");

-- CreateIndex
CREATE INDEX "application_assets_applicationId_idx" ON "application_assets"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "application_targets_applicationId_month_key" ON "application_targets"("applicationId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "application_events_applicationId_key_key" ON "application_events"("applicationId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "integration_providers_key_key" ON "integration_providers"("key");

-- CreateIndex
CREATE INDEX "connected_accounts_status_idx" ON "connected_accounts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "connected_accounts_organizationId_providerKey_externalAccou_key" ON "connected_accounts"("organizationId", "providerKey", "externalAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_tokens_connectedAccountId_key" ON "oauth_tokens"("connectedAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_states_stateHash_key" ON "oauth_states"("stateHash");

-- CreateIndex
CREATE UNIQUE INDEX "integration_permissions_connectedAccountId_capability_key" ON "integration_permissions"("connectedAccountId", "capability");

-- CreateIndex
CREATE INDEX "integration_sync_logs_organizationId_startedAt_idx" ON "integration_sync_logs"("organizationId", "startedAt");

-- CreateIndex
CREATE INDEX "integration_sync_logs_providerKey_status_startedAt_idx" ON "integration_sync_logs"("providerKey", "status", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_endpoints_organizationId_providerKey_key" ON "webhook_endpoints"("organizationId", "providerKey");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_providerKey_externalId_key" ON "webhook_events"("providerKey", "externalId");

-- CreateIndex
CREATE INDEX "market_research_applicationId_createdAt_idx" ON "market_research"("applicationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "competitors_applicationId_name_key" ON "competitors"("applicationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "competitor_apps_competitorId_platform_storeId_key" ON "competitor_apps"("competitorId", "platform", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "keyword_research_applicationId_country_keyword_key" ON "keyword_research"("applicationId", "country", "keyword");

-- CreateIndex
CREATE INDEX "aso_audits_applicationId_createdAt_idx" ON "aso_audits"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "marketing_strategies_applicationId_createdAt_idx" ON "marketing_strategies"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "creative_projects_organizationId_applicationId_idx" ON "creative_projects"("organizationId", "applicationId");

-- CreateIndex
CREATE INDEX "creative_assets_organizationId_applicationId_type_idx" ON "creative_assets"("organizationId", "applicationId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "creative_versions_assetId_version_key" ON "creative_versions"("assetId", "version");

-- CreateIndex
CREATE INDEX "creative_approvals_assetId_idx" ON "creative_approvals"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "creative_performance_assetId_campaignId_date_key" ON "creative_performance"("assetId", "campaignId", "date");

-- CreateIndex
CREATE INDEX "campaigns_organizationId_status_idx" ON "campaigns"("organizationId", "status");

-- CreateIndex
CREATE INDEX "campaigns_applicationId_idx" ON "campaigns"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_connectedAccountId_externalCampaignId_key" ON "campaigns"("connectedAccountId", "externalCampaignId");

-- CreateIndex
CREATE INDEX "campaign_budgets_campaignId_effectiveFrom_idx" ON "campaign_budgets"("campaignId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "campaign_metrics_organizationId_date_idx" ON "campaign_metrics"("organizationId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_metrics_campaignId_date_country_key" ON "campaign_metrics"("campaignId", "date", "country");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_actions_idempotencyKey_key" ON "campaign_actions"("idempotencyKey");

-- CreateIndex
CREATE INDEX "campaign_actions_campaignId_createdAt_idx" ON "campaign_actions"("campaignId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ai_providers_key_key" ON "ai_providers"("key");

-- CreateIndex
CREATE UNIQUE INDEX "ai_models_providerId_modelId_key" ON "ai_models"("providerId", "modelId");

-- CreateIndex
CREATE UNIQUE INDEX "ai_agent_definitions_key_key" ON "ai_agent_definitions"("key");

-- CreateIndex
CREATE UNIQUE INDEX "ai_agent_tools_key_key" ON "ai_agent_tools"("key");

-- CreateIndex
CREATE INDEX "ai_agent_executions_organizationId_createdAt_idx" ON "ai_agent_executions"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_agent_executions_status_idx" ON "ai_agent_executions"("status");

-- CreateIndex
CREATE INDEX "ai_execution_logs_executionId_createdAt_idx" ON "ai_execution_logs"("executionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ai_usage_organizationId_date_provider_model_key" ON "ai_usage"("organizationId", "date", "provider", "model");

-- CreateIndex
CREATE UNIQUE INDEX "automation_workflows_key_key" ON "automation_workflows"("key");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_versions_workflowId_version_key" ON "workflow_versions"("workflowId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_executions_idempotencyKey_key" ON "workflow_executions"("idempotencyKey");

-- CreateIndex
CREATE INDEX "workflow_executions_organizationId_createdAt_idx" ON "workflow_executions"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "workflow_executions_workflowKey_status_idx" ON "workflow_executions"("workflowKey", "status");

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_jobs_key_key" ON "scheduled_jobs"("key");

-- CreateIndex
CREATE INDEX "optimization_decisions_organizationId_createdAt_idx" ON "optimization_decisions"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "attribution_sources_applicationId_provider_key" ON "attribution_sources"("applicationId", "provider");

-- CreateIndex
CREATE INDEX "install_events_organizationId_installedAt_idx" ON "install_events"("organizationId", "installedAt");

-- CreateIndex
CREATE INDEX "install_events_applicationId_installedAt_idx" ON "install_events"("applicationId", "installedAt");

-- CreateIndex
CREATE UNIQUE INDEX "install_events_applicationId_dedupeKey_key" ON "install_events"("applicationId", "dedupeKey");

-- CreateIndex
CREATE INDEX "attribution_events_organizationId_date_idx" ON "attribution_events"("organizationId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "attribution_events_applicationId_dedupeKey_key" ON "attribution_events"("applicationId", "dedupeKey");

-- CreateIndex
CREATE INDEX "conversion_events_applicationId_eventKey_occurredAt_idx" ON "conversion_events"("applicationId", "eventKey", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "conversion_events_applicationId_dedupeKey_key" ON "conversion_events"("applicationId", "dedupeKey");

-- CreateIndex
CREATE INDEX "analytics_daily_organizationId_date_idx" ON "analytics_daily"("organizationId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_daily_applicationId_platform_date_key" ON "analytics_daily"("applicationId", "platform", "date");

-- CreateIndex
CREATE INDEX "analytics_campaign_daily_organizationId_date_idx" ON "analytics_campaign_daily"("organizationId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_campaign_daily_campaignId_date_key" ON "analytics_campaign_daily"("campaignId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "retention_metrics_applicationId_cohortDate_source_campaignI_key" ON "retention_metrics"("applicationId", "cohortDate", "source", "campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "country_metrics_applicationId_country_date_key" ON "country_metrics"("applicationId", "country", "date");

-- CreateIndex
CREATE UNIQUE INDEX "organization_budgets_organizationId_month_key" ON "organization_budgets"("organizationId", "month");

-- CreateIndex
CREATE INDEX "advertising_budget_allocations_budgetId_idx" ON "advertising_budget_allocations"("budgetId");

-- CreateIndex
CREATE INDEX "advertising_spend_organizationId_date_idx" ON "advertising_spend"("organizationId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "advertising_spend_connectedAccountId_campaignId_date_key" ON "advertising_spend"("connectedAccountId", "campaignId", "date");

-- CreateIndex
CREATE INDEX "subscription_transactions_organizationId_idx" ON "subscription_transactions"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "usage_charges_organizationId_month_metric_key" ON "usage_charges"("organizationId", "month", "metric");

-- CreateIndex
CREATE INDEX "cost_records_date_idx" ON "cost_records"("date");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_createdAt_idx" ON "notifications"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_userId_dedupeKey_key" ON "notifications"("userId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_organizationId_userId_kind_key" ON "notification_preferences"("organizationId", "userId", "kind");

-- CreateIndex
CREATE INDEX "reports_organizationId_createdAt_idx" ON "reports"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_createdAt_idx" ON "audit_logs"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_security_createdAt_idx" ON "audit_logs"("security", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "support_tickets_status_updatedAt_idx" ON "support_tickets"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "support_tickets_organizationId_idx" ON "support_tickets"("organizationId");

-- CreateIndex
CREATE INDEX "api_logs_createdAt_idx" ON "api_logs"("createdAt");

-- CreateIndex
CREATE INDEX "api_logs_organizationId_createdAt_idx" ON "api_logs"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "error_logs_createdAt_idx" ON "error_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "user_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_platforms" ADD CONSTRAINT "application_platforms_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_store_listings" ADD CONSTRAINT "application_store_listings_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_assets" ADD CONSTRAINT "application_assets_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_countries" ADD CONSTRAINT "application_countries_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_languages" ADD CONSTRAINT "application_languages_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_targets" ADD CONSTRAINT "application_targets_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connected_accounts" ADD CONSTRAINT "connected_accounts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_tokens" ADD CONSTRAINT "oauth_tokens_connectedAccountId_fkey" FOREIGN KEY ("connectedAccountId") REFERENCES "connected_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_permissions" ADD CONSTRAINT "integration_permissions_connectedAccountId_fkey" FOREIGN KEY ("connectedAccountId") REFERENCES "connected_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_applications" ADD CONSTRAINT "account_applications_connectedAccountId_fkey" FOREIGN KEY ("connectedAccountId") REFERENCES "connected_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitor_apps" ADD CONSTRAINT "competitor_apps_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "competitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creative_assets" ADD CONSTRAINT "creative_assets_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "creative_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creative_versions" ADD CONSTRAINT "creative_versions_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "creative_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creative_approvals" ADD CONSTRAINT "creative_approvals_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "creative_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creative_performance" ADD CONSTRAINT "creative_performance_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "creative_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_connectedAccountId_fkey" FOREIGN KEY ("connectedAccountId") REFERENCES "connected_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "campaign_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_adsets" ADD CONSTRAINT "campaign_adsets_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_ads" ADD CONSTRAINT "campaign_ads_adsetId_fkey" FOREIGN KEY ("adsetId") REFERENCES "campaign_adsets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_creatives" ADD CONSTRAINT "campaign_creatives_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_budgets" ADD CONSTRAINT "campaign_budgets_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_metrics" ADD CONSTRAINT "campaign_metrics_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_actions" ADD CONSTRAINT "campaign_actions_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_experiments" ADD CONSTRAINT "campaign_experiments_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_models" ADD CONSTRAINT "ai_models_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ai_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_execution_logs" ADD CONSTRAINT "ai_execution_logs_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "ai_agent_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_policies" ADD CONSTRAINT "automation_policies_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "automation_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_budgets" ADD CONSTRAINT "organization_budgets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advertising_budget_allocations" ADD CONSTRAINT "advertising_budget_allocations_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "organization_budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
