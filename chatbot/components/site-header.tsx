"use client";

import {
  ChevronDown,
  LogOut,
  Menu,
  Scale,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { guestRegex } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

const navItems = [
  { label: "AI Workspace", href: "/ai-workspace" },
  { label: "Services", href: "/services" },
  { label: "Process", href: "/process" },
  { label: "Contact", href: "/contact" },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function AccountMenu({
  email,
  isAdmin,
  membershipTier,
  vipExpiresAt,
  activeVip,
  expiredVip,
  mobile = false,
}: {
  email: string;
  isAdmin: boolean;
  membershipTier: "free" | "vip";
  vipExpiresAt: string | null;
  activeVip: boolean;
  expiredVip: boolean;
  mobile?: boolean;
}) {
  const accountLabel = isAdmin
    ? "Administrator"
    : membershipTier === "vip" && activeVip
      ? `VIP until ${new Date(vipExpiresAt as string).toLocaleDateString()}`
      : expiredVip
        ? "VIP expired"
        : "Free account";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={`Account menu for ${email}`}
          className={cn(
            "flex min-w-0 items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-left text-sm text-white transition hover:bg-white/15",
            mobile && "w-full justify-between rounded-2xl px-4 py-3"
          )}
          data-testid="site-account-control"
          type="button"
        >
          <UserRound className="size-4 shrink-0 text-cyan-200" />
          <span className="max-w-[180px] truncate font-medium">{email}</span>
          <ChevronDown className="size-4 shrink-0 text-slate-300" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-72 rounded-2xl border-slate-200 p-2"
        data-testid="site-account-menu"
      >
        <div className="px-3 py-2">
          <p className="text-xs font-medium text-slate-500">Signed in as</p>
          <p className="mt-1 truncate text-sm font-semibold text-slate-950">
            {email}
          </p>
        </div>
        <DropdownMenuSeparator />
        <div className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700">
          {isAdmin ? <ShieldCheck className="size-4 text-cyan-700" /> : null}
          <span>{accountLabel}</span>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link className="cursor-pointer" href="/ai-workspace">
            {isAdmin ? "AI Workspace" : "My conversations / AI Workspace"}
          </Link>
        </DropdownMenuItem>
        {isAdmin ? null : (
          <DropdownMenuItem asChild>
            <Link className="cursor-pointer" href="/lawyer-requests">
              My lawyer requests
            </Link>
          </DropdownMenuItem>
        )}
        {!isAdmin && !activeVip ? (
          <DropdownMenuItem asChild>
            <Link className="cursor-pointer" href="/vip">
              {expiredVip ? "Renew VIP" : "Upgrade to VIP"}
            </Link>
          </DropdownMenuItem>
        ) : null}
        {isAdmin ? (
          <DropdownMenuItem asChild>
            <Link className="cursor-pointer" href="/admin-portal">
              Admin Portal
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer text-red-600 focus:text-red-700"
          onSelect={() => {
            signOut({ redirectTo: "/" });
          }}
        >
          <LogOut className="size-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: session, status } = useSession();
  const sessionUser = session?.user;
  const isGuest = guestRegex.test(sessionUser?.email ?? "");
  const isAuthenticated =
    status === "authenticated" && Boolean(sessionUser) && !isGuest;
  const isAdmin = isAuthenticated && sessionUser?.role === "admin";
  const email = sessionUser?.email ?? "";
  const [serverEntitlement, setServerEntitlement] = useState<{
    membershipTier: "free" | "vip";
    vipExpiresAt: string | null;
    activeVip: boolean;
    expiredVip: boolean;
  } | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      setServerEntitlement(null);
      return;
    }

    let cancelled = false;
    fetch("/api/vip/status")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && data) {
          setServerEntitlement({
            membershipTier: data.membershipTier === "vip" ? "vip" : "free",
            vipExpiresAt:
              typeof data.vipExpiresAt === "string" ? data.vipExpiresAt : null,
            activeVip: Boolean(data.activeVip),
            expiredVip: Boolean(data.expiredVip),
          });
        }
      })
      .catch(() => {
        // The session values remain a safe display fallback if status is unavailable.
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const membershipTier =
    serverEntitlement?.membershipTier ?? sessionUser?.membershipTier ?? "free";
  const vipExpiresAt =
    serverEntitlement?.vipExpiresAt ?? sessionUser?.vipExpiresAt ?? null;
  const activeVip =
    serverEntitlement?.activeVip ??
    (membershipTier === "vip" &&
      Boolean(vipExpiresAt && new Date(vipExpiresAt) > new Date()));
  const expiredVip =
    serverEntitlement?.expiredVip ??
    (membershipTier === "vip" && !activeVip && Boolean(vipExpiresAt));

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#001736]/95 text-white shadow-[0_10px_40px_-22px_rgba(0,0,0,0.75)] backdrop-blur-2xl">
      <div className="mx-auto flex min-h-[72px] w-full max-w-7xl items-center justify-between px-5 lg:px-8">
        <Link
          className="group flex items-center gap-3"
          href="/"
          onClick={() => setMobileOpen(false)}
        >
          <div className="rounded-2xl border border-white/15 bg-white/10 p-2 shadow-sm transition group-hover:bg-white/15">
            <Scale className="size-5" />
          </div>
          <div>
            <p className="font-semibold leading-tight tracking-tight">
              Sovereign Nexus Legal
            </p>
            <p className="text-xs leading-tight text-slate-300">
              AI-assisted migration intake
            </p>
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
          {isAuthenticated ? (
            <AccountMenu
              activeVip={activeVip}
              email={email}
              expiredVip={expiredVip}
              isAdmin={isAdmin}
              membershipTier={membershipTier}
              vipExpiresAt={vipExpiresAt}
            />
          ) : (
            <>
              <Button
                asChild
                className="rounded-full text-slate-200 hover:bg-white/10 hover:text-white"
                variant="ghost"
              >
                <Link href="/login">Login</Link>
              </Button>
              <Button
                asChild
                className="rounded-full border-white/20 bg-white/10 text-white hover:bg-white/15"
                variant="outline"
              >
                <Link href="/register">Register</Link>
              </Button>
            </>
          )}
          <Button
            asChild
            className="rounded-full bg-white px-5 text-[#001736] hover:bg-slate-100"
          >
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
                    active
                      ? "bg-white/15 text-white"
                      : "text-slate-200 hover:bg-white/10"
                  )}
                  href={item.href}
                  key={item.href}
                  onClick={() => setMobileOpen(false)}
                >
                  {item.label}
                </Link>
              );
            })}
            <Button
              asChild
              className="mt-2 rounded-full bg-white text-[#001736] hover:bg-slate-100"
            >
              <Link href="/ai-workspace" onClick={() => setMobileOpen(false)}>
                Talk to AI
              </Link>
            </Button>
            {isAuthenticated ? (
              <AccountMenu
                activeVip={activeVip}
                email={email}
                expiredVip={expiredVip}
                isAdmin={isAdmin}
                membershipTier={membershipTier}
                mobile
                vipExpiresAt={vipExpiresAt}
              />
            ) : (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button
                  asChild
                  className="rounded-2xl border-white/20 bg-white/10 text-white hover:bg-white/15"
                  variant="outline"
                >
                  <Link href="/login" onClick={() => setMobileOpen(false)}>
                    Login
                  </Link>
                </Button>
                <Button
                  asChild
                  className="rounded-2xl bg-white text-[#001736] hover:bg-slate-100"
                >
                  <Link href="/register" onClick={() => setMobileOpen(false)}>
                    Register
                  </Link>
                </Button>
              </div>
            )}
          </nav>
        </div>
      ) : null}
    </header>
  );
}
