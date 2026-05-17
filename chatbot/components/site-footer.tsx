import Link from "next/link";
import { Mail, MapPin, ShieldCheck } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-10 lg:grid-cols-[1.2fr_0.8fr_0.8fr] lg:px-8">
        <div>
          <p className="text-lg font-semibold text-slate-950">Sovereign Nexus Legal</p>
          <p className="mt-3 max-w-xl text-sm leading-7 text-slate-600">
            A commercial demo interface for an immigration-law AI first-contact workflow. The assistant supports intake and general information; case-specific legal advice should be handled by a qualified lawyer.
          </p>
          <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
            <ShieldCheck className="size-4 text-[#002b5b]" />
            General information only · Lawyer handoff by design
          </div>
        </div>

        <div>
          <p className="font-semibold text-slate-950">Pages</p>
          <div className="mt-4 grid gap-2 text-sm text-slate-600">
            <Link className="hover:text-[#002b5b]" href="/ai-workspace">AI Workspace</Link>
            <Link className="hover:text-[#002b5b]" href="/services">Services</Link>
            <Link className="hover:text-[#002b5b]" href="/process">Process</Link>
            <Link className="hover:text-[#002b5b]" href="/contact">Contact</Link>
          </div>
        </div>

        <div>
          <p className="font-semibold text-slate-950">Contact concept</p>
          <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
            <div className="flex gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0 text-[#002b5b]" />
              Sydney-focused migration service experience
            </div>
            <div className="flex gap-2">
              <Mail className="mt-0.5 size-4 shrink-0 text-[#002b5b]" />
              Connect this section to the real law firm booking system later
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
