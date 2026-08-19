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
