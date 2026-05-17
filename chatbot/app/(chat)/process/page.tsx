import Link from "next/link";
import { ArrowRight, Bot, CalendarCheck2, CheckCircle2, FileText, MessageSquareText, SearchCheck, ShieldCheck } from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const processSteps = [
  {
    step: "01",
    icon: MessageSquareText,
    title: "Ask a question",
    description: "The visitor starts with a migration issue, such as a refusal, 485 eligibility concern, bridging travel question, or consultation request.",
  },
  {
    step: "02",
    icon: Bot,
    title: "AI classifies the matter",
    description: "The backend identifies the operation type, visa context, current facts, and whether the case is safe for general guidance or needs escalation.",
  },
  {
    step: "03",
    icon: FileText,
    title: "One decisive fact at a time",
    description: "Instead of a long form, the interface asks the next most useful question. Users can answer, skip, or say they are not sure.",
  },
  {
    step: "04",
    icon: SearchCheck,
    title: "Sources and policy checks",
    description: "The assistant uses local RAG and controlled official-source retrieval when current policy or freshness-sensitive material is needed.",
  },
  {
    step: "05",
    icon: ShieldCheck,
    title: "Safe answer or escalation",
    description: "The system keeps confidence limited, avoids overclaiming, and recommends lawyer review when documents, dates, or risk factors matter.",
  },
  {
    step: "06",
    icon: CalendarCheck2,
    title: "Consultation handoff",
    description: "The website can route qualified users to booking, payment, CRM, or a lawyer review workflow when those integrations are added.",
  },
];

const principles = [
  "Backend controls legal reasoning; frontend controls presentation and conversion.",
  "State-machine and operation profiles decide when the AI can answer.",
  "Customer mode hides debug internals but preserves compact source transparency.",
  "High-risk or document-specific matters are routed toward the lawyer.",
];

export default function ProcessPage() {
  return (
    <div className="min-h-dvh bg-[#f8f9fa] text-slate-900">
      <SiteHeader />
      <main>
        <section className="relative overflow-hidden bg-[#001736] px-5 py-16 text-white lg:px-8">
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-28"
            style={{
              backgroundImage: "url('/images/sovereign-nexus/ai-orbital-bg.png')",
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(125,211,252,0.25),transparent_34%),linear-gradient(90deg,rgba(0,23,54,0.98),rgba(0,43,91,0.86),rgba(29,0,82,0.68))]" />
          <div className="relative mx-auto max-w-7xl">
            <Badge className="rounded-full border-white/15 bg-white/10 text-white hover:bg-white/10" variant="outline">
              <Bot className="mr-2 size-3.5 text-cyan-200" />
              Guided intake process
            </Badge>
            <h1 className="mt-5 max-w-4xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
              A commercial user journey from first question to lawyer consultation.
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-8 text-slate-200">
              The site should explain the process clearly. Visitors should understand what the AI does, what it does not do, and when a human lawyer takes over.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {processSteps.map((item) => {
              const Icon = item.icon;
              return (
                <Card className="rounded-[32px] border-slate-200 bg-white shadow-sm" key={item.step}>
                  <CardContent className="p-6">
                    <div className="mb-5 flex items-center justify-between gap-4">
                      <div className="flex size-14 items-center justify-center rounded-2xl bg-[#001736] text-white">
                        <Icon className="size-6" />
                      </div>
                      <span className="text-3xl font-semibold text-slate-200">{item.step}</span>
                    </div>
                    <h2 className="text-xl font-semibold text-slate-950">{item.title}</h2>
                    <p className="mt-3 text-sm leading-7 text-slate-600">{item.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 pb-16 lg:px-8">
          <div className="grid overflow-hidden rounded-[44px] bg-white shadow-[0_24px_100px_-44px_rgba(15,23,42,0.45)] lg:grid-cols-[0.9fr_1.1fr]">
            <div className="bg-[#001736] p-8 text-white lg:p-10">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-200">Operating principle</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                The AI is a structured intake and guidance layer, not a replacement lawyer.
              </h2>
              <p className="mt-4 text-sm leading-7 text-slate-300">
                This framing makes the product safer and more believable to a commercial immigration practice.
              </p>
            </div>
            <div className="grid gap-4 p-6 sm:grid-cols-2 lg:p-8">
              {principles.map((item) => (
                <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5" key={item}>
                  <CheckCircle2 className="mb-4 size-5 text-[#002b5b]" />
                  <p className="text-sm leading-7 text-slate-700">{item}</p>
                </div>
              ))}
              <div className="rounded-[28px] border border-slate-200 bg-white p-5 sm:col-span-2">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <div>
                    <p className="font-semibold text-slate-950">Try the real workspace flow.</p>
                    <p className="mt-1 text-sm text-slate-600">The next page uses the existing legal backend and guided-intake contract.</p>
                  </div>
                  <Button asChild className="rounded-full bg-[#001736] text-white hover:bg-[#002b5b]">
                    <Link href="/ai-workspace">
                      Open AI workspace
                      <ArrowRight className="ml-2 size-4" />
                    </Link>
                  </Button>
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
