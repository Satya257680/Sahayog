import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, MessageCircle, Send, Bookmark, ListChecks, CheckCircle2, HandHeart, LifeBuoy, ArrowLeft, Pencil, Eye, Trash2, RotateCcw, Link2 } from 'lucide-react';
import { api, apiUrl } from '../api';
import { useAuth } from '../auth';
import { category, dateLabel, timeLabel, listingImage, onImageError, Field, ListingCard, Loading, Empty, ErrorState } from '../shared';
import { PasswordInput, PasswordChecklist } from './AuthPages';
import { passwordIsValid } from '../password';

function PageHeader({ title, subtitle, action }) {
  return <div className="page-head"><div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{action}</div>;
}

// ───────────────────────── Home ─────────────────────────

export function DashboardHome() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [convos, setConvos] = useState([]);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setError('');
    Promise.all([api('/dashboard/summary'), api('/conversations')])
      .then(([s, c]) => { setData(s); setConvos((c.conversations || []).slice(0, 4)); })
      .catch(e => setError(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);
  const firstName = user?.name?.split(' ')[0] || 'there';
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <Loading label="Loading your dashboard…" />;
  const s = data.summary;
  const tiles = [
    { label: 'Active listings', value: s.activeListings, to: '/dashboard/listings', icon: ListChecks },
    { label: 'Completed', value: s.completedListings, to: '/dashboard/listings?status=completed', icon: CheckCircle2 },
    { label: 'Saved items', value: s.savedItems, to: '/dashboard/saved', icon: Bookmark },
    { label: 'Conversations', value: s.conversations, to: '/dashboard/messages', icon: MessageCircle }
  ];
  return <>
    <PageHeader title={`Hello, ${firstName}`} subtitle="Here's what's happening with your sharing." />
    <div className="tile-row">{tiles.map(t => <Link to={t.to} className="tile" key={t.label}><t.icon size={18} aria-hidden="true" /><span className="tile-value">{t.value}</span><span className="tile-label">{t.label}</span></Link>)}</div>
    <div className="dash-grid">
      <section className="card">
        <div className="card-head"><h2>Your recent listings</h2><Link to="/dashboard/listings" className="text-link">View all</Link></div>
        {data.recent.length ? <ul className="mini-list">{data.recent.map(l => <li key={l.id}>
          <span className="mini-emoji" aria-hidden="true">{category(l.category).emoji}</span>
          <Link to={`/item/${l.id}`}><strong>{l.title}</strong><small>{l.type === 'need' ? 'Request' : 'Giving'} · {dateLabel(l.createdAt)}</small></Link>
          <span className={`status-pill ${l.status}`}>{l.status}</span>
        </li>)}</ul> : <Empty title="Nothing posted yet" message="Share something you don't need, or ask for something you do." action={<Link className="btn btn-primary btn-small" to="/post/give">Post your first listing</Link>} />}
      </section>
      <section className="card">
        <div className="card-head"><h2>Latest messages</h2><Link to="/dashboard/messages" className="text-link">Open inbox</Link></div>
        {convos.length ? <ul className="mini-list">{convos.map(c => <li key={c.id}>
          <span className="avatar small">{(c.otherUser || '?').charAt(0).toUpperCase()}</span>
          <Link to={`/dashboard/messages?conversation=${c.id}`}><strong>{c.otherUser}</strong><small>{c.lastMessage ? c.lastMessage : `About “${c.listingTitle}”`}</small></Link>
          <small className="mini-time">{timeLabel(c.activityAt)}</small>
        </li>)}</ul> : <Empty icon="💬" title="No conversations yet" message="When you message someone about a listing, or they message you, it shows up here." />}
      </section>
    </div>
    <section className="card quick-card">
      <div><h2>Share something today</h2><p>{s.communityListings} listing{s.communityListings === 1 ? ' is' : 's are'} active in the community right now.</p></div>
      <div className="quick-actions"><Link to="/post/give" className="btn btn-primary"><HandHeart size={16} /> Give an item</Link><Link to="/post/need" className="btn btn-soft"><LifeBuoy size={16} /> Ask for help</Link><Link to="/categories" className="btn btn-outline">Explore listings</Link></div>
    </section>
  </>;
}

