import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';
import { CtaBand, PageHero, Prose, SitePage } from '@/components/site/site-chrome';
import { POSTS, findPost } from '@/lib/site/posts';

export function generateStaticParams() {
  return POSTS.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = findPost(slug);
  if (!post) return { title: 'Article not found' };
  return { title: post.title, description: post.excerpt };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = findPost(slug);
  if (!post) notFound();

  return (
    <SitePage>
      <PageHero
        kicker={`${post.date} · ${post.readingMinutes} min read`}
        title={post.title}
        lead={post.excerpt}
      />

      <section className="lp-section">
        <Prose sections={post.sections} />

        <div className="pg-prose" style={{ marginTop: 36 }}>
          <p>
            <Link
              href="/blog"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--fin-dim)' }}
            >
              <ArrowLeft size={12} />
              All articles
            </Link>
          </p>
        </div>
      </section>

      <CtaBand
        title="The argument is better with a chart."
        copy="Open a free account and take a demo duel — same chart, same rules, nothing at stake."
      />
    </SitePage>
  );
}
