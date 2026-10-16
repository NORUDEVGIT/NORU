import { ContactForm } from "../components/ContactForm";
import { SplitPage, type SplitSection } from "../components/SplitPage";
import { hrefFor } from "../lib/router";
import { useNoruSite } from "../site-context";

export function Resources({
  anchor,
  detail,
}: {
  anchor?: string | undefined;
  detail?: string | undefined;
}) {
  const { about, posts, quotes } = useNoruSite();
  if (anchor === "blogs" && detail) {
    const post = posts.find((item) => item.slug === detail);
    return (
      <div className="pg on" id="resources">
        <div className="pbn">
          <div className="w ph1">
            <h1>{post?.title ?? "Article"}</h1>
            {post?.excerpt ? <p className="mut">{post.excerpt}</p> : null}
          </div>
        </div>
        <section>
          <div className="w">
            <p style={{ whiteSpace: "pre-wrap" }}>
              {post?.body || "That article is not available."}
            </p>
            <p style={{ marginTop: 24 }}>
              <a href={hrefFor("resources", "blogs")}>Back to blogs</a>
            </p>
          </div>
        </section>
      </div>
    );
  }

  const sections: SplitSection[] = [
    {
      id: "about",
      icon: "about",
      title: about.title,
      lead: about.intro,
      body: <p style={{ whiteSpace: "pre-wrap" }}>{about.body}</p>,
    },
    {
      id: "blogs",
      icon: "blogs",
      title: "Blogs",
      lead: "Articles related to hospitality management trends, product updates, and industry insights.",
      body: (
        <div className="g4">
          {posts.map((post) =>
            post.body.trim() ? (
              <a key={post.id} className="card" href={hrefFor("resources", "blogs", post.slug)}>
                <h3>{post.title}</h3>
                {post.excerpt ? <p>{post.excerpt}</p> : null}
              </a>
            ) : (
              <div key={post.id} className="ph">
                {post.title}
              </div>
            ),
          )}
        </div>
      ),
    },
    {
      id: "testimonials",
      icon: "testimonials",
      title: "Testimonials",
      lead: "Quotes and case studies from hotels, restaurants, and resorts currently using the platform.",
      body: (
        <div className="g4">
          {quotes.map((quote) =>
            quote.quote.trim() ? (
              <div key={quote.id} className="card">
                <p>“{quote.quote}”</p>
                <p>
                  <strong>{quote.authorName}</strong>
                  {quote.authorRole || quote.propertyName
                    ? ` · ${[quote.authorRole, quote.propertyName].filter(Boolean).join(" · ")}`
                    : null}
                </p>
              </div>
            ) : (
              <div key={quote.id} className="ph">
                {quote.authorName}
              </div>
            ),
          )}
        </div>
      ),
    },
    {
      id: "contact",
      icon: "contact",
      title: "Contact Us",
      lead: "Submissions are routed to the company's official email inbox.",
      body: <ContactForm />,
    },
  ];

  return <SplitPage page="resources" sections={sections} anchor={anchor} />;
}
