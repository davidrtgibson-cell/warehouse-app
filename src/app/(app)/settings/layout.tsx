import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

// The one place that gates every /settings/* page to ADMIN — a LEADER
// signed in via the (app) layout's login check gets bounced back to the
// live board rather than seeing any configuration screen. Matches
// requireAdmin() in src/lib/auth.ts, which gates the underlying server
// actions independently (defense in depth, not redundancy — this stops a
// LEADER from ever seeing the form; that stops a crafted request from
// working even without one).
export default async function SettingsLayout({ children }: LayoutProps<"/settings">) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") redirect("/");
  return <>{children}</>;
}
