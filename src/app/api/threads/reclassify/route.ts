import { NextResponse } from "next/server";

import { getRequestOrgContext } from "@/lib/auth-server";
import { reclassifyOrganizationThreads } from "@/lib/nylas/scraper";

export const runtime = "nodejs";

export async function POST() {
  const context = await getRequestOrgContext();

  if (!context) {
    return NextResponse.json({ error: "Sign in and create an organization first." }, { status: 401 });
  }

  try {
    return NextResponse.json(await reclassifyOrganizationThreads(context.org.id));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to reclassify threads." },
      { status: 500 },
    );
  }
}
