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
import type {
  SiteLocale,
  SiteNavKey,
  SiteTranslation,
} from "@/lib/site-locale";
import { cn } from "@/lib/utils";
import { SiteLanguageSwitcher } from "./site-language-switcher";
import { useSiteLocale } from "./site-locale-provider";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

const navItems: { key: SiteNavKey; href: string }[] = [
  { key: "workspace", href: "/ai-workspace" },
  { key: "services", href: "/services" },
  { key: "intelligence", href: "/intelligence" },
  { key: "process", href: "/process" },
  { key: "contact", href: "/contact" },
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
  isLawyer,
  isCustomer,
  membershipTier,
  vipExpiresAt,
  activeVip,
  expiredVip,
  copy,
  locale,
  mobile = false,
}: {
  email: string;
  isAdmin: boolean;
  isLawyer: boolean;
  isCustomer: boolean;
  membershipTier: "free" | "vip";
  vipExpiresAt: string | null;
  activeVip: boolean;
  expiredVip: boolean;
  copy: SiteTranslation;
  locale: SiteLocale;
  mobile?: boolean;
}) {
  const accountLabel = isAdmin
    ? copy.account.administrator
    : membershipTier === "vip" && activeVip
      ? `${copy.account.vipUntil} ${new Date(vipExpiresAt as string).toLocaleDateString(locale)}`
      : expiredVip
        ? copy.account.vipExpired
        : copy.account.freeAccount;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={`${copy.account.menuFor} ${email}`}
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
          <p className="text-xs font-medium text-slate-500">
            {copy.account.signedInAs}
          </p>
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
        {!isAdmin && !isLawyer ? (
          <DropdownMenuItem asChild>
            <Link
              className="cursor-pointer font-semibold"
              href="/client-portal"
            >
              {copy.account.clientPortal}
            </Link>
          </DropdownMenuItem>
        ) : null}
        {isCustomer ? (
          <DropdownMenuItem asChild>
            <Link className="cursor-pointer" href="/consultations">
              {copy.account.consultations}
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <Link className="cursor-pointer" href="/ai-workspace">
            {isAdmin
              ? copy.account.aiWorkspace
              : copy.account.conversationsAndWorkspace}
          </Link>
        </DropdownMenuItem>
        {isLawyer ? (
          <DropdownMenuItem asChild>
            <Link className="cursor-pointer" href="/lawyer-portal">
              {copy.account.lawyerPortal}
            </Link>
          </DropdownMenuItem>
        ) : isAdmin ? null : (
          <DropdownMenuItem asChild>
            <Link className="cursor-pointer" href="/lawyer-requests">
              {copy.account.lawyerRequests}
            </Link>
          </DropdownMenuItem>
        )}
        {!isAdmin && !isLawyer ? (
          <DropdownMenuItem asChild>
            <Link className="cursor-pointer" href="/vip">
              {activeVip
                ? copy.account.manageVip
                : expiredVip
                  ? copy.account.renewVip
                  : copy.account.upgradeVip}
            </Link>
          </DropdownMenuItem>
        ) : null}
        {isAdmin ? (
          <DropdownMenuItem asChild>
            <Link className="cursor-pointer" href="/admin-portal">
              {copy.account.adminPortal}
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
          {copy.account.logOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SiteHeader() {
  const { copy, locale } = useSiteLocale();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: session, status } = useSession();
  const sessionUser = session?.user;
  const isGuest =
    sessionUser?.type === "guest" || guestRegex.test(sessionUser?.email ?? "");
  const isAuthenticated =
    status === "authenticated" && Boolean(sessionUser) && !isGuest;
  const isAdmin = isAuthenticated && sessionUser?.role === "admin";
  const isLawyer = isAuthenticated && sessionUser?.role === "lawyer";
  const isCustomer = isAuthenticated && sessionUser?.role === "user";
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
              {copy.brand.name}
            </p>
            <p className="text-xs leading-tight text-slate-300">
              {copy.brand.tagline}
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
                {copy.nav[item.key]}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <SiteLanguageSwitcher />
          {isAuthenticated ? (
            <AccountMenu
              activeVip={activeVip}
              copy={copy}
              email={email}
              expiredVip={expiredVip}
              isAdmin={isAdmin}
              isCustomer={isCustomer}
              isLawyer={isLawyer}
              locale={locale}
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
                <Link href="/login">{copy.header.login}</Link>
              </Button>
              <Button
                asChild
                className="rounded-full border-white/20 bg-white/10 text-white hover:bg-white/15"
                variant="outline"
              >
                <Link href="/register">{copy.header.register}</Link>
              </Button>
            </>
          )}
          <Button
            asChild
            className="rounded-full bg-white px-5 text-[#001736] hover:bg-slate-100"
          >
            <Link href="/ai-workspace">{copy.header.talkToAi}</Link>
          </Button>
        </div>

        <button
          aria-label={
            mobileOpen
              ? copy.header.closeNavigation
              : copy.header.openNavigation
          }
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
                  {copy.nav[item.key]}
                </Link>
              );
            })}
            <Button
              asChild
              className="mt-2 rounded-full bg-white text-[#001736] hover:bg-slate-100"
            >
              <Link href="/ai-workspace" onClick={() => setMobileOpen(false)}>
                {copy.header.talkToAi}
              </Link>
            </Button>
            <SiteLanguageSwitcher mobile />
            {isAuthenticated ? (
              <AccountMenu
                activeVip={activeVip}
                copy={copy}
                email={email}
                expiredVip={expiredVip}
                isAdmin={isAdmin}
                isCustomer={isCustomer}
                isLawyer={isLawyer}
                locale={locale}
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
                    {copy.header.login}
                  </Link>
                </Button>
                <Button
                  asChild
                  className="rounded-2xl bg-white text-[#001736] hover:bg-slate-100"
                >
                  <Link href="/register" onClick={() => setMobileOpen(false)}>
                    {copy.header.register}
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
