import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db/client";
import { createId } from "@/db/ids";
import { nylasGrant } from "@/db/schema";
import { getRequestOrgContext } from "@/lib/auth-server";
import { getGrantProfile } from "@/lib/nylas/http";
import { runNylasScrape } from "@/lib/nylas/scraper";

export const runtime = "nodejs";

const bodySchema = z.object({
  grantId: z.string().min(3),
  email: z.string().email().optional().or(z.literal("")),
  provider: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const context = await getRequestOrgContext();

  if (!context) {
    return NextResponse.json({ error: "Sign in and create an organization first." }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const profile = await getGrantProfile(parsed.data.grantId).catch(() => ({
      grantId: parsed.data.grantId,
      email: parsed.data.email || undefined,
      provider: parsed.data.provider,
    }));
    const now = new Date();

    const [grant] = await db
      .insert(nylasGrant)
      .values({
        id: createId("grant"),
        organizationId: context.org.id,
        connectedByUserId: context.session.user.id,
        grantId: profile.grantId,
        email: (profile.email ?? parsed.data.email) || null,
        provider: profile.provider ?? parsed.data.provider ?? null,
        status: "connected",
        scrapeStatus: "idle",
      })
      .onConflictDoUpdate({
        target: nylasGrant.grantId,
        set: {
          organizationId: context.org.id,
          connectedByUserId: context.session.user.id,
          email: (profile.email ?? parsed.data.email) || null,
          provider: profile.provider ?? parsed.data.provider ?? null,
          status: "connected",
          scrapeStatus: "idle",
          lastError: null,
          updatedAt: now,
        },
      })
      .returning({ id: nylasGrant.id });

    const scrape = grant ? await runNylasScrape(grant.id) : null;

    return NextResponse.json({ grant, scrape });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to add grant." }, { status: 500 });
  }
}
