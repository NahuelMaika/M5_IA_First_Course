/**
 * Category repository (spec-FEAT-002 Block 8).
 *
 * Receives `PrismaClient` as a parameter, never imports one as a singleton (NFR-04). Contains no
 * business logic: it only maps Prisma rows to the shapes the service (Block 9) consumes --
 * `findVisibleForUser` in particular returns `VisibleCategory[]` from `@ggasia/categorization`
 * (consumed compiled, per AGENTS.md), the exact shape `resolveCategoryName` (Block 5/ADR-004)
 * expects as input.
 */
import type { VisibleCategory } from "@ggasia/categorization";
import type { Category, PrismaClient } from "../generated/prisma/client.ts";

export async function findVisibleForUser(
  prisma: PrismaClient,
  userId: string,
): Promise<VisibleCategory[]> {
  const categories = await prisma.category.findMany({
    where: {
      OR: [{ ownerId: null }, { ownerId: userId }],
    },
  });

  return categories.map((category) => ({ name: category.name, active: category.active }));
}

export interface VisibleCategoryWithId {
  id: string;
  name: string;
  active: boolean;
}

/**
 * Same visibility rule as `findVisibleForUser` (predefined + the user's own), but the mapping
 * includes `id` -- needed by the service layer (spec-FEAT-005a Block 4) to validate a `categoryId`
 * patch against the categories actually visible to that user (mitigation R2). `findVisibleForUser`
 * itself is never touched: its `{name, active}` shape is a hard contract with `resolveCategoryName`.
 */
export async function findVisibleForUserWithId(
  prisma: PrismaClient,
  userId: string,
): Promise<VisibleCategoryWithId[]> {
  const categories = await prisma.category.findMany({
    where: {
      OR: [{ ownerId: null }, { ownerId: userId }],
    },
  });

  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    active: category.active,
  }));
}

export interface CreateCategoryInput {
  name: string;
  nameNormalized: string;
  ownerId: string;
}

export async function create(prisma: PrismaClient, data: CreateCategoryInput): Promise<Category> {
  // A P2002 raised by the partial unique index (Block 2) is re-thrown as-is on purpose -- this
  // repository never silences it nor translates it to a default value (spec Error handling).
  return prisma.category.create({
    data: {
      name: data.name,
      nameNormalized: data.nameNormalized,
      ownerId: data.ownerId,
    },
  });
}

export async function findPredefinedByName(
  prisma: PrismaClient,
  name: string,
): Promise<Category | null> {
  return prisma.category.findFirst({ where: { ownerId: null, name } });
}

/**
 * Finds a category by exact `name`, visible to `userId`: either predefined (`ownerId: null`) or
 * owned by the user. Used by the service (Block 9) to resolve a marker name that
 * `resolveCategoryName` already matched against `findVisibleForUser`'s output back to its id.
 */
export async function findByNameForUser(
  prisma: PrismaClient,
  userId: string,
  name: string,
): Promise<Category | null> {
  return prisma.category.findFirst({
    where: {
      name,
      OR: [{ ownerId: null }, { ownerId: userId }],
    },
  });
}
