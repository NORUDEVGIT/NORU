import { getMarketingContent, publishedOf } from "@/core/lib/marketing";

export function HomeBlog() {
  const posts = publishedOf(getMarketingContent().blogPosts);
  if (posts.length === 0) return null;

  return (
    <section id="blog" className="bg-muted/50" aria-labelledby="blog-heading">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
        <h2 id="blog-heading" className="font-display text-3xl sm:text-4xl">
          From the journal
        </h2>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <li key={post.id} className="rounded-3xl border border-border bg-card p-6">
              <h3 className="font-display text-xl">{post.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{post.excerpt}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
