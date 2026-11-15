"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SparkIcon } from "@/components/icons";
import { Button, Card, inputClass } from "@/components/ui";
import type { Report } from "@/lib/analysis/report";
import { askAboutDayAction, generateReportAction } from "@/lib/actions";
import { cn } from "@/lib/utils";

export function AiBrief({
  date,
  initial,
  aiReady,
}: {
  date: string;
  initial: { report: Report; model: string; createdAt: string } | null;
  aiReady: boolean;
}) {
  const router = useRouter();
  const [report, setReport] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const [answers, setAnswers] = useState<{ q: string; a: string }[]>([]);
  const [asking, startAsk] = useTransition();

  function generate() {
    setError(null);
    start(async () => {
      const res = await generateReportAction(date);
      if (!res.ok) return setError(res.error);
      setReport({ report: res.report, model: res.model, createdAt: new Date().toISOString() });
      router.refresh();
    });
  }
  function ask() {
    const question = q.trim();
    if (!question) return;
    setError(null);
    startAsk(async () => {
      const res = await askAboutDayAction(date, question);
      if (!res.ok) return setError(res.error);
      setAnswers((a) => [...a, { q: question, a: res.answer }]);
      setQ("");
    });
  }

  if (!aiReady) {
    return (
      <Card className="text-sm text-zinc-400">
        The AI brief needs <code>ANTHROPIC_API_KEY</code> set on the server. All the numbers below
        still work without it.
      </Card>
    );
  }

  const r = report?.report;
  return (
    <Card className="space-y-4">
      {r ? (
        <div className="space-y-3">
          <p className="text-base font-medium leading-snug">{r.headline}</p>
          {r.standouts.length > 0 && (
            <ul className="space-y-1 text-sm text-zinc-300">
              {r.standouts.map((s, i) => (
                <li key={i}>• {s}</li>
              ))}
            </ul>
          )}
          <div className="grid gap-2">
            {[
              ["Training", r.training],
              ["Food", r.nutrition],
              ["Sleep", r.recovery],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm">
                <span className="mr-1.5 font-medium text-zinc-200">{k}</span>
                <span className="text-zinc-300">{v}</span>
              </div>
            ))}
          </div>
          {r.watchouts.length > 0 && (
            <ul className="space-y-1 text-sm text-amber-200">
              {r.watchouts.map((w, i) => (
                <li key={i}>⚠️ {w}</li>
              ))}
            </ul>
          )}
          {r.pattern && <p className="text-xs text-zinc-400">{r.pattern}</p>}
          <div className="flex items-center justify-between text-[11px] text-zinc-600">
            <span>Written by AI from your data</span>
            <button onClick={generate} disabled={pending} className="underline disabled:opacity-50">
              {pending ? "Rewriting…" : "Regenerate"}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2 text-center">
          <p className="text-sm text-zinc-400">
            What stood out and what to do today.
          </p>
          <Button className="w-full" onClick={generate} disabled={pending}>
            <SparkIcon className={cn("h-4 w-4", pending && "animate-spin")} />
            {pending ? "Writing your brief…" : "Write today's brief"}
          </Button>
        </div>
      )}

      <div className="space-y-2 border-t border-zinc-800/80 pt-3">
        {answers.map((x, i) => (
          <div key={i} className="animate-item-in space-y-1 text-sm">
            <p className="text-zinc-500">You: {x.q}</p>
            <p className="text-zinc-200">{x.a}</p>
          </div>
        ))}
        <div className="flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask()}
            placeholder="Ask about this day… e.g. why is my HRV low?"
            maxLength={500}
            className={cn(inputClass, "h-11 text-sm")}
          />
          <Button variant="secondary" className="h-11 shrink-0" onClick={ask} disabled={asking || !q.trim()}>
            {asking ? "…" : "Ask"}
          </Button>
        </div>
      </div>
      {error && <p className="text-sm text-amber-300">{error}</p>}
    </Card>
  );
}
