"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";

import { authClient } from "@/lib/auth-client";

export function OrgSetup({ userName }: { userName: string }) {
  const router = useRouter();
  const [name, setName] = useState(`${userName || "My"} Workspace`);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const slug = useMemo(() => slugify(name), [name]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const result = await authClient.organization.create({
        name,
        slug,
      });

      if (result.error) {
        setError(result.error.message ?? "Unable to create organization.");
        return;
      }

      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create organization.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="brand-lockup">
          <div className="brand-mark">
            <Building2 size={20} />
          </div>
          <div>
            <p className="eyebrow">Organization</p>
            <h1>Create workspace</h1>
          </div>
        </div>
        <form className="stack-form" onSubmit={onSubmit}>
          <label>
            Organization name
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <label>
            Slug
            <input value={slug} readOnly />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <button className="primary-button" type="submit" disabled={pending}>
            <Building2 size={16} />
            {pending ? "Creating" : "Create workspace"}
          </button>
        </form>
      </section>
    </main>
  );
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "workspace";
}
