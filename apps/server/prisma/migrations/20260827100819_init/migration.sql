-- CreateEnum
CREATE TYPE "MissionStatus" AS ENUM ('active', 'complete', 'claimed', 'failed', 'abandoned', 'expired');

-- CreateEnum
CREATE TYPE "ExpeditionStatus" AS ENUM ('travelling', 'active', 'returning', 'complete', 'aborted');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('open', 'sold', 'cancelled');

-- CreateEnum
CREATE TYPE "ListingCurrency" AS ENUM ('credits', 'eth');

-- CreateEnum
CREATE TYPE "FriendStatus" AS ENUM ('pending', 'accepted', 'declined', 'blocked');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "playtimeSec" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "credits" BIGINT NOT NULL DEFAULT 0,
    "health" INTEGER NOT NULL DEFAULT 100,
    "energy" INTEGER NOT NULL DEFAULT 100,
    "primaryFaction" TEXT,
    "missionsCompleted" INTEGER NOT NULL DEFAULT 0,
    "resourcesMined" BIGINT NOT NULL DEFAULT 0,
    "creditsEarned" BIGINT NOT NULL DEFAULT 0,
    "itemsCrafted" INTEGER NOT NULL DEFAULT 0,
    "expeditionsDone" INTEGER NOT NULL DEFAULT 0,
    "tradesDone" INTEGER NOT NULL DEFAULT 0,
    "distanceWalked" INTEGER NOT NULL DEFAULT 0,
    "banned" BOOLEAN NOT NULL DEFAULT false,
    "banReason" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Avatar" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "suitId" TEXT NOT NULL DEFAULT 'suit_standard',
    "helmetId" TEXT NOT NULL DEFAULT 'helmet_standard',
    "suitPattern" TEXT NOT NULL DEFAULT 'pattern_plain',
    "visor" TEXT NOT NULL DEFAULT 'visor_ice',
    "emblem" TEXT NOT NULL DEFAULT 'emblem_federation',
    "accessory" TEXT NOT NULL DEFAULT 'accessory_pack',
    "primaryColor" TEXT NOT NULL DEFAULT '#38bdf8',
    "secondaryColor" TEXT NOT NULL DEFAULT '#0f172a',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Avatar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthNonce" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthNonce_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rarity" TEXT NOT NULL,
    "baseValue" INTEGER NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Faction" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "motto" TEXT NOT NULL,

    CONSTRAINT "Faction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mission" (
    "id" TEXT NOT NULL,
    "code" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "difficulty" INTEGER NOT NULL,
    "faction" TEXT NOT NULL,

    CONSTRAINT "Mission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Achievement" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "points" INTEGER NOT NULL,

    CONSTRAINT "Achievement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StationArea" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "requiredLevel" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StationArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "defId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "equipped" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ship" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "defId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "fuel" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tokenId" TEXT,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipUpgrade" (
    "id" TEXT NOT NULL,
    "shipId" TEXT NOT NULL,
    "stat" TEXT NOT NULL,
    "tier" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ShipUpgrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipModule" (
    "id" TEXT NOT NULL,
    "shipId" TEXT NOT NULL,
    "slotIndex" INTEGER NOT NULL,
    "moduleDefId" TEXT NOT NULL,

    CONSTRAINT "ShipModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerFaction" (
    "userId" TEXT NOT NULL,
    "factionId" TEXT NOT NULL,
    "reputation" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerFaction_pkey" PRIMARY KEY ("userId","factionId")
);

-- CreateTable
CREATE TABLE "PlayerMission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "status" "MissionStatus" NOT NULL DEFAULT 'active',
    "progress" INTEGER[],
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "rewardSeed" BIGINT NOT NULL,

    CONSTRAINT "PlayerMission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerAchievement" (
    "userId" TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerAchievement_pkey" PRIMARY KEY ("userId","achievementId")
);

-- CreateTable
CREATE TABLE "Expedition" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shipId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "status" "ExpeditionStatus" NOT NULL DEFAULT 'travelling',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "arrivesAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "fuelAtStart" DOUBLE PRECISION NOT NULL,
    "fuelUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cargoUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fieldSeed" INTEGER NOT NULL,
    "rollSeed" BIGINT NOT NULL,
    "rollCounter" INTEGER NOT NULL DEFAULT 0,
    "minedNodes" INTEGER[],
    "scannedNodes" INTEGER[],
    "haul" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "Expedition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CraftJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readyAt" TIMESTAMP(3) NOT NULL,
    "collected" BOOLEAN NOT NULL DEFAULT false,
    "seed" BIGINT NOT NULL,

    CONSTRAINT "CraftJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceListing" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "buyerId" TEXT,
    "kind" TEXT NOT NULL,
    "defId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 1,
    "price" BIGINT NOT NULL,
    "currency" "ListingCurrency" NOT NULL DEFAULT 'credits',
    "status" "ListingStatus" NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "soldAt" TIMESTAMP(3),
    "chainListingId" TEXT,
    "collection" TEXT,
    "tokenId" TEXT,
    "standard" TEXT,

    CONSTRAINT "MarketplaceListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlockchainAsset" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "collection" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "standard" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "amount" TEXT NOT NULL DEFAULT '1',
    "kind" TEXT NOT NULL,
    "defId" TEXT NOT NULL,
    "lastBlock" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlockchainAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChainTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "txHash" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "intent" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "blockNumber" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "ChainTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndexerCursor" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "contract" TEXT NOT NULL,
    "lastBlock" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndexerCursor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Friendship" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "addresseeId" TEXT NOT NULL,
    "status" "FriendStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "Friendship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "toUserId" TEXT,
    "channel" TEXT NOT NULL,
    "area" TEXT,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "ip" TEXT,

    CONSTRAINT "PlayerSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AreaVisit" (
    "userId" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "firstVisitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastVisitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "visits" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "AreaVisit_pkey" PRIMARY KEY ("userId","areaId")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "delta" BIGINT NOT NULL,
    "balanceAfter" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "refId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_address_key" ON "User"("address");

-- CreateIndex
CREATE INDEX "User_level_idx" ON "User"("level" DESC);

-- CreateIndex
CREATE INDEX "User_lastSeenAt_idx" ON "User"("lastSeenAt" DESC);

-- CreateIndex
CREATE INDEX "User_credits_idx" ON "User"("credits" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Avatar_userId_key" ON "Avatar"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthNonce_nonce_key" ON "AuthNonce"("nonce");

-- CreateIndex
CREATE INDEX "AuthNonce_address_idx" ON "AuthNonce"("address");

-- CreateIndex
CREATE INDEX "AuthNonce_expiresAt_idx" ON "AuthNonce"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Mission_code_key" ON "Mission"("code");

-- CreateIndex
CREATE INDEX "InventoryItem_userId_kind_idx" ON "InventoryItem"("userId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_userId_kind_defId_key" ON "InventoryItem"("userId", "kind", "defId");

-- CreateIndex
CREATE INDEX "Ship_userId_idx" ON "Ship"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Ship_userId_tokenId_key" ON "Ship"("userId", "tokenId");

-- CreateIndex
CREATE UNIQUE INDEX "ShipUpgrade_shipId_stat_key" ON "ShipUpgrade"("shipId", "stat");

-- CreateIndex
CREATE UNIQUE INDEX "ShipModule_shipId_slotIndex_key" ON "ShipModule"("shipId", "slotIndex");

-- CreateIndex
CREATE INDEX "PlayerFaction_factionId_reputation_idx" ON "PlayerFaction"("factionId", "reputation" DESC);

-- CreateIndex
CREATE INDEX "PlayerMission_userId_status_idx" ON "PlayerMission"("userId", "status");

-- CreateIndex
CREATE INDEX "PlayerMission_userId_missionId_status_idx" ON "PlayerMission"("userId", "missionId", "status");

-- CreateIndex
CREATE INDEX "PlayerMission_expiresAt_idx" ON "PlayerMission"("expiresAt");

-- CreateIndex
CREATE INDEX "Expedition_userId_status_idx" ON "Expedition"("userId", "status");

-- CreateIndex
CREATE INDEX "CraftJob_userId_collected_idx" ON "CraftJob"("userId", "collected");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceListing_chainListingId_key" ON "MarketplaceListing"("chainListingId");

-- CreateIndex
CREATE INDEX "MarketplaceListing_status_createdAt_idx" ON "MarketplaceListing"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "MarketplaceListing_status_price_idx" ON "MarketplaceListing"("status", "price");

-- CreateIndex
CREATE INDEX "MarketplaceListing_sellerId_status_idx" ON "MarketplaceListing"("sellerId", "status");

-- CreateIndex
CREATE INDEX "MarketplaceListing_kind_status_idx" ON "MarketplaceListing"("kind", "status");

-- CreateIndex
CREATE INDEX "BlockchainAsset_owner_idx" ON "BlockchainAsset"("owner");

-- CreateIndex
CREATE INDEX "BlockchainAsset_chainId_collection_idx" ON "BlockchainAsset"("chainId", "collection");

-- CreateIndex
CREATE UNIQUE INDEX "BlockchainAsset_chainId_collection_tokenId_owner_key" ON "BlockchainAsset"("chainId", "collection", "tokenId", "owner");

-- CreateIndex
CREATE UNIQUE INDEX "ChainTransaction_txHash_key" ON "ChainTransaction"("txHash");

-- CreateIndex
CREATE INDEX "ChainTransaction_userId_createdAt_idx" ON "ChainTransaction"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ChainTransaction_status_idx" ON "ChainTransaction"("status");

-- CreateIndex
CREATE UNIQUE INDEX "IndexerCursor_chainId_contract_key" ON "IndexerCursor"("chainId", "contract");

-- CreateIndex
CREATE INDEX "Friendship_addresseeId_status_idx" ON "Friendship"("addresseeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Friendship_requesterId_addresseeId_key" ON "Friendship"("requesterId", "addresseeId");

-- CreateIndex
CREATE INDEX "ChatMessage_channel_createdAt_idx" ON "ChatMessage"("channel", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ChatMessage_toUserId_createdAt_idx" ON "ChatMessage"("toUserId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PlayerSession_userId_startedAt_idx" ON "PlayerSession"("userId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "LedgerEntry_userId_createdAt_idx" ON "LedgerEntry"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "LedgerEntry_kind_createdAt_idx" ON "LedgerEntry"("kind", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "Avatar" ADD CONSTRAINT "Avatar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ship" ADD CONSTRAINT "Ship_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipUpgrade" ADD CONSTRAINT "ShipUpgrade_shipId_fkey" FOREIGN KEY ("shipId") REFERENCES "Ship"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipModule" ADD CONSTRAINT "ShipModule_shipId_fkey" FOREIGN KEY ("shipId") REFERENCES "Ship"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerFaction" ADD CONSTRAINT "PlayerFaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerFaction" ADD CONSTRAINT "PlayerFaction_factionId_fkey" FOREIGN KEY ("factionId") REFERENCES "Faction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerMission" ADD CONSTRAINT "PlayerMission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerMission" ADD CONSTRAINT "PlayerMission_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerAchievement" ADD CONSTRAINT "PlayerAchievement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerAchievement" ADD CONSTRAINT "PlayerAchievement_achievementId_fkey" FOREIGN KEY ("achievementId") REFERENCES "Achievement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expedition" ADD CONSTRAINT "Expedition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expedition" ADD CONSTRAINT "Expedition_shipId_fkey" FOREIGN KEY ("shipId") REFERENCES "Ship"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CraftJob" ADD CONSTRAINT "CraftJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChainTransaction" ADD CONSTRAINT "ChainTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_addresseeId_fkey" FOREIGN KEY ("addresseeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerSession" ADD CONSTRAINT "PlayerSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AreaVisit" ADD CONSTRAINT "AreaVisit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AreaVisit" ADD CONSTRAINT "AreaVisit_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "StationArea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
