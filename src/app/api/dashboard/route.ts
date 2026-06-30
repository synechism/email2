import { NextResponse } from "next/server";

import { getDashboardData } from "@/lib/dashboard";
import { getRequestOrgContext } from "@/lib/auth-server";

export const runtime = "nodejs";

export async function GET() {
  const context = await getRequestOrgContext();

  if (!context) {
    return NextResponse.json({ error: "Sign in and create an organization first." }, { status: 401 });
  }

  return NextResponse.json(await getDashboardData(context.org.id));
}
