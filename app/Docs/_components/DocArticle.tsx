'use client';

import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import MermaidBlock from './MermaidBlock';

/**
 * Jeden renderer dla wszystkich stron dokumentacji.
 *
 * Tresc kazdej strony to zwykly markdown (pliki w app/Docs/_content/*), a ten
 * komponent nadaje mu wyglad Soft i wpina dwie rzeczy, ktorych goly markdown
 * nie ma:
 *   - MATEMATYKA: remark-math + rehype-katex renderuja `$...$` oraz `$$...$$`.
 *     CSS KaTeX-a importujemy raz, tutaj.
 *   - DIAGRAMY: blok ```mermaid przechwytujemy w rendererze `code` i oddajemy
 *     do MermaidBlock (klient). `pre` jest przezroczyste, zeby diagram nie
 *     wyladowal w ramce kodu, a blok kodu i tak dostaje swoja ramke z `code`.
 *
 * Kolory i kroje ida z tokenow `soft-*` - ta sama paleta co reszta aplikacji,
 * zeby dokumentacja nie wygladala jak doklejona z innego produktu.
 */
export default function DocArticle({ content }: { content: string }) {
  return (
    <article className="font-soft text-soft-ink">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          h1: ({ node, ...props }) => (
            <h1
              className="mb-4 mt-0 font-soft-display text-[30px] font-bold leading-[1.1] tracking-[-0.02em] text-soft-ink sm:text-[38px]"
              {...props}
            />
          ),
          h2: ({ node, ...props }) => (
            <h2
              className="mb-3 mt-11 scroll-mt-24 font-soft-display text-[22px] font-bold leading-[1.2] tracking-[-0.01em] text-soft-ink sm:text-[26px]"
              {...props}
            />
          ),
          h3: ({ node, ...props }) => (
            <h3 className="mb-2 mt-7 font-soft-display text-[16.5px] font-bold text-soft-ink" {...props} />
          ),
          p: ({ node, ...props }) => (
            <p className="mb-4 text-[15px] leading-[1.7] text-soft-ink-muted" {...props} />
          ),
          ul: ({ node, ...props }) => (
            <ul className="mb-4 ml-5 list-disc space-y-1.5 text-[15px] leading-[1.7] text-soft-ink-muted" {...props} />
          ),
          ol: ({ node, ...props }) => (
            <ol className="mb-4 ml-5 list-decimal space-y-1.5 text-[15px] leading-[1.7] text-soft-ink-muted" {...props} />
          ),
          li: ({ node, ...props }) => <li className="pl-1 marker:text-soft-ink-faint" {...props} />,
          strong: ({ node, ...props }) => <strong className="font-bold text-soft-ink" {...props} />,
          em: ({ node, ...props }) => <em className="italic" {...props} />,
          a: ({ node, href, ...props }) => {
            const external = !!href && /^https?:\/\//.test(href);
            return (
              <Link
                href={href || '#'}
                target={external ? '_blank' : undefined}
                rel={external ? 'noopener noreferrer' : undefined}
                className="font-semibold text-soft-primary-deep underline decoration-soft-line underline-offset-[3px] transition-colors hover:text-soft-primary"
                {...props}
              />
            );
          },
          blockquote: ({ node, ...props }) => (
            <blockquote
              className="mb-5 rounded-r-lg border-l-[3px] border-soft-primary/50 bg-soft-sunken/60 px-4 py-3 text-[14px] leading-[1.65] text-soft-ink-soft [&>p]:mb-0"
              {...props}
            />
          ),
          hr: () => <hr className="my-9 border-0 border-t border-soft-line" />,
          table: ({ node, ...props }) => (
            <div className="mb-5 overflow-x-auto rounded-card border border-soft-line">
              <table className="w-full border-collapse text-[13.5px]" {...props} />
            </div>
          ),
          thead: ({ node, ...props }) => <thead className="bg-soft-sunken text-left" {...props} />,
          th: ({ node, ...props }) => (
            <th
              className="px-3 py-2 font-soft-display text-[11.5px] font-bold uppercase tracking-[0.06em] text-soft-ink-faint"
              {...props}
            />
          ),
          td: ({ node, ...props }) => (
            <td className="border-t border-soft-line/70 px-3 py-2 align-top leading-[1.55] text-soft-ink-muted" {...props} />
          ),
          // `pre` przezroczyste: o wygladzie bloku decyduje `code` ponizej, dzieki
          // czemu diagram mermaid nie laduje w ramce przeznaczonej dla kodu.
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children }) => {
            const text = String(children ?? '').replace(/\n$/, '');
            if (/\blanguage-mermaid\b/.test(className || '')) {
              return <MermaidBlock chart={text} />;
            }
            const isBlock = /\blanguage-/.test(className || '') || text.includes('\n');
            if (isBlock) {
              return (
                <pre className="mb-5 overflow-x-auto rounded-card border border-soft-line bg-soft-sunken p-4 font-mono text-[12.5px] leading-[1.6] text-soft-ink">
                  <code>{children}</code>
                </pre>
              );
            }
            return (
              <code className="rounded bg-soft-sunken px-1.5 py-0.5 font-mono text-[13px] text-soft-primary-deep">
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
}
