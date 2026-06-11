import {
  ArrowRight,
  CalendarRange,
  CheckCircle2,
  Clock3,
  Mail,
  MapPin,
  MessageSquareMore,
  Phone,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const contactCards = [
  {
    icon: MessageSquareMore,
    title: "Start with AI intake",
    text: "For general questions, use the AI workspace first. It can collect facts and prepare a cleaner consultation summary.",
    href: "/ai-workspace",
    cta: "Open workspace",
  },
  {
    icon: CalendarRange,
    title: "Book a lawyer consultation",
    text: "For deadlines, refusals, cancellations, documents, or case-specific risks, move directly to a real lawyer meeting.",
    href: "/contact",
    cta: "Booking placeholder",
  },
];

const readiness = [
  "Visa subclass or current visa status",
  "Important dates, notices, and refusal/cancellation letters",
  "Course, qualification, occupation, sponsor, or family relationship details",
  "Any urgent deadlines or travel plans",
];

export default function ContactPage() {
  return (
    <div className="min-h-dvh bg-[#f8f9fa] text-slate-900">
      <SiteHeader />
      <main>
        <section className="relative overflow-hidden bg-[#001736] px-5 py-16 text-white lg:px-8">
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-34"
            style={{
              backgroundImage:
                "url('/images/sovereign-nexus/opera-house-hero.png')",
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,23,54,0.97),rgba(0,43,91,0.86),rgba(0,23,54,0.42))]" />
          <div className="relative mx-auto max-w-7xl">
            <Badge
              className="rounded-full border-white/15 bg-white/10 text-white hover:bg-white/10"
              variant="outline"
            >
              <CalendarRange className="mr-2 size-3.5 text-cyan-200" />
              Consultation handoff
            </Badge>
            <h1 className="mt-5 max-w-4xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
              Move from general AI guidance to a real immigration-law
              consultation.
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-8 text-slate-200">
              This page is the commercial conversion point. Connect it later to
              your lawyer friend’s real booking system, payment provider, CRM,
              or calendar.
            </p>
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-6 px-5 py-16 lg:grid-cols-[0.92fr_1.08fr] lg:px-8">
          <div className="space-y-5">
            {contactCards.map((item) => {
              const Icon = item.icon;
              return (
                <Card
                  className="rounded-[32px] border-slate-200 bg-white shadow-sm"
                  key={item.title}
                >
                  <CardContent className="p-6">
                    <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-[#001736] text-white">
                      <Icon className="size-6" />
                    </div>
                    <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                      {item.title}
                    </h2>
                    <p className="mt-3 text-sm leading-7 text-slate-600">
                      {item.text}
                    </p>
                    <Button
                      asChild
                      className="mt-5 rounded-full bg-[#001736] text-white hover:bg-[#002b5b]"
                    >
                      <Link href={item.href}>
                        {item.cta}
                        <ArrowRight className="ml-2 size-4" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card className="overflow-hidden rounded-[36px] border-0 bg-gradient-to-br from-[#001736] via-[#002b5b] to-[#1d0052] text-white shadow-[0_30px_110px_-42px_rgba(15,23,42,0.75)]">
            <CardContent className="p-8 lg:p-10">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-200">
                Before consultation
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                Information that helps the lawyer assess the case faster.
              </h2>
              <p className="mt-4 text-sm leading-7 text-slate-200">
                The AI workspace can collect these details progressively, but
                the contact page should also tell visitors what to prepare.
              </p>

              <div className="mt-7 grid gap-3">
                {readiness.map((item) => (
                  <div
                    className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/10 p-4"
                    key={item}
                  >
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-cyan-200" />
                    <p className="text-sm leading-6 text-slate-100">{item}</p>
                  </div>
                ))}
              </div>

              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                  <div className="mb-2 flex items-center gap-2 text-cyan-200">
                    <Clock3 className="size-4" />
                    <span className="text-sm font-medium text-white">
                      Response flow
                    </span>
                  </div>
                  <p className="text-sm leading-6 text-slate-300">
                    AI intake first, lawyer review for specific advice.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                  <div className="mb-2 flex items-center gap-2 text-cyan-200">
                    <ShieldCheck className="size-4" />
                    <span className="text-sm font-medium text-white">
                      Safety position
                    </span>
                  </div>
                  <p className="text-sm leading-6 text-slate-300">
                    General information only until a qualified lawyer takes
                    over.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="mx-auto max-w-7xl px-5 pb-16 lg:px-8">
          <div className="grid gap-4 rounded-[36px] border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-3">
            <div className="flex gap-3">
              <MapPin className="mt-1 size-5 shrink-0 text-[#002b5b]" />
              <div>
                <p className="font-semibold text-slate-950">Location concept</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Sydney / Australia migration practice positioning
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <Mail className="mt-1 size-5 shrink-0 text-[#002b5b]" />
              <div>
                <p className="font-semibold text-slate-950">
                  Email placeholder
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Replace with the lawyer’s real email or contact form
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <Phone className="mt-1 size-5 shrink-0 text-[#002b5b]" />
              <div>
                <p className="font-semibold text-slate-950">
                  Phone placeholder
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Replace with office phone or booking service later
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
