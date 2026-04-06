import Link from "next/link";
import {
  ArrowRight,
  CalendarRange,
  CheckCircle2,
  FileCheck2,
  Globe2,
  MessageSquareMore,
  Scale,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { ImmigrationAssistantWidget } from "./immigration-assistant-widget";

const services = [
  {
    icon: Globe2,
    title: "Visa pathway guidance",
    description:
      "Present visitor, student, skilled, partner, and employer-sponsored pathways in a clear, client-friendly format.",
  },
  {
    icon: FileCheck2,
    title: "Document preparation support",
    description:
      "Help clients understand what to collect before the first meeting so the lawyer can assess the case faster.",
  },
  {
    icon: Scale,
    title: "Refusal and review triage",
    description:
      "Guide potential clients toward the right consultation when they are dealing with refusals, cancellations, or urgent deadlines.",
  },
  {
    icon: CalendarRange,
    title: "Consultation intake",
    description:
      "Use the AI assistant as the first point of contact, then direct the client to book a paid consultation with the firm.",
  },
];

const strengths = [
  "Professional service-center layout designed for an immigration practice",
  "Floating AI assistant button modeled after e-commerce support experiences",
  "Guest-friendly chat flow so prospects can engage before creating an account",
  "Suitable for demonstrating intake, triage, and consultation preparation",
];

const process = [
  {
    step: "01",
    title: "Client asks a question",
    description:
      "The visitor opens the floating assistant and asks about visas, refusals, timelines, or next steps.",
  },
  {
    step: "02",
    title: "AI provides general guidance",
    description:
      "The assistant explains common pathways, eligibility themes, and preparation steps in plain language.",
  },
  {
    step: "03",
    title: "Lawyer takes over when needed",
    description:
      "The page encourages the client to move from general information to a proper consultation for case-specific advice.",
  },
];

export function ImmigrationServiceHome() {
  return (
    <div className="relative min-h-dvh bg-white text-slate-900">
      <div className="absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.16),_transparent_35%),radial-gradient(circle_at_top_right,_rgba(15,23,42,0.14),_transparent_30%),linear-gradient(180deg,_rgba(248,250,252,1),_rgba(255,255,255,0.96))]" />

      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-slate-900 p-2 text-white shadow-sm">
              <Scale className="size-5" />
            </div>
            <div>
              <p className="font-semibold text-base tracking-tight">
                Immigration Consult Service Center
              </p>
              <p className="text-xs text-slate-500">
                AI-assisted intake for a modern migration practice
              </p>
            </div>
          </div>

          <nav className="hidden items-center gap-8 text-sm text-slate-600 md:flex">
            <a className="transition hover:text-slate-900" href="#services">
              Services
            </a>
            <a className="transition hover:text-slate-900" href="#process">
              Process
            </a>
            <a className="transition hover:text-slate-900" href="#contact">
              Contact
            </a>
          </nav>

          <div className="hidden md:block">
            <Button
              asChild
              className="rounded-full bg-slate-900 px-5 text-white hover:bg-slate-800"
            >
              <a href="#contact">Book consultation</a>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto grid w-full max-w-7xl gap-12 px-6 py-16 lg:grid-cols-[1.15fr_0.85fr] lg:px-8 lg:py-24">
          <div className="max-w-3xl">
            <Badge
              className="mb-5 rounded-full bg-sky-100 px-4 py-1.5 text-sky-900 hover:bg-sky-100"
              variant="secondary"
            >
              Trusted first-contact experience for immigration inquiries
            </Badge>

            <h1 className="max-w-4xl text-balance font-semibold text-4xl tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
              A business-style immigration service page with an AI consultation
              desk built in.
            </h1>

            <p className="mt-6 max-w-2xl text-balance text-lg leading-8 text-slate-600">
              This demo homepage is designed to feel like a professional
              immigration practice website. Visitors can review services,
              understand the process, and open the AI assistant from a floating
              button just like they would on a modern e-commerce support site.
            </p>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <Button
                asChild
                className="h-12 rounded-full bg-slate-900 px-6 text-white hover:bg-slate-800"
              >
                <a href="#contact">
                  Arrange consultation
                  <ArrowRight className="ml-2 size-4" />
                </a>
              </Button>
              <Button
                asChild
                className="h-12 rounded-full border-slate-300 px-6 text-slate-900 hover:bg-slate-100"
                variant="outline"
              >
                <Link href="#services">Explore service sections</Link>
              </Button>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              <Card className="rounded-3xl border-slate-200 shadow-sm">
                <CardContent className="p-5">
                  <p className="text-3xl font-semibold">24/7</p>
                  <p className="mt-2 text-sm text-slate-600">
                    AI assistant availability for initial client questions
                  </p>
                </CardContent>
              </Card>
              <Card className="rounded-3xl border-slate-200 shadow-sm">
                <CardContent className="p-5">
                  <p className="text-3xl font-semibold">1st touch</p>
                  <p className="mt-2 text-sm text-slate-600">
                    General intake and consultation triage before lawyer review
                  </p>
                </CardContent>
              </Card>
              <Card className="rounded-3xl border-slate-200 shadow-sm">
                <CardContent className="p-5">
                  <p className="text-3xl font-semibold">Human-led</p>
                  <p className="mt-2 text-sm text-slate-600">
                    Clear handoff to a real lawyer for case-specific legal advice
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="relative">
            <Card className="overflow-hidden rounded-[32px] border-slate-200 bg-slate-950 text-white shadow-[0_30px_90px_-30px_rgba(15,23,42,0.7)]">
              <CardHeader className="border-b border-white/10 pb-4">
                <div className="mb-4 flex items-center gap-2 text-sm text-slate-300">
                  <Sparkles className="size-4 text-sky-300" />
                  Live website concept for an immigration practice
                </div>
                <CardTitle className="text-2xl text-white">
                  AI consultation desk
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5 p-6 text-sm leading-7 text-slate-300">
                <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                  “I’m on a skilled visa and want to know what to prepare before
                  speaking with a lawyer.”
                </div>
                <div className="ml-auto max-w-[88%] rounded-3xl bg-sky-400/15 p-4 text-sky-50">
                  The assistant can explain common intake questions, likely
                  supporting documents, and when a legal consultation is
                  appropriate.
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                    <p className="font-medium text-white">Client benefits</p>
                    <p className="mt-2 text-slate-300">
                      Fast first response, clearer expectations, less friction
                      before booking.
                    </p>
                  </div>
                  <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                    <p className="font-medium text-white">Firm benefits</p>
                    <p className="mt-2 text-slate-300">
                      Better lead qualification and more focused lawyer
                      consultations.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-8 lg:px-8" id="services">
          <div className="mb-8 max-w-2xl">
            <p className="mb-3 text-sm font-medium uppercase tracking-[0.2em] text-sky-700">
              Service categories
            </p>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-950">
              Structured like a professional migration practice website
            </h2>
            <p className="mt-3 text-slate-600">
              The layout below gives your friend a realistic consultation-service
              homepage instead of a raw chatbot interface.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {services.map((service) => {
              const Icon = service.icon;
              return (
                <Card
                  className="rounded-[28px] border-slate-200 shadow-sm"
                  key={service.title}
                >
                  <CardHeader className="pb-3">
                    <div className="mb-4 inline-flex w-fit rounded-2xl bg-sky-100 p-3 text-sky-900">
                      <Icon className="size-5" />
                    </div>
                    <CardTitle className="text-xl text-slate-950">
                      {service.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm leading-7 text-slate-600">
                    {service.description}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        <section
          className="mx-auto grid max-w-7xl gap-8 px-6 py-12 lg:grid-cols-[0.95fr_1.05fr] lg:px-8"
          id="process"
        >
          <Card className="rounded-[32px] border-slate-200 bg-slate-900 text-white shadow-[0_24px_80px_-24px_rgba(15,23,42,0.75)]">
            <CardHeader>
              <p className="text-sm uppercase tracking-[0.2em] text-sky-300">
                Why this works for a demo
              </p>
              <CardTitle className="text-3xl text-white">
                Business website first, assistant second
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-7 text-slate-300">
              {strengths.map((item) => (
                <div className="flex items-start gap-3" key={item}>
                  <CheckCircle2 className="mt-1 size-5 shrink-0 text-sky-300" />
                  <p>{item}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="space-y-4">
            {process.map((item) => (
              <Card className="rounded-[28px] border-slate-200 shadow-sm" key={item.step}>
                <CardContent className="flex gap-5 p-6">
                  <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-slate-900 font-semibold text-white">
                    {item.step}
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-slate-950">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-sm leading-7 text-slate-600">
                      {item.description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-12 lg:px-8" id="contact">
          <Card className="overflow-hidden rounded-[36px] border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-sky-950 text-white shadow-[0_30px_90px_-30px_rgba(15,23,42,0.75)]">
            <CardContent className="grid gap-8 p-8 lg:grid-cols-[1.2fr_0.8fr] lg:p-10">
              <div>
                <p className="mb-3 text-sm uppercase tracking-[0.2em] text-sky-300">
                  Consultation handoff
                </p>
                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Let the AI assistant handle first-contact questions, then move
                  qualified clients into real consultations.
                </h2>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300">
                  This section can later be connected to your friend’s booking
                  form, payment workflow, or calendar system. For now, it
                  demonstrates a credible service-center experience with a clear
                  path from AI support to lawyer engagement.
                </p>
                <div className="mt-6 flex flex-col gap-4 sm:flex-row">
                  <Button className="rounded-full bg-white px-6 text-slate-900 hover:bg-slate-100">
                    Request consultation
                  </Button>
                  <div className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-6 py-2.5 text-sm text-slate-200">
                    AI assistant button stays visible at the bottom-right
                  </div>
                </div>
              </div>

              <div className="grid gap-4">
                <Card className="rounded-[28px] border-white/10 bg-white/5 text-white shadow-none backdrop-blur">
                  <CardContent className="p-5">
                    <div className="mb-3 flex items-center gap-3">
                      <ShieldCheck className="size-5 text-sky-300" />
                      <p className="font-medium">General information only</p>
                    </div>
                    <p className="text-sm leading-7 text-slate-300">
                      Position the assistant as intake and education support, not
                      as a replacement for case-specific legal advice.
                    </p>
                  </CardContent>
                </Card>
                <Card className="rounded-[28px] border-white/10 bg-white/5 text-white shadow-none backdrop-blur">
                  <CardContent className="p-5">
                    <div className="mb-3 flex items-center gap-3">
                      <Users className="size-5 text-sky-300" />
                      <p className="font-medium">Ideal for demonstrations</p>
                    </div>
                    <p className="text-sm leading-7 text-slate-300">
                      Your friend can immediately see how prospects would
                      experience the site before you connect real booking and CRM
                      integrations.
                    </p>
                  </CardContent>
                </Card>
                <Card className="rounded-[28px] border-white/10 bg-white/5 text-white shadow-none backdrop-blur">
                  <CardContent className="p-5">
                    <div className="mb-3 flex items-center gap-3">
                      <MessageSquareMore className="size-5 text-sky-300" />
                      <p className="font-medium">Floating assistant entry</p>
                    </div>
                    <p className="text-sm leading-7 text-slate-300">
                      The AI button stays visible while visitors browse the page,
                      mirroring the support pattern common on commercial
                      websites.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>

      <ImmigrationAssistantWidget />
    </div>
  );
}
