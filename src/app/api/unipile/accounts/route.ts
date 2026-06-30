import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getRequestOrgContext } from "@/lib/auth-server";
import { enqueueEmailDiscoveryJob } from "@/lib/queues/email";
import { upsertUnipileAccount } from "@/lib/unipile/scraper";

export const runtime = "nodejs";

const bodySchema = z.object({
  accountId: z.string().min(3),
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
    const account = await upsertUnipileAccount({
      accountId: parsed.data.accountId,
      organizationId: context.org.id,
      connectedByUserId: context.session.user.id,
    });
    const job = account ? await enqueueEmailDiscoveryJob({ provider: "unipile", id: account.id }) : null;

    return NextResponse.json({ account, jobId: job?.id ?? null });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to add Unipile account." },
      { status: 500 },
    );
  }
}
