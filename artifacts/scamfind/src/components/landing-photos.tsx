import { useEffect, useRef, type ReactNode } from 'react';

const base = import.meta.env.BASE_URL;
export const photo = (name: string) => `${base}photos/${name}`;

export const PHOTO_CREDITS = [
  { file: 'remote-work.jpg', label: 'Woman working on a laptop in a bright cafe', url: 'https://www.pexels.com/photo/5029149/' },
  { file: 'home-work.jpg', label: 'Woman with coffee and laptop at home', url: 'https://www.pexels.com/photo/4050289/' },
  { file: 'career-cafe.jpg', label: 'Woman typing at a cafe table', url: 'https://www.pexels.com/photo/144230/' },
  { file: 'team-conversation.jpg', label: 'Colleagues discussing documents', url: 'https://www.pexels.com/photo/5668522/' },
];

export function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!('IntersectionObserver' in window)) { el.classList.add('in'); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { el.classList.add('in'); io.disconnect(); } }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={`reveal ${className}`} style={{ transitionDelay: `${delay}ms` }}>{children}</div>;
}

type FrameProps = {
  src: string; alt: string; ratio: string; className?: string; eager?: boolean;
  position?: string; caption?: string; testId: string;
};

export function PhotoFrame({ src, alt, ratio, className = '', eager, position = 'center', caption, testId }: FrameProps) {
  return (
    <figure className={`photo-zoom relative overflow-hidden rounded-[1.75rem] bg-secondary ${className}`} style={{ aspectRatio: ratio }}>
      <img
        src={photo(src)} alt={alt} width={1400} height={933}
        loading={eager ? 'eager' : 'lazy'} decoding="async" {...(eager ? { fetchPriority: 'high' as const } : {})}
        className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: position }}
        data-testid={testId}
      />
      {caption && (
        <figcaption className="absolute bottom-3 left-3 rounded-full bg-[hsl(42_45%_98%/0.88)] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-foreground/75 backdrop-blur">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

export function PhotoCredits() {
  return (
    <div className="text-[11px] leading-relaxed text-[hsl(40_38%_95%/0.5)]" data-testid="text-photo-credits">
      Photography from Pexels, used under the Pexels license. People shown are photographic models, not ScamFind users or scam victims:{' '}
      {PHOTO_CREDITS.map((c, i) => (
        <span key={c.file}>
          <a href={c.url} target="_blank" rel="noopener noreferrer" className="underline decoration-white/20 underline-offset-2 hover:text-white" data-testid={`link-credit-${i}`}>{c.label}</a>
          {i < PHOTO_CREDITS.length - 1 ? '; ' : '.'}
        </span>
      ))}
    </div>
  );
}
