import { NextRequest, NextResponse } from "next/server";

import { getRequestOrgContext } from "@/lib/auth-server";
import { deleteMailboxLocalData, MailboxNotFoundError } from "@/lib/email/service";

export const runtime = "nodejs";

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const requestContext = await getRequestOrgContext();

  if (!requestContext) {
    return NextResponse.json({ error: "Sign in and create an organization first." }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    return NextResponse.json(await deleteMailboxLocalData(id, requestContext.org.id));
  } catch (error) {
    if (error instanceof MailboxNotFoundError) {
      return NextResponse.json({ error: "Mailbox not found." }, { status: 404 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete mailbox." },
      { status: 500 },
    );
  }
}
