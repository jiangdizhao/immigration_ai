import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CalendarRange,
  CheckCircle2,
  FileCheck2,
  Globe2,
  Languages,
  MessageSquareMore,
  Scale,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { ImmigrationAIWorkspace } from "./immigration-ai-workspace";

const services = [
  {
    icon: Globe2,
    title: "Visa pathway guidance",
    description:
      "Explain student, temporary graduate, skilled, partner, visitor, and bridging visa pathways in a client-friendly way.",
  },
  {
    icon: FileCheck2,
    title: "Document preparation",
    description:
      "Collect decisive facts and help clients understand what documents may matter before the first lawyer meeting.",
  },
  {
    icon: Scale,
    title: "Refusal and review triage",
    description:
      "Detect refusals, cancellations, review questions, deadlines, and situations that should be escalated quickly.",
  },
  {
    icon: CalendarRange,
    title: "Consultation handoff",
    description:
      "Move high-intent or high-risk visitors from general AI guidance into a real paid consultation workflow.",
  },
];

const process = [
  {
    step: "01",
    title: "Ask a migration question",
    description:
      "The visitor can type freely or start from a realistic scenario such as a student refusal, 485 eligibility question, or bridging-visa travel issue.",
  },
  {
    step: "02",
    title: "AI gathers decisive facts",
    description:
      "The backend decides which fact matters next. The frontend presents only one customer-friendly follow-up at a time.",
  },
  {
    step: "03",
    title: "Sources and risk are controlled",
    description:
      "The assistant uses local legal material, official-source live retrieval when needed, compact sources, and safe confidence limits.",
  },
  {
    step: "04",
    title: "Lawyer consultation follows",
    description:
      "The UI keeps a visible consultation pathway so qualified users can move from general information to professional advice.",
  },
];

const proofPoints = [
  "Backend-owned legal reasoning: the frontend renders InteractionPlan rather than inventing legal logic.",
  "Customer mode by default: answer, one quick question, compact sources, and lawyer handoff.",
  "Large workspace layout: enough room for conversation, intake state, sources, and consultation CTA.",
  "Designed to match a premium legal-tech brand instead of a toy chatbot demo.",
];

