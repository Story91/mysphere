'use client';

import { useEffect, useId, useState } from 'react';

/**
 * Jeden diagram mermaid, renderowany WYLACZNIE po stronie klienta.
 *
 * Mermaid buduje SVG przez DOM, wiec import na serwerze wywala render - dlatego
 * `import('mermaid')` jest dynamiczny i siedzi w useEffect. `securityLevel:
 * 'strict'` sanityzuje etykiety; diagramy sa nasze (z plikow docs), ale zasada
 * zostaje. Gdy render padnie, pokazujemy zrodlo diagramu jako kod - pusty
 * prostokat nie powiedzialby czytelnikowi, ze cos tu mialo byc.
 */
export default function MermaidBlock({ chart }: { chart: string }) {
  const rawId = useId();
  const id = `mmd-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: 'neutral',
          securityLevel: 'strict',
          fontFamily: 'var(--font-soft-body), ui-sans-serif, system-ui, sans-serif',
        });
        const { svg: rendered } = await mermaid.render(id, chart);
        if (!cancelled) setSvg(rendered);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chart, id]);

  if (failed) {
    return (
      <pre className="my-6 overflow-x-auto rounded-card border border-soft-line bg-soft-sunken p-4 font-mono text-[12px] leading-[1.5] text-soft-ink-muted">
        <code>{chart}</code>
      </pre>
    );
  }

  if (!svg) {
    return (
      <div
        className="my-6 h-44 animate-pulse rounded-card border border-soft-line bg-soft-sunken"
        aria-busy="true"
        aria-label="Rendering diagram"
      />
    );
  }

  return (
    <figure
      className="my-6 overflow-x-auto rounded-card border border-soft-line bg-soft-surface p-4 shadow-card [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
      // Mermaid w trybie 'strict' oddaje juz zsanityzowany SVG.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
