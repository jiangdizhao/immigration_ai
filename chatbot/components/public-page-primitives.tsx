import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  FileText,
  Globe2,
  HeartHandshake,
  Landmark,
  Scale,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type {
  getPublicServiceCatalog,
  PublicServiceIcon,
} from "@/lib/public-content";
import { Button } from "./ui/button";

export const publicServiceIcons: Record<PublicServiceIcon, LucideIcon> = {
  study: Globe2,
  skilled: Landmark,
  family: HeartHandshake,
  review: Scale,
  residence: ShieldCheck,
  complex: FileText,
};

type DisplayService = ReturnType<typeof getPublicServiceCatalog>[number];

const serviceIconSurfaces: Record<PublicServiceIcon, string> = {
  study: "bg-sky-100 text-sky-800 ring-sky-200/70",
  skilled: "bg-indigo-100 text-indigo-800 ring-indigo-200/70",
  family: "bg-amber-100 text-amber-800 ring-amber-200/70",
  review: "bg-rose-100 text-rose-800 ring-rose-200/70",
  residence: "bg-emerald-100 text-emerald-800 ring-emerald-200/70",
  complex: "bg-violet-100 text-violet-800 ring-violet-200/70",
};

export function PublicPageFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh overflow-x-hidden bg-[#f4f6f9] text-slate-900">
      {children}
    </div>
  );
}

export function PublicEyebrow({
  children,
  icon: Icon,
  tone = "navy",
  className = "",
}: {
  children: ReactNode;
  icon?: LucideIcon;
  tone?: "navy" | "purple" | "amber" | "light";
  className?: string;
}) {
  const toneClass = {
    navy: "text-[#123f70]",
    purple: "text-violet-700",
    amber: "text-[#9a6500]",
    light: "text-cyan-100",
  }[tone];

  return (
    <div
      className={`flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.24em] ${toneClass} ${className}`}
    >
      {Icon ? <Icon className="size-3.5 shrink-0" /> : null}
      <span>{children}</span>
    </div>
  );
}

export function PublicSectionHeading({
  eyebrow,
  title,
  description,
  dark = false,
  tone = "navy",
  className = "",
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  dark?: boolean;
  tone?: "navy" | "purple" | "amber";
  className?: string;
}) {
  return (
    <div className={`max-w-3xl ${className}`}>
      <PublicEyebrow tone={dark ? "light" : tone}>{eyebrow}</PublicEyebrow>
      <h2
        className={`mt-4 text-pretty text-3xl font-semibold tracking-[-0.035em] sm:text-4xl ${dark ? "text-white" : "text-slate-950"}`}
      >
        {title}
      </h2>
      {description ? (
        <p
          className={`mt-4 max-w-2xl text-sm leading-7 sm:text-base ${dark ? "text-slate-300" : "text-slate-600"}`}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}

export function PublicEditorialHero({
  eyebrow,
  title,
  description,
  icon: Icon,
  aside,
  actions,
  tone = "navy",
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  description: ReactNode;
  icon: LucideIcon;
  aside: ReactNode;
  actions?: ReactNode;
  tone?: "navy" | "purple" | "amber";
}) {
  const accent = {
    navy: "from-[#dbeafe] via-white to-[#eef2ff]",
    purple: "from-violet-100 via-white to-[#e0e7ff]",
    amber: "from-amber-100 via-white to-[#fff7ed]",
  }[tone];

  return (
    <section className="relative isolate overflow-hidden bg-white">
      <div
        aria-hidden="true"
        className={`absolute inset-0 -z-10 bg-gradient-to-br ${accent}`}
      />
      <div
        aria-hidden="true"
        className="absolute -right-36 top-[-8rem] -z-10 size-[28rem] rounded-full bg-white/80 blur-3xl"
      />
      <div className="mx-auto grid w-full max-w-7xl gap-12 px-5 py-16 sm:py-20 lg:grid-cols-[minmax(0,1.03fr)_minmax(19rem,0.72fr)] lg:items-center lg:gap-20 lg:px-8 lg:py-24">
        <div className="min-w-0">
          <div className="inline-flex rounded-full bg-white/70 px-3 py-2 shadow-sm ring-1 ring-slate-200/70 backdrop-blur">
            <PublicEyebrow icon={Icon} tone={tone}>
              {eyebrow}
            </PublicEyebrow>
          </div>
          <h1 className="mt-6 max-w-4xl text-pretty text-4xl font-semibold leading-[1.12] tracking-[-0.055em] text-slate-950 sm:text-5xl lg:text-6xl">
            {title}
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">
            {description}
          </p>
          {actions ? (
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              {actions}
            </div>
          ) : null}
        </div>
        <div className="min-w-0">{aside}</div>
      </div>
    </section>
  );
}

export function PublicActionLink({
  href,
  children,
  variant = "navy",
}: {
  href: string;
  children: ReactNode;
  variant?: "navy" | "purple" | "amber" | "light";
}) {
  const classes = {
    navy: "bg-[#092c52] text-white shadow-lg shadow-[#092c52]/15 hover:bg-[#123f70]",
    purple:
      "bg-violet-700 text-white shadow-lg shadow-violet-700/20 hover:bg-violet-800",
    amber:
      "bg-[#9a6500] text-white shadow-lg shadow-amber-900/15 hover:bg-[#7a4f00]",
    light:
      "bg-white text-[#092c52] shadow-lg shadow-black/10 hover:bg-slate-100",
  }[variant];

  return (
    <Button asChild className={`h-11 rounded-full px-5 ${classes}`}>
      <Link href={href}>
        {children}
        <ArrowRight className="size-4" />
      </Link>
    </Button>
  );
}

export function PublicServiceCard({
  service,
  href,
  cta,
  showBullets = false,
  index,
  className = "",
}: {
  service: DisplayService;
  href: string;
  cta?: ReactNode;
  showBullets?: boolean;
  index?: number;
  className?: string;
}) {
  const Icon = publicServiceIcons[service.icon];

  return (
    <article
      className={`group relative flex min-w-0 flex-col overflow-hidden rounded-[1.75rem] bg-white p-6 shadow-[0_18px_55px_-34px_rgba(15,23,42,0.7)] ring-1 ring-slate-200/70 transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_70px_-34px_rgba(15,23,42,0.8)] sm:p-7 ${className}`}
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#092c52] via-violet-400 to-amber-300 opacity-80" />
      <div className="flex items-start justify-between gap-4">
        <div
          className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ring-1 ${serviceIconSurfaces[service.icon]}`}
        >
          <Icon className="size-5" />
        </div>
        {index ? (
          <span className="font-mono text-xs font-semibold tracking-[0.18em] text-slate-300">
            {String(index).padStart(2, "0")}
          </span>
        ) : null}
      </div>
      <h3 className="mt-7 text-xl font-semibold leading-snug tracking-[-0.02em] text-slate-950">
        {service.title}
      </h3>
      <p className="mt-3 text-sm leading-7 text-slate-600">{service.summary}</p>
      {showBullets ? (
        <ul className="mt-5 grid gap-2.5 text-sm leading-6 text-slate-600">
          {service.bullets.map((item) => (
            <li className="flex items-start gap-2.5" key={item}>
              <ShieldCheck className="mt-1 size-4 shrink-0 text-[#123f70]" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {cta ? (
        <Button
          asChild
          className="mt-6 w-fit rounded-full bg-slate-100 px-4 text-[#092c52] transition group-hover:bg-[#e8eef5]"
          variant="secondary"
        >
          <Link href={href}>
            {cta}
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      ) : null}
    </article>
  );
}