// ───────────────────────── My listings ─────────────────────────

export function MyListings() {
  const { notify } = useAuth();
  const [params, setParams] = useSearchParams();
  const status = ['active', 'completed'].includes(params.get('status')) ? params.get('status') : 'all';
  const [listings, setListings] = useState(null);
  const [error, setError] = useState('');
  const [confirmId, setConfirmId] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const refresh = useCallback(async () => {
    setError('');
    try { const d = await api(`/listings/mine${status === 'all' ? '' : `?status=${status}`}`); setListings(d.listings || []); }
    catch (e) { setError(e.message); }
  }, [status]);
  useEffect(() => { setListings(null); refresh(); }, [refresh]);

  async function setStatus(item, next) {
    setBusyId(item.id);
    try {
      const d = await api(`/listings/${item.id}/status`, { method: 'PATCH', body: { status: next } });
      notify(next === 'completed' ? 'Marked as completed.' : next === 'active' ? 'Listing reopened.' : d.message, 'success');
      setConfirmId(null);
      await refresh();
    } catch (e) { notify(e.message, 'error'); } finally { setBusyId(null); }
  }

  return <>
    <PageHeader title="My listings" subtitle="Manage the items you're giving and the help you've asked for." action={<Link className="btn btn-primary btn-small" to="/post/give"><Plus size={16} /> New listing</Link>} />
    <div className="tabs" role="tablist" aria-label="Filter by status">
      {[['all', 'All'], ['active', 'Active'], ['completed', 'Completed']].map(([v, l]) =>
        <button key={v} role="tab" aria-selected={status === v} className={status === v ? 'active' : ''} onClick={() => setParams(v === 'all' ? {} : { status: v })}>{l}</button>)}
    </div>
    <section className="card flush">
      {error ? <ErrorState message={error} onRetry={refresh} />
        : !listings ? <Loading label="Loading your listings…" />
        : !listings.length ? <Empty title={status === 'all' ? 'Your first act of kindness starts here' : `No ${status} listings`} message={status === 'all' ? "You haven't posted anything yet." : 'Try another filter.'} action={status === 'all' && <Link className="btn btn-primary" to="/post/give">Post an item</Link>} />
        : <div className="table-list">{listings.map(item => <div className="list-row" key={item.id}>
          <img src={listingImage(item)} alt="" onError={onImageError} />
          <div className="list-main">
            <h3><Link to={`/item/${item.id}`}>{item.title}</Link></h3>
            <p>{category(item.category).emoji} {category(item.category).name} · {item.type === 'need' ? 'Request' : 'Giving'} · {item.location}</p>
            <p>Posted {dateLabel(item.createdAt)} · {item.conversationCount} conversation{item.conversationCount === 1 ? '' : 's'}</p>
            <span className={`status-pill ${item.status}`}>{item.status}</span>
          </div>
          <div className="row-actions">
            {confirmId === item.id
              ? <><span className="confirm-text">Remove this listing?</span><button className="btn btn-danger btn-small" disabled={busyId === item.id} onClick={() => setStatus(item, 'removed')}>Yes, remove</button><button className="btn btn-outline btn-small" onClick={() => setConfirmId(null)}>Keep</button></>
              : <>
                <Link className="btn btn-outline btn-small" to={`/item/${item.id}`}><Eye size={14} /> View</Link>
                <Link className="btn btn-outline btn-small" to={`/dashboard/listings/${item.id}/edit`}><Pencil size={14} /> Edit</Link>
                <button className="btn btn-soft btn-small" disabled={busyId === item.id} onClick={() => setStatus(item, item.status === 'completed' ? 'active' : 'completed')}>{item.status === 'completed' ? <><RotateCcw size={14} /> Reopen</> : <><CheckCircle2 size={14} /> Mark completed</>}</button>
                <button className="btn btn-ghost btn-small" onClick={() => setConfirmId(item.id)} aria-label={`Remove ${item.title}`}><Trash2 size={14} /></button>
              </>}
          </div>
        </div>)}</div>}
    </section>
  </>;
}

