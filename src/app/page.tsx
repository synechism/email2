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
  const connected = params.connected === "nylas";
  const error = typeof params.error === "string" ? params.error : null;

  return (
    <Dashboard
      initialData={data}
      organization={org}
      user={{ name: session.user.name, email: session.user.email }}
      flash={connected ? "Nylas grant connected. First scrape batch finished." : error}
    />
  );
}
