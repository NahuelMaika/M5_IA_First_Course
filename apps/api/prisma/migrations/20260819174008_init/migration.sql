-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateEnum
CREATE TYPE "category_origin" AS ENUM ('automatica', 'marcador');

-- CreateEnum
CREATE TYPE "expense_type" AS ENUM ('Personal');

-- CreateEnum
CREATE TYPE "expense_channel" AS ENUM ('texto');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "name_normalized" TEXT NOT NULL,
    "owner_id" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "place" TEXT NOT NULL,
    "when" TIMESTAMP(3) NOT NULL,
    "category_id" UUID NOT NULL,
    "category_origin" "category_origin" NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "type" "expense_type" NOT NULL DEFAULT 'Personal',
    "currency" TEXT NOT NULL DEFAULT 'ARS',
    "raw_input" VARCHAR(500) NOT NULL,
    "channel" "expense_channel" NOT NULL DEFAULT 'texto',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- ============================================================================
-- MANUAL EDIT (spec-FEAT-002 Block 2 / F-SPEC-08) -- DO NOT REVERT.
--
-- The two indexes below enforce category-name uniqueness on `name_normalized`
-- (computed by the app with normalize() from @ggasia/categorization, never in
-- SQL). They are PARTIAL unique indexes -- Prisma's schema.prisma DSL has no
-- syntax for a conditional/filtered index (`@@unique` always applies to the
-- whole table, unconditionally), so they cannot be generated from the
-- Prisma schema and were added here by hand after `prisma migrate diff`.
--
-- Consequence: the next time someone runs `prisma migrate dev` and Prisma
-- recomputes a diff against `schema.prisma`, it will NOT see these indexes in
-- the DSL and may propose dropping/recreating them as drift. Do not let it --
-- these two indexes are the actual enforcement of AC-10 (no duplicate
-- predefined category; no duplicate owned category per user). If Prisma
-- flags drift here, resolve it by keeping this SQL, not by accepting an
-- auto-generated migration that removes it.
-- ============================================================================

-- CreateIndex: predefined categories (owner_id IS NULL) cannot repeat a
-- normalized name.
CREATE UNIQUE INDEX "categories_name_normalized_predefined_key"
    ON "categories"("name_normalized")
    WHERE "owner_id" IS NULL;

-- CreateIndex: a given user cannot own two categories with the same
-- normalized name. Different users MAY share a normalized name (RF-14 --
-- categories created by marker are per-user).
CREATE UNIQUE INDEX "categories_owner_id_name_normalized_owned_key"
    ON "categories"("owner_id", "name_normalized")
    WHERE "owner_id" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
