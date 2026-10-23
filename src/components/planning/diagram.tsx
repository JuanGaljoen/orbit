"use client";

import { useEffect, useId, useState } from "react";

/** Renders Mermaid source client-side. mermaid is loaded lazily so it stays out of other pages. */
export function MermaidDiagram({ source }: { source: string }) {
  const id = useId().replace(/:/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("mermaid").then(async ({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "strict" });
      try {
        const { svg } = await mermaid.render(`mermaid-${id}`, source);
        if (!cancelled) setSvg(svg);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id, source]);

  if (error)
    return (
      <div className="space-y-2 text-sm">
        <p className="text-amber-400">The diagram has a Mermaid syntax error: {error}</p>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">{source}</pre>
      </div>
    );
  if (!svg) return <p className="text-sm text-muted-foreground">Rendering…</p>;
  return <div className="overflow-x-auto [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} />;
}
