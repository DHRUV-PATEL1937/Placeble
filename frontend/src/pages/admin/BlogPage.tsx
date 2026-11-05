import { ImagePlus, Newspaper, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { blogImageUrl, type BlogPost } from "@/components/ui/recent-updates";
import { Card, EmptyState, ErrorState, Loading, Modal, PageHeader, errorMessage, formatDate, tpoApi, useLoad, type Notify } from "@/pages/tpo/tpo-core";
import "@/components/ui/recent-updates.css";

const TAGS = ["Update", "Tip", "Announcement", "Story", "Event"];
// Every card and the article header show the picture in a 16:9 landscape frame, so that is the size to upload.
const BEST = { w: 1600, h: 900 };
const MIN_WIDTH = 1200;
type Draft = { title: string; summary: string; body: string; tag: string; published: boolean };
const blank: Draft = { title: "", summary: "", body: "", tag: "Update", published: true };

/** Superadmin: write short posts with a picture. Published posts appear at the bottom of every dashboard. */
export function BlogPage({ accessToken, notify }: { accessToken: string; notify: Notify }) {
  const { data, loading, error, reload } = useLoad(() => tpoApi<{ posts: BlogPost[] }>("/platform-admin/blogs", accessToken).then(payload => payload.posts), [accessToken]);
  const [editing, setEditing] = useState<BlogPost | "new" | null>(null);
  const [removing, setRemoving] = useState<BlogPost | null>(null);

  const remove = async () => {
    if (!removing) return;
    try { await tpoApi(`/platform-admin/blogs/${removing.id}`, accessToken, { method: "DELETE" }); notify("Post deleted."); setRemoving(null); reload(); }
    catch (cause) { notify(errorMessage(cause), "error"); }
  };

  return (
    <>
      <PageHeader title="Blog" description="Short updates, tips and stories. Published posts show up at the bottom of every dashboard." actions={<button type="button" className="tp-btn primary" onClick={() => setEditing("new")}><Plus size={16} aria-hidden="true" /> New post</button>} />
      <Card flush>
        {loading && !data ? <Loading label="Loading posts…" /> : error ? <ErrorState message={error} onRetry={reload} /> : !data?.length ? (
          <EmptyState icon={Newspaper} title="No posts yet" text="Write your first update. It appears for students, TPOs and everyone else once published." action={<button type="button" className="tp-btn primary" onClick={() => setEditing("new")}><Plus size={16} aria-hidden="true" /> New post</button>} />
        ) : (
          <ul className="tp-queue">
            {data.map(post => (
              <li key={post.id}>
                {post.imagePath ? <img className="bp-thumb" src={blogImageUrl(post)} alt="" /> : <span className="tp-icon-tile"><Newspaper size={20} aria-hidden="true" /></span>}
                <div className="tp-queue-main"><strong>{post.title}</strong><small>{post.tag} · {post.publishedAt ? `Published ${formatDate(post.publishedAt)}` : "Draft"}</small></div>
                <span className={`tp-pill ${post.status === "published" ? "st-ready" : "st-neutral"}`}>{post.status === "published" ? "Published" : "Draft"}</span>
                <div className="tp-queue-actions">
                  <button type="button" className="tp-btn ghost sm" onClick={() => setEditing(post)} aria-label={`Edit ${post.title}`}><Pencil size={14} aria-hidden="true" /> Edit</button>
                  <button type="button" className="tp-btn ghost danger sm" onClick={() => setRemoving(post)} aria-label={`Delete ${post.title}`}><Trash2 size={14} aria-hidden="true" /> Delete</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {editing && <PostEditor post={editing === "new" ? null : editing} accessToken={accessToken} onClose={() => setEditing(null)} onSaved={message => { notify(message); setEditing(null); reload(); }} />}
      {removing && (
        <Modal title="Delete this post?" description={`“${removing.title}” will disappear from every dashboard. This can’t be undone.`} onClose={() => setRemoving(null)}>
          <footer className="tp-modal-foot"><button type="button" className="tp-btn ghost" onClick={() => setRemoving(null)}>Keep it</button><button type="button" className="tp-btn danger-solid" onClick={() => void remove()}>Delete post</button></footer>
        </Modal>
      )}
    </>
  );
}

function PostEditor({ post, accessToken, onClose, onSaved }: { post: BlogPost | null; accessToken: string; onClose: () => void; onSaved: (message: string) => void }) {
  const [draft, setDraft] = useState<Draft>(post ? { title: post.title, summary: post.summary, body: post.body, tag: post.tag, published: post.status === "published" } : blank);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [removeImage, setRemoveImage] = useState(false);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  // The temporary preview address is released when the editor closes.
  const previewRef = useRef("");
  useEffect(() => () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current); }, []);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(current => ({ ...current, [key]: value }));
  const choose = (next: File | undefined) => {
    if (!next) return;
    setError("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(next.type)) { setError("Choose a JPG, PNG or WebP picture."); return; }
    if (next.size > 2 * 1024 * 1024) { setError("That picture is over 2 MB. Choose a smaller one."); return; }
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = URL.createObjectURL(next);
    setPreview(previewRef.current); setFile(next); setRemoveImage(false); setDims(null);
    const probe = new Image();
    probe.onload = () => setDims({ w: probe.naturalWidth, h: probe.naturalHeight });
    probe.src = previewRef.current;
  };
  const tooSmall = Boolean(dims && dims.w < MIN_WIDTH);
  const offRatio = Boolean(dims && Math.abs(dims.w / dims.h - BEST.w / BEST.h) > 0.08);
  const shown = preview || (!removeImage && post ? blogImageUrl(post) : "");

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (draft.title.trim().length < 3) { setError("Give the post a title."); return; }
    if (draft.body.trim().length < 10) { setError("Write at least a sentence."); return; }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("title", draft.title.trim()); form.append("summary", draft.summary.trim()); form.append("body", draft.body.trim());
      form.append("tag", draft.tag); form.append("published", String(draft.published)); form.append("removeImage", String(removeImage && !file));
      if (file) form.append("image", file);
      await tpoApi(post ? `/platform-admin/blogs/${post.id}` : "/platform-admin/blogs", accessToken, { method: post ? "PATCH" : "POST", form });
      onSaved(post ? "Post updated." : draft.published ? "Post published." : "Draft saved.");
    } catch (cause) { setError(errorMessage(cause, "Could not save this post.")); }
    finally { setBusy(false); }
  };

  return (
    <Modal title={post ? "Edit post" : "New post"} description="Keep it short and useful. A picture makes it stand out." onClose={onClose} wide>
      <form className="tp-form" onSubmit={submit} noValidate>
        {error && <div className="tp-alert error" role="alert">{error}</div>}
        <div className="tp-field"><label htmlFor="bp-title">Title <em>{draft.title.length}/120</em></label><input id="bp-title" value={draft.title} maxLength={120} onChange={event => set("title", event.target.value)} placeholder="What’s new?" autoComplete="off" /></div>
        <div className="tp-field-row">
          <div className="tp-field"><label htmlFor="bp-tag">Type</label><select id="bp-tag" value={draft.tag} onChange={event => set("tag", event.target.value)}>{TAGS.map(tag => <option key={tag}>{tag}</option>)}</select></div>
          <div className="tp-field"><label htmlFor="bp-summary">One-line summary <em>{draft.summary.length}/240</em></label><input id="bp-summary" value={draft.summary} maxLength={240} onChange={event => set("summary", event.target.value)} placeholder="Shown on the card" autoComplete="off" /></div>
        </div>
        <div className="tp-field"><label htmlFor="bp-body">Post <em>{draft.body.length}/4000</em></label><textarea id="bp-body" rows={7} value={draft.body} maxLength={4000} onChange={event => set("body", event.target.value)} placeholder="Write the full post. Leave a blank line between paragraphs." /></div>
        <div className="tp-field">
          <label htmlFor="bp-picture">Picture <em>Optional · {BEST.w} × {BEST.h} px (16:9) · JPG, PNG or WebP · up to 2 MB</em></label>
          <div className="bp-picture">
            {shown ? <img src={shown} alt="Post preview" /> : <span aria-hidden="true"><ImagePlus size={26} /></span>}
            <div>
              <input id="bp-picture" ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={event => choose(event.target.files?.[0])} aria-label="Choose a picture" />
              <button type="button" className="tp-btn secondary sm" onClick={() => input.current?.click()}><ImagePlus size={14} aria-hidden="true" /> {shown ? "Change picture" : "Add picture"}</button>
              {shown && <button type="button" className="tp-btn ghost danger sm" onClick={() => { setFile(null); setPreview(""); setDims(null); setRemoveImage(true); if (input.current) input.current.value = ""; }}><Trash2 size={14} aria-hidden="true" /> Remove</button>}
            </div>
          </div>
          <ul className="bp-guide">
            <li><b>Best size: {BEST.w} × {BEST.h} px</b>, landscape 16:9. Minimum {MIN_WIDTH} × {Math.round(MIN_WIDTH * 9 / 16)} px so it stays sharp on large screens.</li>
            <li>Cards and the article header all use the same 16:9 frame, so other shapes are cropped to fit. Keep faces and text near the centre.</li>
            <li>Under 2 MB. Use JPG or WebP for photos, PNG for graphics with text.</li>
          </ul>
          {dims && <p className={`tp-field-${tooSmall || offRatio ? "error" : "hint"}`} role={tooSmall || offRatio ? "alert" : undefined}>
            {dims.w} × {dims.h} px{tooSmall ? ` — a bit small. Use at least ${MIN_WIDTH} px wide.` : offRatio ? ` — not 16:9, so the edges will be cropped. Best is ${BEST.w} × ${BEST.h} px.` : " — good size."}
          </p>}
        </div>
        <label className="tp-switch"><input type="checkbox" role="switch" checked={draft.published} onChange={event => set("published", event.target.checked)} /><span aria-hidden="true" /><b>{draft.published ? "Published" : "Draft"}<small>{draft.published ? "Visible on every dashboard" : "Only you can see it"}</small></b></label>
        <footer className="tp-modal-foot"><button type="button" className="tp-btn ghost" onClick={onClose}>Cancel</button><button type="submit" className="tp-btn primary" disabled={busy}>{busy ? "Saving…" : post ? "Save changes" : draft.published ? "Publish" : "Save draft"}</button></footer>
      </form>
    </Modal>
  );
}
