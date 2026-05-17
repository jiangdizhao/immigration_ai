"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Scale, X } from "lucide-react";
import { useState } from "react";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "AI Workspace", href: "/ai-workspace" },
  { label: "Services", href: "/services" },
  { label: "Process", href: "/process" },
  { label: "Contact", href: "/contact" },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#001736]/95 text-white shadow-[0_10px_40px_-22px_rgba(0,0,0,0.75)] backdrop-blur-2xl">
      <div className="mx-auto flex min-h-[72px] w-full max-w-7xl items-center justify-between px-5 lg:px-8">
        <Link className="group flex items-center gap-3" href="/" onClick={() => setMobileOpen(false)}>
          <div className="rounded-2xl border border-white/15 bg-white/10 p-2 shadow-sm transition group-hover:bg-white/15">
            <Scale className="size-5" />
          </div>
          <div>
            <p className="font-semibold leading-tight tracking-tight">Sovereign Nexus Legal</p>
            <p className="text-xs leading-tight text-slate-300">AI-assisted migration intake</p>
          </div>
        </Link>

        <nav className="hidden items-center gap-2 md:flex">
          {navItems.map((item) => {
            const active = isActivePath(pathname, item.href);
            return (
              <Link
                className={cn(
                  "rounded-full px-4 py-2 text-sm transition",
                  active
                    ? "bg-white/15 text-white shadow-inner"
                    : "text-slate-200 hover:bg-white/10 hover:text-white"
                )}
                href={item.href}
                key={item.href}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Button asChild className="rounded-full bg-white px-5 text-[#001736] hover:bg-slate-100">
            <Link href="/ai-workspace">Talk to AI</Link>
          </Button>
        </div>

        <button
          aria-label="Open navigation"
          className="rounded-full border border-white/15 bg-white/10 p-2 text-white md:hidden"
          onClick={() => setMobileOpen((value) => !value)}
          type="button"
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {mobileOpen ? (
        <div className="border-t border-white/10 bg-[#001736] px-5 py-4 md:hidden">
          <nav className="grid gap-2">
            {navItems.map((item) => {
              const active = isActivePath(pathname, item.href);
              return (
                <Link
                  className={cn(
                    "rounded-2xl px-4 py-3 text-sm transition",
                    active ? "bg-white/15 text-white" : "text-slate-200 hover:bg-white/10"
                  )}
                  href={item.href}
                  key={item.href}
                  onClick={() => setMobileOpen(false)}
                >
                  {item.label}
                </Link>
              );
            })}
            <Button asChild className="mt-2 rounded-full bg-white text-[#001736] hover:bg-slate-100">
              <Link href="/ai-workspace" onClick={() => setMobileOpen(false)}>
                Talk to AI
              </Link>
            </Button>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
