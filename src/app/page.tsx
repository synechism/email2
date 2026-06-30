import { AuthPanel } from "@/components/AuthPanel";
import { Dashboard } from "@/components/Dashboard";
import { OrgSetup } from "@/components/OrgSetup";
import { getDashboardData } from "@/lib/dashboard";
import { getCurrentSession, getPrimaryOrganization } from "@/lib/auth-server";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  const session = await getCurrentSession();
  const params = await searchParams;

  if (!session) {
    return <AuthPanel />;
  }

  const org = await getPrimaryOrganization(session.user.id, session.session.activeOrganizationId);

  if (!org) {
    return <OrgSetup userName={session.user.name} />;
  }

  const data = JSON.parse(JSON.stringify(await getDashboardData(org.id)));
  const connected = typeof params.connected === "string" ? params.connected : null;
  const error = typeof params.error === "string" ? params.error : null;
  const flash =
    connected === "nylas"
      ? "Nylas grant connected. Scrape queued in the background."
      : connected === "unipile"
        ? "Unipile account connected. Scrape queued in the background."
        : null;

  return (
    <Dashboard
      initialData={data}
      organization={org}
      user={{ name: session.user.name, email: session.user.email }}
      flash={flash}
      initialError={error}
    />
  );
}
