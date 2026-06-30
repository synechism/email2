import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { member, organization } from "@/db/schema";
import { auth } from "@/lib/auth";

export async function getCurrentSession() {
  return auth.api.getSession({
    headers: await headers(),
  });
}

export async function getPrimaryOrganization(userId: string, activeOrganizationId?: string | null) {
  if (activeOrganizationId) {
    const [active] = await db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        role: member.role,
      })
      .from(member)
      .innerJoin(organization, eq(member.organizationId, organization.id))
      .where(and(eq(member.organizationId, activeOrganizationId), eq(member.userId, userId)))
      .limit(1);

    if (active) {
      return active;
    }
  }

  const [first] = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      role: member.role,
    })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(eq(member.userId, userId))
    .limit(1);

  return first ?? null;
}

export async function getRequestOrgContext() {
  const session = await getCurrentSession();

  if (!session) {
    return null;
  }

  const org = await getPrimaryOrganization(session.user.id, session.session.activeOrganizationId);

  if (!org) {
    return null;
  }

  return {
    session,
    org,
  };
}
