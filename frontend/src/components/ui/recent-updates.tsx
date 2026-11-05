import { Newspaper } from "lucide-react";
import { API_URL } from "@/pages/auth/auth-shared";
import { tpoApi, useLoad } from "@/pages/tpo/tpo-core";
import "./recent-updates.css";

export type BlogPost = { id: string; title: string; summary: string; body: string; tag: string; status: string; publishedAt: string | null; authorName: string; imagePath: string | null };

export const blogImageUrl = (post: Pick<BlogPost, "imagePath">) => (post.imagePath ? `${API_URL}${post.imagePath}` : "");
const day = (value: string | null) => (value ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");

/** The newest posts from the Placeble team, shown at the bottom of every dashboard. Hidden when there is nothing to show. */
export function RecentUpdates({ accessToken, limit = 3 }: { accessToken: string; limit?: number }) {
  const { data } = useLoad(() => tpoApi<{ posts: BlogPost[] }>(`/blogs?limit=${limit}`, accessToken).then(payload => payload.posts).catch(() => [] as BlogPost[]), [accessToken, limit]);
  if (!data?.length) return null;

  return (
    <section className="ru" aria-labelledby="ru-title">
      <header><span aria-hidden="true"><Newspaper size={16} /></span><h2 id="ru-title">Recent updates</h2><a href="/blog">See all</a></header>
      <div className="ru-grid">
        {data.map(post => (
          <a key={post.id} className="ru-card" href={`/blog/${post.id}`}>
            {post.imagePath ? <span className="ru-frame"><img className="ru-frame-bg" src={blogImageUrl(post)} alt="" aria-hidden="true" loading="lazy" /><img className="ru-frame-img" src={blogImageUrl(post)} alt="" loading="lazy" /></span> : <span className="ru-noimg" aria-hidden="true"><Newspaper size={26} /></span>}
            <span className="ru-body">
              <em>{post.tag}</em>
              <b>{post.title}</b>
              <small>{post.summary || post.body}</small>
              <time dateTime={post.publishedAt ?? undefined}>{day(post.publishedAt)}</time>
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
