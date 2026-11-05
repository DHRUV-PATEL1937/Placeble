import { ArrowLeft } from "lucide-react";
import { useEffect } from "react";
import { Brand, ThemeToggle } from "@/pages/auth/auth-shared";
import { PRIVACY, TERMS } from "./legal-content";
import "./legal.css";

export function LegalPage({ kind }: { kind: "terms" | "privacy" }) {
  const doc = kind === "terms" ? TERMS : PRIVACY;
  const other = kind === "terms" ? { href: "/privacy", label: "Privacy Policy" } : { href: "/terms", label: "Terms of Service" };

  useEffect(() => { document.title = `${doc.title} | Placeble`; window.scrollTo(0, 0); }, [doc.title]);

  return (
    <div className="lg-page">
      <header className="lg-top">
        <a className="lg-brand" href="/login/student" aria-label="Placeble home"><Brand /></a>
        <nav aria-label="Legal documents">
          <a href="/terms" aria-current={kind === "terms" ? "page" : undefined}>Terms</a>
          <a href="/privacy" aria-current={kind === "privacy" ? "page" : undefined}>Privacy</a>
        </nav>
        <ThemeToggle className="ax-theme" />
      </header>

      <div className="lg-body">
        <aside className="lg-toc" aria-label="On this page">
          <a className="lg-back" href="/login/student"><ArrowLeft size={15} aria-hidden="true" /> Back to Placeble</a>
          <p>On this page</p>
          <ul>{doc.sections.map(section => <li key={section.id}><a href={`#${section.id}`}>{section.title}</a></li>)}</ul>
        </aside>

        <main className="lg-doc">
          <span className="lg-kicker">Legal</span>
          <h1>{doc.title}</h1>
          <p className="lg-summary">{doc.summary}</p>
          <p className="lg-updated">Last updated {doc.updated}</p>
          {doc.sections.map(section => (
            <section key={section.id} id={section.id}>
              <h2>{section.title}</h2>
              {section.body.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
            </section>
          ))}
          <footer>Also read our <a href={other.href}>{other.label}</a>.</footer>
        </main>
      </div>
    </div>
  );
}
