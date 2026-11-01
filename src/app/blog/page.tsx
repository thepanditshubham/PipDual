import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { CtaBand, PageHero, SitePage } from '@/components/site/site-chrome';
import { POSTS } from '@/lib/site/posts';

export const metadata = {
  title: 'Blog — Notes on the format',
  description:
    'Short essays on fairness, entry caps and scoring in a 1v1 trading arena. No price predictions, no signal selling.',
};

export default function BlogPage() {
  return (
    <SitePage>
      <PageHero
        kicker="Blog"
        title={
          <>
            Notes on the format,
            <br />
            <em>not on where price is going.</em>
          </>
        }
        lead="We do not publish signals or forecasts. These are essays about how the arena is built and why the rules are shaped the way they are."
        meta={[`${POSTS.length} articles`, 'No paid placements']}
      />

      <section className="lp-section">
        <div className="pg-table-outer">
          <div style={{ display: 'grid', gap: 1, background: 'var(--fin-border-1)', border: '1px solid var(--fin-border-1)' }}>
            {POSTS.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                style={{
                  display: 'block',
                  padding: '26px 24px',
                  background: 'var(--fin-panel)',
                  color: 'inherit',
                  textDecoration: 'none',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 12,
                    marginBottom: 10,
                    color: 'var(--fin-muted)',
                    fontSize: 10,
                    letterSpacing: '1.2px',
                    textTransform: 'uppercase',
                  }}
                >
                  <span>{post.date}</span>
                  <span style={{ color: 'var(--fin-border-3)' }}>·</span>
                  <span>{post.readingMinutes} min read</span>
                </div>

                <h2 style={{ margin: '0 0 8px', fontSize: 19, fontWeight: 700, letterSpacing: '-0.3px' }}>
                  {post.title}
                </h2>

                <p style={{ margin: 0, maxWidth: '68ch', color: 'var(--fin-dim)', fontSize: 13, lineHeight: 1.7 }}>
                  {post.excerpt}
                </p>

                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    marginTop: 14,
                    color: 'var(--fin-orange)',
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '1px',
                    textTransform: 'uppercase',
                  }}
                >
                  Read
                  <ArrowRight size={12} />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <CtaBand
        title="Read less, play more."
        copy="The Free tables show every idea on this page better than an article can."
      />
    </SitePage>
  );
}