// ───────────────────────── Saved ─────────────────────────

export function SavedPage() {
  const [listings, setListings] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { setError(''); api('/saved').then(d => setListings(d.listings || [])).catch(e => setError(e.message)); }, []);
  useEffect(() => { load(); }, [load]);
  return <>
    <PageHeader title="Saved items" subtitle="Listings you bookmarked for later." />
    {error ? <ErrorState message={error} onRetry={load} />
      : !listings ? <Loading label="Loading saved items…" />
      : listings.length ? <div className="listing-grid">{listings.map(i => <ListingCard key={i.id} item={i} onUnsave={id => setListings(ls => ls.filter(l => l.id !== id))} />)}</div>
      : <section className="card"><Empty icon="🔖" title="No saved items yet" message="Tap the heart on any listing to keep it here." action={<Link className="btn btn-primary" to="/categories">Explore listings</Link>} /></section>}
  </>;
}

// ───────────────────────── Messages ─────────────────────────

export function MessagesPage() {
  const { user, notify } = useAuth();
  const [params, setParams] = useSearchParams();
  const active = params.get('conversation') || '';
  const [conversations, setConversations] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const threadEnd = useRef(null);
  const lastCount = useRef(0);

  const loadConversations = useCallback(async () => {
    try { const d = await api('/conversations'); setConversations(d.conversations || []); } catch (e) { setConversations(c => c || []); notify(e.message, 'error'); }
  }, [notify]);
  const loadMessages = useCallback(async (id, quiet = false) => {
    if (!quiet) setLoadingThread(true);
    try { const d = await api(`/conversations/${id}/messages`); setMessages(d.messages || []); }
    catch (e) { if (!quiet) { notify(e.message, 'error'); setMessages([]); } }
    finally { if (!quiet) setLoadingThread(false); }
  }, [notify]);

  useEffect(() => { loadConversations(); }, [loadConversations]);
  useEffect(() => { lastCount.current = 0; if (active) loadMessages(active); else setMessages([]); }, [active, loadMessages]);
  // Light polling so new replies appear without a reload.
  useEffect(() => {
    const t = setInterval(() => { if (document.hidden) return; loadConversations(); if (active) loadMessages(active, true); }, 8000);
    return () => clearInterval(t);
  }, [active, loadConversations, loadMessages]);
  useEffect(() => {
    if (messages.length !== lastCount.current) { threadEnd.current?.scrollIntoView({ block: 'end' }); lastCount.current = messages.length; }
  }, [messages]);

  async function send(e) {
    e.preventDefault();
    const text = body.trim();
    if (!text || !active) return;
    setSending(true);
    try { await api(`/conversations/${active}/messages`, { method: 'POST', body: { body: text } }); setBody(''); await loadMessages(active, true); loadConversations(); }
    catch (err) { notify(err.message, 'error'); } finally { setSending(false); }
  }

  const current = conversations?.find(c => String(c.id) === active);
  return <>
    <PageHeader title="Messages" subtitle="Connect respectfully and arrange a safe handover." />
    <div className={`chat-layout card flush ${active ? 'has-active' : ''}`}>
      <aside className="chat-list" aria-label="Conversations">
        {!conversations ? <Loading /> : conversations.length ? conversations.map(c =>
          <button key={c.id} className={`chat-item ${String(c.id) === active ? 'active' : ''}`} onClick={() => setParams({ conversation: String(c.id) })}>
            <span className="avatar small">{(c.otherUser || '?').charAt(0).toUpperCase()}</span>
            <span className="chat-item-main"><strong>{c.otherUser}</strong><small>{c.listingTitle}</small>{c.lastMessage && <em>{Number(c.lastSenderId) === Number(user.id) ? 'You: ' : ''}{c.lastMessage}</em>}</span>
            <small className="mini-time">{timeLabel(c.activityAt)}</small>
          </button>)
          : <Empty icon="💬" title="No conversations yet" message="Open a listing and choose “Message the donor” or “Offer to help” to start one." />}
      </aside>
      <section className="chat-thread">
        {active ? <>
          <div className="chat-head">
            <button className="btn btn-ghost btn-small chat-back" onClick={() => setParams({})} aria-label="Back to conversations"><ArrowLeft size={16} /></button>
            <div><strong>{current?.otherUser || 'Conversation'}</strong>{current && <Link to={`/item/${current.listingId}`} className="small-link">{current.listingTitle}</Link>}</div>
          </div>
          <div className="chat-messages" aria-live="polite">
            {loadingThread ? <Loading /> : messages.length ? messages.map(m => <div key={m.id} className={`bubble ${Number(m.senderId) === Number(user.id) ? 'mine' : ''}`}><p>{m.body}</p><small>{timeLabel(m.createdAt)}</small></div>)
              : <p className="chat-empty">Say hello and agree on a safe place and time to meet.</p>}
            <div ref={threadEnd} />
          </div>
          <form className="chat-compose" onSubmit={send}>
            <input value={body} onChange={e => setBody(e.target.value)} placeholder="Type a message…" maxLength={3000} aria-label="Message" />
            <button className="btn btn-primary" disabled={sending || !body.trim()} aria-label="Send message"><Send size={16} /></button>
          </form>
        </> : <div className="empty"><MessageCircle size={30} aria-hidden="true" /><p>Select a conversation to read and reply.</p></div>}
      </section>
    </div>
  </>;
}

