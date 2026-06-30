import { NextRequest, NextResponse } from "next/server";

import { getRequestOrgContext } from "@/lib/auth-server";
import { enqueueMailboxDiscovery, MailboxNotFoundError } from "@/lib/email/service";

export const runtime = "nodejs";

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const requestContext = await getRequestOrgContext();

  if (!requestContext) {
    return NextResponse.json({ error: "Sign in and create an organization first." }, { status: 401 });
  }

  const { id } = await context.params;
  try {
    const job = await enqueueMailboxDiscovery({ mailboxId: id, organizationId: requestContext.org.id });
    return NextResponse.json({ queued: true, jobId: job.id });
  } catch (error) {
    if (error instanceof MailboxNotFoundError) {
      return NextResponse.json({ error: "Unipile account not found." }, { status: 404 });
    }

    throw error;
  }
}
