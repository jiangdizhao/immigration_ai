"use client";

import { usePathname } from "next/navigation";
import type { User } from "next-auth";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export function ChatRouteShell({
  children,
  defaultOpen,
  user,
}: {
  children: React.ReactNode;
  defaultOpen: boolean;
  user: User | undefined;
}) {
  const pathname = usePathname();
  const isServiceCenterHome = pathname === "/";

  if (isServiceCenterHome) {
    return <div className="min-h-dvh bg-background">{children}</div>;
  }

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar user={user} />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
