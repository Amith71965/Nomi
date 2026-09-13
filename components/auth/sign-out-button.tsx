"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createBrowserSupabase } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    try {
      await createBrowserSupabase().auth.signOut();
      router.replace("/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="quiet" size="sm" onClick={onClick} disabled={busy}>
      {busy ? "Signing out…" : "Sign out"}
    </Button>
  );
}
