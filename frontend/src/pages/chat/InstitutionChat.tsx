import {
  ArrowDown, ArrowLeft, Check, CheckCheck, MessageCircle, MessageSquarePlus, Pencil, PanelRight, Search,
  Send, ShieldCheck, SlidersHorizontal, Trash2, UserRound, X,
} from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { API_URL } from "@/pages/auth/auth-shared";
import {
  ChatAvatar, ProfilePanel, clockTime, dayLabel, highlight, listTime, sameDay,
  type ActiveStudent, type ChatMessage, type MessageHit, type Person, type StudentProfile, type Thread,
} from "./chat-ui";
import "./institution-chat.css";

type Role = "student" | "tpo";
type Chip = "all" | "unread" | "needs-reply" | "replied";
type SearchResults = { people: Person[]; messages: MessageHit[] };

const CHIPS: Array<{ id: Chip; label: string }> = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "needs-reply", label: "Needs reply" },
  { id: "replied", label: "Replied" },
];

/** Merge messages by id, oldest first. ObjectIds are time-ordered, so id order is chronological. */
const merge = (current: ChatMessage[], incoming: ChatMessage[]) => {
  const byId = new Map(current.map(message => [message.id, message]));
  incoming.forEach(message => byId.set(message.id, message));
  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
};