export function ImmigrationServiceHome() {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#f8f9fa] text-slate-900">
      <div className="absolute inset-x-0 top-0 -z-10 h-[760px] bg-[radial-gradient(circle_at_16%_10%,rgba(125,211,252,0.28),transparent_30%),radial-gradient(circle_at_90%_0%,rgba(168,85,247,0.22),transparent_28%),linear-gradient(135deg,#001736_0%,#002b5b_52%,#0f172a_100%)]" />
      <div className="absolute inset-x-0 top-[620px] -z-10 h-[360px] bg-[linear-gradient(180deg,rgba(248,249,250,0),#f8f9fa_38%)]" />

      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#001736]/80 text-white backdrop-blur-2xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
          <Link className="flex items-center gap-3" href="#top">
            <div className="rounded-2xl border border-white/15 bg-white/10 p-2 shadow-sm">
              <Scale className="size-5" />
            </div>
            <div>
              <p className="font-semibold tracking-tight">Sovereign Nexus Legal</p>
              <p className="text-xs text-slate-300">AI-assisted migration intake</p>
            </div>
          </Link>

          <nav className="hidden items-center gap-8 text-sm text-slate-200 md:flex">
            <a className="transition hover:text-white" href="#ai-workspace">
              AI Workspace
            </a>
            <a className="transition hover:text-white" href="#services">
              Services
            </a>
            <a className="transition hover:text-white" href="#process">
              Process
            </a>
            <a className="transition hover:text-white" href="#contact">
              Contact
            </a>
          </nav>

          <div className="hidden md:block">
            <Button asChild className="rounded-full bg-white px-5 text-[#001736] hover:bg-slate-100">
              <a href="#ai-workspace">Talk to AI</a>
            </Button>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="mx-auto grid w-full max-w-7xl gap-12 px-5 pb-8 pt-14 text-white lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:pb-12 lg:pt-20">
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
              A premium immigration-service homepage with a central AI legal workspace. Visitors can ask questions, clarify facts, view compact source context, and move naturally into a real lawyer consultation.
            </p>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <Button asChild className="h-12 rounded-full bg-white px-6 text-[#001736] hover:bg-slate-100">
                <a href="#ai-workspace">
                  Open AI legal workspace
                  <ArrowRight className="ml-2 size-4" />
                </a>
              </Button>
              <Button asChild className="h-12 rounded-full border-white/20 bg-white/5 px-6 text-white hover:bg-white/10" variant="outline">
                <a href="#services">Explore services</a>
              </Button>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              <Card className="rounded-[28px] border-white/10 bg-white/10 text-white shadow-xl backdrop-blur-xl">
                <CardContent className="p-5">
                  <p className="text-3xl font-semibold">24/7</p>
                  <p className="mt-2 text-sm leading-6 text-slate-200">AI first-contact intake</p>
                </CardContent>
              </Card>
              <Card className="rounded-[28px] border-white/10 bg-white/10 text-white shadow-xl backdrop-blur-xl">
                <CardContent className="p-5">
                  <p className="text-3xl font-semibold">1-by-1</p>
                  <p className="mt-2 text-sm leading-6 text-slate-200">Guided decisive questions</p>
                </CardContent>
              </Card>
              <Card className="rounded-[28px] border-white/10 bg-white/10 text-white shadow-xl backdrop-blur-xl">
                <CardContent className="p-5">
                  <p className="text-3xl font-semibold">Human</p>
                  <p className="mt-2 text-sm leading-6 text-slate-200">Lawyer handoff by design</p>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="relative hidden lg:block">
            <div className="absolute -left-8 top-12 h-64 w-64 rounded-full bg-cyan-300/20 blur-3xl" />
            <div className="absolute -right-8 bottom-8 h-72 w-72 rounded-full bg-purple-400/20 blur-3xl" />
            <Card className="relative overflow-hidden rounded-[40px] border-white/15 bg-white/10 text-white shadow-[0_40px_120px_-40px_rgba(0,0,0,0.75)] backdrop-blur-2xl">
              <CardContent className="p-6">
                <div className="rounded-[32px] border border-white/10 bg-[#001736]/70 p-5">
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
                    <div className="ml-auto max-w-[90%] rounded-3xl bg-cyan-300/15 p-4 text-sm leading-7 text-cyan-50">
                      I can give a focused first view, but I will keep full eligibility separate from the current age-and-qualification issue.
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
        </section>

        <ImmigrationAIWorkspace />

        <section className="mx-auto max-w-7xl px-5 py-14 lg:px-8" id="services">
          <div className="mb-9 grid gap-6 lg:grid-cols-[0.82fr_1.18fr] lg:items-end">
            <div>
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.22em] text-[#002b5b]">Legal service categories</p>
              <h2 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                Built around migration-client workflows, not a generic chatbot.
              </h2>
            </div>
            <p className="max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">
              The website now positions the AI as a premium consultation desk. The real legal reasoning remains in the FastAPI backend; the frontend focuses on clarity, trust, and conversion.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {services.map((service) => {
              const Icon = service.icon;
              return (
                <Card className="group rounded-[32px] border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl" key={service.title}>
                  <CardHeader className="pb-3">
                    <div className="mb-4 inline-flex w-fit rounded-2xl bg-[#001736] p-3 text-white shadow-sm transition group-hover:bg-[#002b5b]">
                      <Icon className="size-5" />
                    </div>
                    <CardTitle className="text-xl text-slate-950">{service.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm leading-7 text-slate-600">{service.description}</CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-10 lg:px-8" id="process">
          <div className="overflow-hidden rounded-[44px] bg-white shadow-[0_24px_100px_-40px_rgba(15,23,42,0.35)]">
            <div className="grid gap-0 lg:grid-cols-[0.88fr_1.12fr]">
              <div className="bg-[#001736] p-8 text-white lg:p-10">
                <Badge className="mb-5 rounded-full border-white/15 bg-white/10 text-white hover:bg-white/10" variant="outline">
                  <BarChart3 className="mr-2 size-3.5 text-cyan-200" />
                  Guided intake architecture
                </Badge>
                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  The interface reflects the backend state machine.
                </h2>
                <p className="mt-4 text-sm leading-7 text-slate-300">
                  Current backend work already exposes case hypothesis, fact slots, interaction plans, compact sources, and escalation flags. This redesign gives those objects enough space to be useful.
                </p>
                <div className="mt-7 space-y-4">
                  {proofPoints.map((point) => (
                    <div className="flex items-start gap-3 text-sm leading-7 text-slate-200" key={point}>
                      <CheckCircle2 className="mt-1 size-5 shrink-0 text-cyan-200" />
                      <p>{point}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 p-6 lg:p-8">
                {process.map((item) => (
                  <Card className="rounded-[28px] border-slate-200 bg-slate-50 shadow-none" key={item.step}>
                    <CardContent className="flex gap-5 p-5">
                      <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-white font-semibold text-[#002b5b] shadow-sm">
                        {item.step}
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-slate-950">{item.title}</h3>
                        <p className="mt-2 text-sm leading-7 text-slate-600">{item.description}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-14 lg:px-8" id="contact">
          <Card className="overflow-hidden rounded-[44px] border-0 bg-gradient-to-br from-[#001736] via-[#002b5b] to-[#1d0052] text-white shadow-[0_30px_120px_-40px_rgba(0,0,0,0.65)]">
            <CardContent className="grid gap-8 p-8 lg:grid-cols-[1.12fr_0.88fr] lg:p-10">
              <div>
                <p className="mb-3 text-sm font-semibold uppercase tracking-[0.22em] text-cyan-200">Consultation conversion</p>
                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  AI answers the first question. The lawyer handles the legal advice.
                </h2>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-200 sm:text-base">
                  This design lets your friend present the service as a professional legal intake system: useful enough for visitors, cautious enough for legal risk, and structured enough for later booking, payment, or CRM integration.
                </p>
                <div className="mt-7 flex flex-col gap-4 sm:flex-row">
                  <Button className="h-12 rounded-full bg-white px-6 text-[#001736] hover:bg-slate-100">
                    Request lawyer consultation
                    <ArrowRight className="ml-2 size-4" />
                  </Button>
                  <Button asChild className="h-12 rounded-full border-white/20 bg-white/5 px-6 text-white hover:bg-white/10" variant="outline">
                    <a href="#ai-workspace">Return to AI workspace</a>
                  </Button>
                </div>
              </div>

              <div className="grid gap-4">
                <Card className="rounded-[30px] border-white/10 bg-white/10 text-white shadow-none backdrop-blur">
                  <CardContent className="flex gap-4 p-5">
                    <ShieldCheck className="mt-1 size-5 shrink-0 text-cyan-200" />
                    <div>
                      <p className="font-medium">Risk-controlled public UI</p>
                      <p className="mt-2 text-sm leading-6 text-slate-200">No raw fact-slot dashboard unless debug mode is enabled.</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="rounded-[30px] border-white/10 bg-white/10 text-white shadow-none backdrop-blur">
                  <CardContent className="flex gap-4 p-5">
                    <Languages className="mt-1 size-5 shrink-0 text-cyan-200" />
                    <div>
                      <p className="font-medium">Bilingual-ready style</p>
                      <p className="mt-2 text-sm leading-6 text-slate-200">The layout leaves room for English and Chinese customer flows.</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="rounded-[30px] border-white/10 bg-white/10 text-white shadow-none backdrop-blur">
                  <CardContent className="flex gap-4 p-5">
                    <Users className="mt-1 size-5 shrink-0 text-cyan-200" />
                    <div>
                      <p className="font-medium">Human lawyer handoff</p>
                      <p className="mt-2 text-sm leading-6 text-slate-200">The AI stays positioned as triage and preparation, not a lawyer replacement.</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
