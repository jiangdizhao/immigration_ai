import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
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
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

const servicePreview = [
  {
    icon: Globe2,
    title: "Visa pathways",
    description: "Student, 485, skilled, partner, visitor, bridging, and refusal-related first-contact triage.",
    href: "/services",
  },
  {
    icon: FileCheck2,
    title: "Document readiness",
    description: "Turn vague questions into decisive facts and useful consultation preparation.",
    href: "/services",
  },
  {
    icon: CalendarRange,
    title: "Lawyer handoff",
    description: "Move high-intent or high-risk visitors into a structured lawyer consultation path.",
    href: "/contact",
  },
];

const commercialProof = [
  "Multi-page commercial site structure, not anchor-only navigation",
  "Sydney legal-tech visual identity using the Opera House hero asset",
  "Dedicated AI workspace page with enough room for chat, facts, sources, and CTA",
  "Customer-friendly pages for services, process, and consultation conversion",
];

export function ImmigrationServiceHome() {
  return (
    <div className="min-h-dvh bg-[#f8f9fa] text-slate-900">
      <SiteHeader />

      <main>
        <section className="relative isolate min-h-[740px] overflow-hidden bg-[#001736] text-white">
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-20 bg-cover bg-center"
            style={{
              backgroundImage:
                "url('/images/sovereign-nexus/opera-house-hero.png'), url('/images/sovereign-nexus/5.png')",
            }}
          />
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(0,23,54,0.96)_0%,rgba(0,23,54,0.88)_42%,rgba(0,43,91,0.58)_72%,rgba(0,23,54,0.22)_100%)]" />
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_78%_26%,rgba(125,211,252,0.28),transparent_32%),radial-gradient(circle_at_86%_80%,rgba(168,85,247,0.22),transparent_34%)]" />

          <div className="mx-auto grid w-full max-w-7xl gap-12 px-5 py-16 lg:grid-cols-[1.02fr_0.98fr] lg:px-8 lg:py-24">
            <div className="max-w-4xl">
              <Badge className="mb-5 rounded-full border-white/15 bg-white/10 px-4 py-1.5 text-white hover:bg-white/10" variant="outline">
                <Sparkles className="mr-2 size-3.5 text-cyan-200" />
                The Digital Jurist · Migration law first contact
              </Badge>

              <h1 className="max-w-5xl text-balance text-5xl font-semibold tracking-tight sm:text-6xl lg:text-7xl">
                The Future of Legal Intelligence
              </h1>
              <p className="mt-4 text-2xl font-medium text-cyan-100 sm:text-3xl">
                法律智能的未来
              </p>
              <p className="mt-6 max-w-2xl text-base leading-8 text-slate-200 sm:text-lg">
                A premium immigration-service website with a dedicated AI legal workspace. Visitors can ask migration questions, clarify facts, review compact source context, and move naturally into a real lawyer consultation.
              </p>

              <div className="mt-8 flex flex-col gap-4 sm:flex-row">
                <Button asChild className="h-12 rounded-full bg-white px-6 text-[#001736] hover:bg-slate-100">
                  <Link href="/ai-workspace">
                    Open AI legal workspace
                    <ArrowRight className="ml-2 size-4" />
                  </Link>
                </Button>
                <Button asChild className="h-12 rounded-full border-white/20 bg-white/10 px-6 text-white hover:bg-white/15" variant="outline">
                  <Link href="/services">Explore services</Link>
                </Button>
              </div>

              <div className="mt-10 grid gap-4 sm:grid-cols-3">
                {[
                  ["24/7", "AI first-contact intake"],
                  ["1-by-1", "Guided decisive questions"],
                  ["Human", "Lawyer handoff by design"],
                ].map(([value, label]) => (
                  <Card className="rounded-[28px] border-white/10 bg-white/10 text-white shadow-xl backdrop-blur-xl" key={label}>
                    <CardContent className="p-5">
                      <p className="text-3xl font-semibold">{value}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-200">{label}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            <div className="relative hidden lg:block">
              <div className="absolute -left-8 top-12 h-64 w-64 rounded-full bg-cyan-300/20 blur-3xl" />
              <div className="absolute -right-8 bottom-8 h-72 w-72 rounded-full bg-purple-400/20 blur-3xl" />
              <Card className="relative overflow-hidden rounded-[40px] border-white/15 bg-white/10 text-white shadow-[0_40px_120px_-40px_rgba(0,0,0,0.8)] backdrop-blur-2xl">
                <CardContent className="p-6">
                  <div className="rounded-[32px] border border-white/10 bg-[#001736]/80 p-5">
                    <div className="mb-5 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-cyan-200">AI workspace preview</p>
                        <h2 className="mt-2 text-2xl font-semibold">Guided migration intake</h2>
                      </div>
                      <div className="rounded-2xl bg-cyan-300/15 p-3 text-cyan-100">
                        <MessageSquareMore className="size-6" />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="max-w-[88%] rounded-3xl bg-white/10 p-4 text-sm leading-7 text-slate-200">
                        “I am 36 and finished a master by coursework. Can I still apply for a 485 visa?”
                      </div>
                      <div className="ml-auto max-w-[90%] rounded-3xl bg-cyan-300/16 p-4 text-sm leading-7 text-cyan-50">
                        I can give a focused first view, keep full eligibility separate, and ask only the next decisive question.
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                          <p className="font-medium">Case snapshot</p>
                          <p className="mt-2 text-sm leading-6 text-slate-300">Operation, confidence, next action, and intake facts.</p>
                        </div>
                        <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                          <p className="font-medium">Compact sources</p>
                          <p className="mt-2 text-sm leading-6 text-slate-300">Source titles without exposing raw debug panels.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
          <div className="mb-9 grid gap-6 lg:grid-cols-[0.82fr_1.18fr] lg:items-end">
            <div>
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.22em] text-[#002b5b]">Commercial website structure</p>
              <h2 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                A homepage that sells the service, then routes visitors to purpose-built pages.
              </h2>
            </div>
            <p className="max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">
              The navigation now uses real routes. The homepage previews the AI value proposition, while the actual chat experience, service catalogue, intake process, and consultation pathway each live on their own page.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {servicePreview.map((service) => {
              const Icon = service.icon;
              return (
                <Card className="group rounded-[32px] border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl" key={service.title}>
                  <CardHeader className="pb-3">
                    <div className="mb-4 inline-flex w-fit rounded-2xl bg-[#001736] p-3 text-white shadow-sm transition group-hover:bg-[#002b5b]">
                      <Icon className="size-5" />
                    </div>
                    <CardTitle className="text-xl text-slate-950">{service.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-5 text-sm leading-7 text-slate-600">
                    <p>{service.description}</p>
                    <Button asChild className="rounded-full bg-slate-100 text-[#001736] hover:bg-slate-200" variant="secondary">
                      <Link href={service.href}>
                        View page
                        <ArrowRight className="ml-2 size-4" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 pb-16 lg:px-8">
          <div className="overflow-hidden rounded-[44px] bg-white shadow-[0_24px_100px_-44px_rgba(15,23,42,0.45)]">
            <div className="grid gap-0 lg:grid-cols-[0.86fr_1.14fr]">
              <div className="relative overflow-hidden bg-[#001736] p-8 text-white lg:p-10">
                <div
                  aria-hidden="true"
                  className="absolute inset-0 opacity-25"
                  style={{
                    backgroundImage: "url('/images/sovereign-nexus/ai-orbital-bg.png')",
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                />
                <div className="relative">
                  <Badge className="mb-5 rounded-full border-white/15 bg-white/10 text-white hover:bg-white/10" variant="outline">
                    <BarChart3 className="mr-2 size-3.5 text-cyan-200" />
                    Product-grade IA
                  </Badge>
                  <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                    The site now has pages for different customer intentions.
                  </h2>
                  <p className="mt-4 text-sm leading-7 text-slate-300">
                    This is closer to a commercial legal-service website: users browse services, understand the process, enter the AI workspace, and then convert to consultation.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 p-6 sm:grid-cols-2 lg:p-8">
                {commercialProof.map((item) => (
                  <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5" key={item}>
                    <CheckCircle2 className="mb-4 size-5 text-[#002b5b]" />
                    <p className="text-sm leading-7 text-slate-700">{item}</p>
                  </div>
                ))}
                <div className="rounded-[28px] border border-slate-200 bg-white p-5 sm:col-span-2">
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                    <div>
                      <p className="font-semibold text-slate-950">Ready to test the large AI desk?</p>
                      <p className="mt-1 text-sm text-slate-600">Open the dedicated page rather than scrolling to an anchor.</p>
                    </div>
                    <Button asChild className="rounded-full bg-[#001736] text-white hover:bg-[#002b5b]">
                      <Link href="/ai-workspace">
                        Launch workspace
                        <ArrowRight className="ml-2 size-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