/** `openStudent` opens that student's conversation straight away, e.g. from the Message button on their profile. */
export function InstitutionChat({ role, accessToken, onOpenStudents, openStudent }: { role: Role; accessToken: string; onOpenStudents?: () => void; openStudent?: ActiveStudent | null }) {
  const isTpo = role === "tpo";
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(isTpo);
  const [team, setTeam] = useState<{ name: string }[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [active, setActive] = useState<ActiveStudent | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [unreadFrom, setUnreadFrom] = useState<string | null>(null);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>({ people: [], messages: [] });
  const [searching, setSearching] = useState(false);
  const [chip, setChip] = useState<Chip>("all");
  const [branch, setBranch] = useState("all");
  const [batch, setBatch] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [profileOpen, setProfileOpen] = useState(false);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");

  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);

  const scroller = useRef<HTMLDivElement>(null);
  const searchBox = useRef<HTMLInputElement>(null);
  const stick = useRef(true);
  const selectedRef = useRef<string | null>(null);
  const threadsBusy = useRef(false);
  const messagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => { messagesRef.current = messages; });

  const request = useCallback(async (path: string, init?: RequestInit) => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 9000);
    try {
      const response = await fetch(`${API_URL}/chat${path}`, {
        credentials: "include",
        signal: controller.signal,
        ...init,
        headers: { Authorization: `Bearer ${accessToken}`, ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Messages are unavailable. Please try again.");
      return data;
    } finally { window.clearTimeout(timeoutId); }
  }, [accessToken]);
  const fail = (cause: unknown, fallback: string) => setError(cause instanceof Error ? cause.message : fallback);

  /* ───────── Threads ───────── */
  const loadThreads = useCallback(async () => {
    if (!isTpo || threadsBusy.current) return;
    threadsBusy.current = true;
    try { const data = await request("/threads"); setThreads(data.threads ?? []); }
    finally { threadsBusy.current = false; }
  }, [isTpo, request]);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        if (isTpo) await loadThreads();
        else {
          const [teamData, meResponse] = await Promise.all([request("/team"), fetch(`${API_URL}/auth/me`, { credentials: "include", headers: { Authorization: `Bearer ${accessToken}` } })]);
          if (!meResponse.ok) throw new Error("Could not open your conversation.");
          const me = await meResponse.json();
          const id = me.user?.id ?? me.user?._id;
          if (!id) throw new Error("Could not open your conversation.");
          if (live) { setTeam(teamData.team ?? []); selectedRef.current = id; setSelected(id); }
        }
      } catch (cause) { if (live) fail(cause, "Could not load messages."); }
      finally { if (live) setThreadsLoading(false); }
    })();
    return () => { live = false; };
  }, [isTpo, accessToken, request, loadThreads]);

  useEffect(() => {
    if (!isTpo) return;
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void loadThreads().catch(() => undefined); }, 10000);
    return () => window.clearInterval(timer);
  }, [isTpo, loadThreads]);

  /* ───────── Messages ───────── */
  const markRead = useCallback((id: string) => {
    void request(`/threads/${encodeURIComponent(id)}/read`, { method: "PATCH" }).then(() => { if (isTpo) void loadThreads(); }).catch(() => undefined);
  }, [isTpo, loadThreads, request]);

  const loadMessages = useCallback(async (id: string, mode: "open" | "poll" | "older", before?: string) => {
    try {
      const data = await request(`/threads/${encodeURIComponent(id)}/messages${before ? `?before=${encodeURIComponent(before)}` : ""}`);
      if (selectedRef.current !== id) return [] as ChatMessage[];
      const incoming: ChatMessage[] = data.messages ?? [];
      setActive(current => ({ ...(current?.id === id ? current : {}), id, name: data.student.name, email: data.student.email } as ActiveStudent));
      if (mode !== "poll") setHasMore(Boolean(data.hasMore));
      setMessages(current => (mode === "open" ? incoming : merge(current, incoming)));
      if (mode === "open") {
        setUnreadFrom(incoming.find(message => message.senderRole !== role && !message.readAt)?.id ?? null);
        markRead(id);
      } else if (mode === "poll" && document.visibilityState === "visible" && incoming.some(message => message.senderRole !== role && !message.readAt)) markRead(id);
      return incoming;
    } catch (cause) {
      if (mode !== "poll") fail(cause, "Could not load messages.");
      return [] as ChatMessage[];
    } finally { if (mode === "open" && selectedRef.current === id) setConversationLoading(false); }
  }, [markRead, request, role]);

  useEffect(() => {
    if (!selected) return;
    const first = window.setTimeout(() => void loadMessages(selected, "open"), 0);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void loadMessages(selected, "poll"); }, 6000);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [selected, loadMessages]);

  // Keep the view pinned to the newest message unless the reader has scrolled up.
  useEffect(() => {
    const element = scroller.current;
    if (element && stick.current && !focusId) element.scrollTop = element.scrollHeight;
  }, [messages, selected, focusId]);

  // Jump to (and flash) a message, e.g. when opened from a search result.
  useEffect(() => {
    if (!focusId) return;
    const target = document.getElementById(`ic-msg-${focusId}`);
    if (target) {
      target.scrollIntoView({ block: "center", behavior: "smooth" });
      const timer = window.setTimeout(() => setFocusId(null), 2600);
      return () => window.clearTimeout(timer);
    }
  }, [focusId, messages]);

  const select = (student: ActiveStudent, jumpTo?: string) => {
    setQuery(""); setFiltersOpen(false);
    if (selectedRef.current !== student.id) {
      selectedRef.current = student.id;
      stick.current = true;
      setSelected(student.id); setActive(student);
      setMessages([]); setHasMore(false); setUnreadFrom(null); setDraft(""); setEditing(null); setDeleting(null);
      setProfile(null); setProfileError(""); setConversationLoading(true); setError("");
    }
    if (jumpTo) void findMessage(student.id, jumpTo);
  };

  // Arriving with a student chosen: open their chat (even if they have no messages yet).
  const openedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!isTpo || !openStudent || openedFor.current === openStudent.id) return;
    openedFor.current = openStudent.id;
    select(openStudent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTpo, openStudent]);

  /** Page backwards until the target message is loaded, then focus it. */
  const findMessage = async (studentId: string, id: string) => {
    const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));
    await wait(400);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      if (selectedRef.current !== studentId) return;
      const current = messagesRef.current;
      if (current.some(message => message.id === id)) { stick.current = false; setFocusId(id); return; }
      if (!current.length) { await wait(250); continue; }
      await loadMessages(studentId, "older", current[0].id);
      await wait(80);
    }
  };

  /* ───────── Profile ───────── */
  useEffect(() => {
    if (!isTpo || !profileOpen || !selected) return;
    let live = true;
    request(`/students/${encodeURIComponent(selected)}/profile`)
      .then(data => { if (live) { setProfile(data.profile); setProfileError(""); } })
      .catch(cause => { if (live) setProfileError(cause instanceof Error ? cause.message : "Could not load this profile."); })
      .finally(() => { if (live) setProfileLoading(false); });
    return () => { live = false; };
  }, [isTpo, profileOpen, selected, request]);

  const toggleProfile = () => { if (!profileOpen) { setProfileLoading(true); setProfileError(""); } setProfileOpen(open => !open); };
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); setNotice("Email copied."); } catch { setNotice("Could not copy."); } window.setTimeout(() => setNotice(""), 2200); };

  /* ───────── Search ───────── */
  const term = query.trim();
  useEffect(() => {
    if (!isTpo || term.length < 2) return;
    let live = true;
    const timer = window.setTimeout(() => {
      setSearching(true);
      request(`/search?q=${encodeURIComponent(term)}`)
        .then(data => { if (live) setResults({ people: data.people ?? [], messages: data.messages ?? [] }); })
        .catch(() => { if (live) setResults({ people: [], messages: [] }); })
        .finally(() => { if (live) setSearching(false); });
    }, 250);
    return () => { live = false; window.clearTimeout(timer); };
  }, [isTpo, term, request]);

  /* ───────── Composer actions ───────── */
  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    const body = draft.trim();
    if (!body || sending || !selected) return;
    setSending(true); setError("");
    try {
      const data = await request("/messages", { method: "POST", body: JSON.stringify({ body, ...(isTpo ? { studentId: selected } : {}) }) });
      stick.current = true;
      setMessages(current => merge(current, [data.message]));
      setDraft("");
      if (isTpo) void loadThreads();
    } catch (cause) { fail(cause, "Could not send your message."); }
    finally { setSending(false); }
  };
  const saveEdit = async () => {
    if (!editing || !editing.text.trim()) return;
    try { const data = await request(`/messages/${editing.id}`, { method: "PATCH", body: JSON.stringify({ body: editing.text.trim() }) }); setMessages(current => merge(current, [data.message])); setEditing(null); if (isTpo) void loadThreads(); }
    catch (cause) { fail(cause, "Could not edit this message."); }
  };
  const remove = async (id: string) => {
    try { const data = await request(`/messages/${id}`, { method: "DELETE" }); setMessages(current => merge(current, [data.message])); setDeleting(null); if (isTpo) void loadThreads(); }
    catch (cause) { fail(cause, "Could not delete this message."); }
  };

  /* ───────── Derived lists ───────── */
  const unreadTotal = threads.reduce((sum, thread) => sum + thread.unread, 0);
  const branches = useMemo(() => [...new Set(threads.map(thread => thread.branch).filter(Boolean))].sort() as string[], [threads]);
  const batches = useMemo(() => [...new Set(threads.map(thread => thread.batchYear).filter(Boolean))].sort() as number[], [threads]);
  const filterCount = (branch !== "all" ? 1 : 0) + (batch !== "all" ? 1 : 0);
  const counts = { all: threads.length, unread: threads.filter(t => t.unread > 0).length, "needs-reply": threads.filter(t => t.lastMessage.senderRole === "student").length, replied: threads.filter(t => t.lastMessage.senderRole === "tpo").length };
  const visibleThreads = threads.filter(thread =>
    (chip === "all" || (chip === "unread" && thread.unread > 0) || (chip === "needs-reply" && thread.lastMessage.senderRole === "student") || (chip === "replied" && thread.lastMessage.senderRole === "tpo")) &&
    (branch === "all" || thread.branch === branch) && (batch === "all" || String(thread.batchYear) === batch));
  const searchActive = isTpo && term.length >= 2;
  const lowered = term.toLowerCase();
  const peopleWithThread = new Set(results.people.filter(person => person.hasThread).map(person => person.id));
  const matchedThreads = searchActive ? threads.filter(thread => `${thread.student.name} ${thread.student.email}`.toLowerCase().includes(lowered) || peopleWithThread.has(thread.studentId)) : [];
  const newPeople = results.people.filter(person => !person.hasThread);

  const lastMine = [...messages].reverse().find(message => message.senderRole === role && !message.deletedAt);
  const theirName = isTpo ? active?.name ?? "Student" : "Placement team";
  const subtitle = isTpo ? [active?.branch, active?.batchYear].filter(Boolean).join(" · ") || active?.email || "" : team.length ? team.map(member => member.name).join(", ") : "Your institution’s TPO team";

  const onScroll = () => {
    const element = scroller.current; if (!element) return;
    const near = element.scrollHeight - element.scrollTop - element.clientHeight < 90;
    stick.current = near; setAtBottom(near);
  };
  const jumpLatest = () => { const element = scroller.current; if (element) { stick.current = true; element.scrollTo({ top: element.scrollHeight, behavior: "smooth" }); } };

  const threadRow = (thread: Thread, note?: string) => (
    <button type="button" key={thread.studentId} className={`ic-row${selected === thread.studentId ? " selected" : ""}${thread.unread ? " unread" : ""}`} onClick={() => select({ id: thread.studentId, name: thread.student.name, email: thread.student.email, branch: thread.branch, batchYear: thread.batchYear })} aria-current={selected === thread.studentId ? "true" : undefined}>
      <ChatAvatar name={thread.student.name} size={42} />
      <span className="ic-row-main">
        <span className="ic-row-top"><strong>{thread.student.name}</strong><time>{listTime(thread.lastMessage.createdAt)}</time></span>
        <span className="ic-row-bottom"><small>{note ?? <>{thread.lastMessage.senderRole === "tpo" && <b>You: </b>}{thread.lastMessage.body}</>}</small>{thread.unread > 0 && <em aria-label={`${thread.unread} unread`}>{thread.unread}</em>}</span>
      </span>
    </button>
  );

  return (
    <section className={`institution-chat ${isTpo ? "tpo" : "embedded"}${selected ? " has-selection" : ""}${profileOpen ? " profile-open" : ""}`} aria-label="Messages">
      {isTpo && (
        <aside className="ic-rail" aria-label="Conversations">
          <header className="ic-rail-head">
            <h2>Chat{unreadTotal > 0 && <em aria-label={`${unreadTotal} unread messages`}>{unreadTotal}</em>}</h2>
            <span className="ic-head-actions">
                            <button type="button" className={`ic-filter-btn${filterCount ? " on" : ""}`} onClick={() => setFiltersOpen(open => !open)} aria-expanded={filtersOpen} aria-label="More filters" title="More filters"><SlidersHorizontal size={16} />{filterCount > 0 && <b>{filterCount}</b>}</button>
              <button type="button" className="ic-icon-btn" onClick={() => searchBox.current?.focus()} aria-label="Start a new chat" title="New chat"><MessageSquarePlus size={19} /></button>
            </span>
          </header>
          <div className="ic-search">
            <Search size={16} aria-hidden="true" />
            <input ref={searchBox} value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Escape") setQuery(""); }} placeholder="Search students or messages" aria-label="Search students or messages" />
            {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><X size={15} /></button>}
          </div>

          {!searchActive && (
            <div className="ic-filters">
              <div className="ic-chips" role="group" aria-label="Filter conversations">
                {CHIPS.map(item => <button key={item.id} type="button" aria-pressed={chip === item.id} onClick={() => setChip(item.id)}>{item.label}{item.id === "unread" && counts.unread > 0 && <b>{counts.unread}</b>}</button>)}
              </div>

            </div>
          )}
          {!searchActive && filtersOpen && (
            <div className="ic-filter-panel">
              <label>Branch<select value={branch} onChange={event => setBranch(event.target.value)}><option value="all">All branches</option>{branches.map(item => <option key={item}>{item}</option>)}</select></label>
              <label>Batch<select value={batch} onChange={event => setBatch(event.target.value)}><option value="all">All batches</option>{batches.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
              {filterCount > 0 && <button type="button" onClick={() => { setBranch("all"); setBatch("all"); }}>Clear filters</button>}
            </div>
          )}

          <div className="ic-list">
            {threadsLoading ? <div className="ic-list-state" role="status"><span className="ic-spinner" aria-hidden="true" />Loading chats…</div>
              : searchActive ? (
                <>
                  {searching && <div className="ic-list-hint" role="status">Searching…</div>}
                  {matchedThreads.length > 0 && <><h3 className="ic-group">Conversations</h3>{matchedThreads.map(thread => threadRow(thread))}</>}
                  {newPeople.length > 0 && <><h3 className="ic-group">Start a new chat</h3>{newPeople.map(person => (
                    <button type="button" key={person.id} className="ic-row" onClick={() => select({ id: person.id, name: person.name, email: person.email, branch: person.branch, batchYear: person.batchYear })}>
                      <ChatAvatar name={person.name} size={42} />
                      <span className="ic-row-main"><span className="ic-row-top"><strong>{highlight(person.name, term)}</strong></span><span className="ic-row-bottom"><small>{[person.branch, person.batchYear, person.rollNumber].filter(Boolean).join(" · ") || person.email}</small></span></span>
                      <MessageSquarePlus size={16} className="ic-row-icon" aria-hidden="true" />
                    </button>
                  ))}</>}
                  {results.messages.length > 0 && <><h3 className="ic-group">Messages</h3>{results.messages.map(hit => (
                    <button type="button" key={hit.id} className="ic-row" onClick={() => { const thread = threads.find(item => item.studentId === hit.studentId); select({ id: hit.studentId, name: hit.studentName, email: thread?.student.email ?? "", branch: thread?.branch, batchYear: thread?.batchYear }, hit.id); }}>
                      <ChatAvatar name={hit.studentName} size={42} />
                      <span className="ic-row-main"><span className="ic-row-top"><strong>{hit.studentName}</strong><time>{listTime(hit.createdAt)}</time></span><span className="ic-row-bottom"><small>{hit.senderRole === "tpo" && <b>You: </b>}{highlight(hit.body, term)}</small></span></span>
                    </button>
                  ))}</>}
                  {!searching && !matchedThreads.length && !newPeople.length && !results.messages.length && <div className="ic-list-state"><Search size={26} aria-hidden="true" /><strong>No results for “{term}”</strong><span>Try a name, email, roll number, branch or a word from a message.</span></div>}
                </>
              ) : visibleThreads.length ? visibleThreads.map(thread => threadRow(thread))
              : <div className="ic-list-state"><MessageCircle size={28} aria-hidden="true" /><strong>{threads.length ? "No chats match" : "No conversations yet"}</strong><span>{threads.length ? "Try a different filter." : "Search for a student above to start your first chat."}</span>{threads.length > 0 && (chip !== "all" || filterCount > 0) && <button type="button" onClick={() => { setChip("all"); setBranch("all"); setBatch("all"); }}>Clear filters</button>}</div>}
          </div>
        </aside>
      )}

      <div className="ic-convo">
        {!selected ? (
          <div className="ic-placeholder">
            <span aria-hidden="true"><MessageCircle size={34} /></span>
            <h3>{threadsLoading ? "Loading…" : "Select a chat to start messaging"}</h3>
            <p>{error || "Pick a conversation, or search for any student to start a new one."}</p>
          </div>
        ) : (
          <>
            <header className="ic-head">
              {isTpo && <button type="button" className="ic-icon-btn ic-back" onClick={() => { selectedRef.current = null; setSelected(null); }} aria-label="Back to chats"><ArrowLeft size={19} /></button>}
              {isTpo ? (
                <button type="button" className="ic-head-who" onClick={toggleProfile} aria-label={`Open ${theirName}’s profile`}>
                  <ChatAvatar name={theirName} size={40} /><span><strong>{theirName}</strong><small>{subtitle}</small></span>
                </button>
              ) : (
                <div className="ic-head-who static"><ChatAvatar name="Placement" size={40} label="P" /><span><strong>{theirName}</strong><small>{subtitle}</small></span></div>
              )}
              <span className="ic-private"><ShieldCheck size={14} aria-hidden="true" /> Institution only</span>
              {isTpo && <button type="button" className={`ic-icon-btn${profileOpen ? " on" : ""}`} onClick={toggleProfile} aria-pressed={profileOpen} aria-label="Toggle student profile" title="Student profile">{profileOpen ? <PanelRight size={19} /> : <UserRound size={19} />}</button>}
            </header>

            <div className="ic-messages" ref={scroller} onScroll={onScroll} role="log" aria-live="polite" aria-relevant="additions">
              {hasMore && <button type="button" className="ic-older" onClick={() => void loadMessages(selected, "older", messages[0]?.id)}><ArrowDown size={14} className="flip" aria-hidden="true" /> Load earlier messages</button>}
              {conversationLoading && !messages.length && <div className="ic-list-state" role="status"><span className="ic-spinner" aria-hidden="true" />Loading messages…</div>}
              {!conversationLoading && !messages.length && (
                <div className="ic-welcome"><span aria-hidden="true"><MessageCircle size={26} /></span><h3>{isTpo ? `Start a chat with ${theirName.split(" ")[0]}` : "Say hello to your placement team"}</h3><p>{isTpo ? "Send a note about drives, deadlines, or what to prepare next." : "Ask about opportunities, applications, or what to prepare next."}</p></div>
              )}
              {messages.map((message, index) => {
                const previous = messages[index - 1];
                const mine = message.senderRole === role;
                const newDay = !previous || !sameDay(previous.createdAt, message.createdAt);
                const startsGroup = newDay || previous.senderRole !== message.senderRole || new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() > 300_000;
                const isEditing = editing?.id === message.id;
                return (
                  <Fragment key={message.id}>
                    {newDay && <div className="ic-day"><span>{dayLabel(message.createdAt)}</span></div>}
                    {unreadFrom === message.id && <div className="ic-new"><span>New messages</span></div>}
                    <div id={`ic-msg-${message.id}`} className={`ic-msg ${mine ? "mine" : "theirs"}${startsGroup ? " first" : ""}${focusId === message.id ? " flash" : ""}`}>
                      {!mine && <span className="ic-msg-av">{startsGroup && <ChatAvatar name={theirName} size={32} label={isTpo ? undefined : "P"} />}</span>}
                      <div className="ic-msg-col">
                        {startsGroup && <div className="ic-msg-meta">{!mine && <b>{theirName}</b>}<time>{clockTime(message.createdAt)}</time></div>}
                        {isEditing ? (
                          <div className="ic-edit">
                            <textarea value={editing.text} maxLength={2000} rows={2} aria-label="Edit message" onChange={event => setEditing({ id: message.id, text: event.target.value })} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void saveEdit(); } if (event.key === "Escape") setEditing(null); }} />
                            <div><button type="button" onClick={() => setEditing(null)}>Cancel</button><button type="button" className="primary" onClick={() => void saveEdit()} disabled={!editing.text.trim()}>Save</button></div>
                          </div>
                        ) : message.deletedAt ? <div className="ic-bubble deleted">This message was deleted</div> : (
                          <div className="ic-bubble-wrap">
                            <div className="ic-bubble"><p>{message.body}</p>{message.editedAt && <small>Edited</small>}</div>
                            {mine && (deleting === message.id ? (
                              <div className="ic-confirm" role="alert">Delete?<button type="button" onClick={() => void remove(message.id)}>Delete</button><button type="button" onClick={() => setDeleting(null)}>Keep</button></div>
                            ) : (
                              <div className="ic-actions"><button type="button" onClick={() => setEditing({ id: message.id, text: message.body })} aria-label="Edit message" title="Edit"><Pencil size={14} /></button><button type="button" onClick={() => setDeleting(message.id)} aria-label="Delete message" title="Delete"><Trash2 size={14} /></button></div>
                            ))}
                          </div>
                        )}
                        {mine && lastMine?.id === message.id && !isEditing && <span className="ic-receipt">{message.readAt ? <><CheckCheck size={13} aria-hidden="true" /> Seen</> : <><Check size={13} aria-hidden="true" /> {message.deliveredAt ? "Delivered" : "Sent"}</>}</span>}
                      </div>
                    </div>
                  </Fragment>
                );
              })}
            </div>
            {!atBottom && messages.length > 0 && <button type="button" className="ic-jump" onClick={jumpLatest}><ArrowDown size={15} aria-hidden="true" /> Latest</button>}

            <div className="ic-composer-wrap">
              {error && <p className="ic-error" role="alert">{error}<button type="button" onClick={() => setError("")} aria-label="Dismiss">Dismiss</button></p>}
              {!isTpo && !team.length && !threadsLoading && <p className="ic-error">Your placement team is not available yet.</p>}
              <form className="ic-composer" onSubmit={event => void send(event)}>
                <textarea value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} maxLength={2000} rows={1} placeholder={isTpo ? `Message ${theirName.split(" ")[0]}…` : "Write a message…"} aria-label="Write a message" />
                <button type="submit" disabled={!draft.trim() || sending || (!isTpo && !team.length)} aria-label="Send message"><Send size={18} /></button>
              </form>
              <span className="ic-hint">Enter to send · Shift + Enter for a new line{draft.length > 1500 && ` · ${draft.length}/2000`}</span>
            </div>
          </>
        )}
      </div>

      {isTpo && profileOpen && selected && (
        <>
          <div className="ic-profile-scrim" onClick={() => setProfileOpen(false)} aria-hidden="true" />
          <ProfilePanel profile={profile} loading={profileLoading} error={profileError} onClose={() => setProfileOpen(false)} onOpenStudents={onOpenStudents} onCopy={text => void copy(text)} />
        </>
      )}
      {notice && <div className="ic-toast" role="status">{notice}</div>}
    </section>
  );
}