// ───────────────────────── Profile & security ─────────────────────────

const PROVIDER_LABEL = { google: 'Google', facebook: 'Facebook' };
const LINK_ERRORS = {
  identity_in_use: 'That account is already connected to a different Sahayog account.',
  not_configured: 'That sign-in option is not set up on this site yet.',
  cancelled: 'Connection was cancelled.',
  invalid_state: 'The connection link expired. Please try again.',
  provider_error: 'We could not confirm your account with the provider. Please try again.'
};

export function ProfilePage() {
  const { user, setUser, notify, refresh } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [form, setForm] = useState({ name: user.name || '', phone: user.phone || '', city: user.city || '', state: user.state || '' });
  const [saving, setSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [pwErrors, setPwErrors] = useState({});
  const [pwBusy, setPwBusy] = useState(false);
  const [providers, setProviders] = useState(null);

  useEffect(() => { api('/auth/providers').then(setProviders).catch(() => setProviders({})); }, []);
  useEffect(() => {
    const linked = params.get('linked'), err = params.get('oauthError');
    if (linked) { notify(`${PROVIDER_LABEL[linked] || 'Account'} connected.`, 'success'); refresh(); }
    if (err) notify(LINK_ERRORS[err] || 'Could not connect that account.', 'error');
    if (linked || err) setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveProfile(e) {
    e.preventDefault();
    setSaving(true); setProfileError('');
    try { const d = await api('/auth/me', { method: 'PATCH', body: form }); setUser(u => ({ ...u, ...d.user })); notify('Profile saved.', 'success'); }
    catch (err) { setProfileError(err.message); } finally { setSaving(false); }
  }

  async function changePassword(e) {
    e.preventDefault();
    const er = {};
    if (user.hasPassword && !pw.currentPassword) er.currentPassword = 'Enter your current password.';
    if (!passwordIsValid(pw.newPassword)) er.newPassword = 'Your new password does not meet all the rules yet.';
    if (pw.newPassword !== pw.confirm) er.confirm = 'Passwords do not match.';
    setPwErrors(er);
    if (Object.keys(er).length) return;
    setPwBusy(true);
    try {
      const d = await api('/auth/password/change', { method: 'POST', body: { currentPassword: pw.currentPassword, newPassword: pw.newPassword } });
      setUser(u => ({ ...u, ...d.user }));
      setPw({ currentPassword: '', newPassword: '', confirm: '' });
      notify(d.message, 'success');
    } catch (err) {
      if (err.status === 401) navigate('/login');
      else if (err.data?.field) setPwErrors({ [err.data.field]: err.message });
      else notify(err.message, 'error');
    } finally { setPwBusy(false); }
  }

  const linked = new Set(user.providers || []);
  return <>
    <PageHeader title="Profile & security" subtitle="Your details are never shown publicly except your name." />
    <div className="settings-grid">
      <section className="card">
        <h2>Profile</h2>
        {profileError && <div className="form-alert" role="alert">{profileError}</div>}
        <form onSubmit={saveProfile}>
          <Field label="Full name"><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required minLength={2} maxLength={100} autoComplete="name" /></Field>
          <Field label="Email address" hint="Your verified sign-in email. It can't be changed here."><input value={user.email} readOnly disabled /></Field>
          <Field label="Phone (optional)"><input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} maxLength={30} autoComplete="tel" placeholder="+91 98765 43210" /></Field>
          <div className="form-grid tight">
            <Field label="City"><input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} maxLength={100} autoComplete="address-level2" /></Field>
            <Field label="State"><input value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} maxLength={100} autoComplete="address-level1" /></Field>
          </div>
          <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button>
        </form>
      </section>

      <section className="card">
        <h2>{user.hasPassword ? 'Change password' : 'Set a password'}</h2>
        <p className="card-sub">{user.hasPassword ? 'Changing your password signs you out on every other device.' : 'You signed up with a social account. Add a password to also log in with your email.'}</p>
        <form onSubmit={changePassword} noValidate>
          {user.hasPassword && <Field label="Current password" error={pwErrors.currentPassword}><PasswordInput name="currentPassword" value={pw.currentPassword} onChange={e => setPw(p => ({ ...p, currentPassword: e.target.value }))} autoComplete="current-password" /></Field>}
          <Field label="New password" error={pwErrors.newPassword}><PasswordInput name="newPassword" value={pw.newPassword} onChange={e => setPw(p => ({ ...p, newPassword: e.target.value }))} autoComplete="new-password" placeholder="15–30 characters" /></Field>
          <Field label="Confirm new password" error={pwErrors.confirm}><PasswordInput name="confirm" value={pw.confirm} onChange={e => setPw(p => ({ ...p, confirm: e.target.value }))} autoComplete="new-password" /></Field>
          {pw.newPassword && <PasswordChecklist password={pw.newPassword} confirm={pw.confirm} showConfirm />}
          <button className="btn btn-primary" disabled={pwBusy}>{pwBusy ? 'Saving…' : user.hasPassword ? 'Update password' : 'Set password'}</button>
        </form>
      </section>

      <section className="card">
        <h2>Connected accounts</h2>
        <p className="card-sub">Log in faster with Google or Facebook. Connecting proves the account is yours.</p>
        <ul className="connect-list">{['google', 'facebook'].map(p => <li key={p}>
          <span className={`brand-dot ${p}`} aria-hidden="true">{p === 'google' ? 'G' : 'f'}</span>
          <span className="connect-name">{PROVIDER_LABEL[p]}</span>
          {linked.has(p) ? <span className="status-pill active">Connected</span>
            : providers?.[p] ? <a className="btn btn-outline btn-small" href={apiUrl(`/auth/oauth/${p}?link=1`)}><Link2 size={14} /> Connect</a>
            : <span className="muted-note">Not available yet</span>}
        </li>)}</ul>
      </section>
    </div>
  </>;
}
