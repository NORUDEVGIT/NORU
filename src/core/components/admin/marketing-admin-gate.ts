import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export function marketingAdminHead() {
  return {
    meta: [
      { title: "Marketing — NORU Admin" },
      { name: "description", content: "Platform Admin marketing CMS forms. Presentation only — not entitlements." },
      { property: "og:title", content: "Marketing — NORU Admin" },
      { property: "og:description", content: "Edit public marketing content. Does not change package entitlements." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  };
}

/** Same session gate as other /admin pages. Authorization still runs in AdminShell. */
export async function requireAdminSession() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw redirect({ to: "/admin/login" });
}
