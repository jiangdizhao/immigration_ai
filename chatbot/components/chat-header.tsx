"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo } from "react";
import { Building2, Plus } from "lucide-react";
import { useWindowSize } from "usehooks-ts";
import { SidebarToggle } from "@/components/sidebar-toggle";
import { Button } from "@/components/ui/button";
import { useSidebar } from "./ui/sidebar";
import { VisibilitySelector, type VisibilityType } from "./visibility-selector";

function PureChatHeader({
  chatId,
  selectedVisibilityType,
  isReadonly,
}: {
  chatId: string;
  selectedVisibilityType: VisibilityType;
  isReadonly: boolean;
}) {
  const router = useRouter();
  const { open } = useSidebar();
  const { width: windowWidth } = useWindowSize();

  return (
    <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-slate-200 bg-white/95 px-2 py-2 backdrop-blur md:px-3">
      <SidebarToggle />

      {(!open || windowWidth < 768) && (
        <Button
          className="order-2 ml-auto h-8 rounded-full px-3 md:order-1 md:ml-0 md:h-9"
          onClick={() => {
            router.push("/");
            router.refresh();
          }}
          variant="outline"
        >
          <Plus className="mr-1 size-4" />
          <span className="text-sm">New consultation</span>
        </Button>
      )}

      {!isReadonly && (
        <VisibilitySelector
          chatId={chatId}
          className="order-1 md:order-2"
          selectedVisibilityType={selectedVisibilityType}
        />
      )}

      <Button
        asChild
        className="order-3 hidden rounded-full bg-slate-900 px-3 text-white hover:bg-slate-800 md:ml-auto md:flex md:h-9"
      >
        <Link href="/">
          <Building2 className="mr-2 size-4" />
          Back to service center
        </Link>
      </Button>
    </header>
  );
}

export const ChatHeader = memo(PureChatHeader, (prevProps, nextProps) => {
  return (
    prevProps.chatId === nextProps.chatId &&
    prevProps.selectedVisibilityType === nextProps.selectedVisibilityType &&
    prevProps.isReadonly === nextProps.isReadonly
  );
});
