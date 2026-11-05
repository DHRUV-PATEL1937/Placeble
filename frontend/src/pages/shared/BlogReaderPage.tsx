import { ArrowLeft, Newspaper } from "lucide-react";
import { Brand, ThemeToggle } from "@/pages/auth/auth-shared";
import { blogImageUrl, type BlogPost } from "@/components/ui/recent-updates";
import { ErrorState, Loading, tpoApi, useLoad } from "@/pages/tpo/tpo-core";
import "./blog-reader.css";

const day = (value: string | null) => (value ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "");
const readMinutes = (text: string) => Math.max(1, Math.round(text.trim().split(/\s+/).length / 200));
const postIdFromPath = () => decodeURIComponent(window.location.pathname.replace(/^\/blog\/?/, "").split("/")[0] ?? "");

/** Goes back to where the reader came from, or to their dashboard when they opened the link directly. */
const goBack = () => { if (document.referrer.startsWith(window.location.origin) && window.history.length > 1) window.history.back(); else window.location.assign("/"); };

/** A full page for one post (/blog/<id>), or the list of every post (/blog). Needs a signed-in person. */
export function BlogReaderPage({ accessToken }: { accessToken: string }) {
  const id = postIdFromPath();
  return (
    <div className="br-page">
      <header className="br-top">
        <button type="button" className="br-back" onClick={goBack}><ArrowLeft size={16} aria-hidden="true" /> <span>Back</span></button>
        <a className="br-logo" href="/" aria-label="Placeble home"><Brand /></a>
        <ThemeToggle className="br-theme" />
      </header>
      <main className="br-main">{id ? <Post id={id} accessToken={accessToken} /> : <AllPosts accessToken={accessToken} />}</main>
    </div>
  );
}

function Post({ id, accessToken }: { id: string; accessToken: string }) {
  const { data, loading, error, reload } = useLoad(() => tpoApi<{ post: BlogPost }>(`/blogs/${id}`, accessToken).then(payload => payload.post), [id, accessToken]);
  const more = useLoad(() => tpoApi<{ posts: BlogPost[] }>("/blogs?limit=4", accessToken).then(payload => payload.posts.filter(post => post.id !== id).slice(0, 3)).catch(() => [] as BlogPost[]), [id, accessToken]);
  if (loading && !data) return <Loading label="Opening the post…" />;
  if (error || !data) return <ErrorState message={error || "We couldn’t open this post."} onRetry={reload} />;

  return (
    <>
      <article className="br-article">
        <header className="br-col br-head">
          <p className="br-tag">{data.tag}</p>
          <h1>{data.title}</h1>
          <p className="br-meta"><time dateTime={data.publishedAt ?? undefined}>{day(data.publishedAt)}</time> · {data.authorName} · {readMinutes(data.body)} min read</p>
          {data.summary && <p className="br-lead">{data.summary}</p>}
        </header>
        {data.imagePath && <Frame className="br-hero" src={blogImageUrl(data)} eager />}
        <div className="br-col br-body">{data.body.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
      </article>
      {!!more.data?.length && (
        <section className="br-more" aria-labelledby="br-more-title">
          <div><h2 id="br-more-title">More updates</h2><a href="/blog">See all</a></div>
          <div className="br-grid">{more.data.map(post => <PostCard key={post.id} post={post} />)}</div>
        </section>
      )}
    </>
  );
}

function AllPosts({ accessToken }: { accessToken: string }) {
  const { data, loading, error, reload } = useLoad(() => tpoApi<{ posts: BlogPost[] }>("/blogs?limit=30", accessToken).then(payload => payload.posts), [accessToken]);
  return (
    <section className="br-list">
      <p className="br-tag">From the Placeble team</p>
      <h1>Recent updates</h1>
      {loading && !data ? <Loading label="Loading updates…" /> : error ? <ErrorState message={error} onRetry={reload} /> : !data?.length ? <p className="br-empty"><Newspaper size={22} aria-hidden="true" /> Nothing posted yet. Check back soon.</p> : (
        <div className="br-grid">{data.map(post => <PostCard key={post.id} post={post} />)}</div>
      )}
    </section>
  );
}

/**
 * A picture in a fixed 16:9 frame that never crops or blows up the image: the whole picture is shown (and never enlarged past
 * its real size) over a soft blurred copy of itself, so any shape, from a wide logo to a tall poster, still looks intentional.
 */
function Frame({ src, className = "", eager = false }: { src: string; className?: string; eager?: boolean }) {
  return (
    <span className={`br-frame ${className}`.trim()}>
      <img className="br-frame-bg" src={src} alt="" aria-hidden="true" loading={eager ? "eager" : "lazy"} />
      <img className="br-frame-img" src={src} alt="" loading={eager ? "eager" : "lazy"} />
    </span>
  );
}

function PostCard({ post }: { post: BlogPost }) {
  return (
    <a className="br-card" href={`/blog/${post.id}`}>
      {post.imagePath ? <Frame src={blogImageUrl(post)} /> : <span className="br-noimg" aria-hidden="true"><Newspaper size={26} /></span>}
      <span><em>{post.tag}</em><b>{post.title}</b><small>{post.summary || post.body}</small><time dateTime={post.publishedAt ?? undefined}>{day(post.publishedAt)}</time></span>
    </a>
  );
}
