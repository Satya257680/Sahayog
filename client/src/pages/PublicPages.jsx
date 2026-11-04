import React, { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import { HeartHandshake, Search, Menu, X, MapPin, Heart, ArrowRight, MessageCircle, Package, Users, Sparkles, LogOut, UserRound, HandHeart, ShieldCheck, Pencil } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { CATS, category, dateLabel, listingImage, onImageError, useDebounced, Field, CategoryGrid, ListingCard, Steps, Loading, Empty, ErrorState } from '../shared';

// ───────────────────────── Public layout (signed-out) ─────────────────────────

export function PublicLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);
  return <div className="app-shell">
    <PublicHeader menuOpen={menuOpen} setMenuOpen={setMenuOpen} />
    <main className="container" id="main"><Outlet /></main>
    <Footer />
  </div>;
}

function PublicHeader({ menuOpen, setMenuOpen }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const nav = [['/', 'Home'], ['/give', 'Give'], ['/need', 'Need Help'], ['/categories', 'Explore'], ['/how-it-works', 'How It Works']];
  return <header className="topbar">
    <Link to="/" className="brand"><span className="brand-mark"><HeartHandshake size={30} /></span><span><strong>Sahayog</strong><small>Give · Receive · Be Kind</small></span></Link>
    <button className="mobile-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} aria-controls="public-nav">{menuOpen ? <X /> : <Menu />}</button>
    <nav id="public-nav" className={`nav ${menuOpen ? 'open' : ''}`} aria-label="Main">
      {nav.map(([to, label]) => <NavLink key={to} to={to} end={to === '/'}>{label}</NavLink>)}
      {!user && <NavLink to="/login" className="mobile-only">Log in</NavLink>}
    </nav>
    <div className="top-actions">
      {user
        ? <><Link className="btn btn-outline btn-small desktop-only" to="/dashboard"><UserRound size={15} /> Dashboard</Link><button className="btn btn-primary btn-small" onClick={async () => { await logout(); navigate('/'); }}><LogOut size={14} /> Log out</button></>
        : <><Link className="btn btn-outline btn-small desktop-only" to="/login">Log in</Link><Link className="btn btn-primary btn-small" to="/signup">Sign up free</Link></>}
    </div>
  </header>;
}

function Footer() {
  return <footer className="footer"><div className="footer-inner">
    <div><Link to="/" className="footer-brand"><HeartHandshake /> Sahayog</Link><p>Give · Receive · Be Kind</p><span>Small acts of kindness create stronger communities.</span></div>
    <div><strong>Explore</strong><p><Link to="/give">Give something</Link> · <Link to="/need">Need help</Link> · <Link to="/how-it-works">How it works</Link> · <Link to="/about">About</Link></p></div>
    <div><strong>Community first</strong><p>Free to use · Be respectful · Keep exchanges safe</p></div>
  </div></footer>;
}

// ───────────────────────── Landing ─────────────────────────

export function Landing() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [listings, setListings] = useState([]);
  const [state, setState] = useState('loading');
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setState('loading');
    api('/listings?limit=12').then(d => { setListings(d.listings || []); setState('ready'); }).catch(e => { setError(e.message); setState('error'); });
  }, []);
  useEffect(() => { load(); }, [load]);
  const visible = listings.filter(i => filter === 'all' || i.type === filter).slice(0, 8);
  const giveCount = listings.filter(l => l.type === 'give').length;
  const needCount = listings.filter(l => l.type === 'need').length;

  return <>
    <section className="hero">
      <div className="hero-art" aria-hidden="true"><div className="hero-orb orb-one" /><div className="hero-orb orb-two" /><div className="hero-people">🫶 💗 🤝</div><div className="hero-note note-one">Kindness looks good on you ✨</div><div className="hero-note note-two">100% free to share</div></div>
      <div className="hero-copy">
        <span className="eyebrow"><Sparkles size={14} /> A kinder community, together</span>
        <h1>Give a little.<br /><span className="gradient-text">Change a lot.</span></h1>
        <p>A place where people help each other — freely.<br />Give what you can. Get what you need.</p>
        <form className="searchbar" role="search" onSubmit={e => { e.preventDefault(); navigate(`/categories${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`); }}>
          <Search size={21} aria-hidden="true" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search books, clothes, food..." aria-label="Search listings" /><button className="btn btn-primary" type="submit">Search</button>
        </form>
        <div className="hero-actions">
          <Link className="btn btn-primary" to="/give"><HandHeart size={17} /> Give something</Link>
          <Link className="btn btn-soft" to="/need">I need help</Link>
          <Link className="btn btn-outline" to="/categories">Explore listings</Link>
        </div>
      </div>
    </section>
    <section className="stats" aria-label="Community at a glance">
      <Stat icon={<Package />} value={state === 'ready' ? String(listings.length) : '—'} label="Active listings" />
      <Stat icon={<HandHeart />} value={state === 'ready' ? String(giveCount) : '—'} label="Items offered free" />
      <Stat icon={<Users />} value={state === 'ready' ? String(needCount) : '—'} label="People asking for help" />
      <Stat icon={<ShieldCheck />} value="Verified" label="Every member confirms their email" />
    </section>
    <section className="section">
      <div className="section-head"><div><h2>Explore categories</h2><p>Find a way to give or get help.</p></div><Link className="text-link" to="/categories">View all <ArrowRight size={15} /></Link></div>
      <CategoryGrid onChoose={id => navigate(`/categories?category=${id}`)} />
    </section>
    <section className="section">
      <div className="section-head"><div><h2>📍 Recently shared</h2><p>Free items and requests from the community.</p></div>
        <div className="pills" role="group" aria-label="Filter listings">{[['all', 'All'], ['give', 'Give'], ['need', 'Need']].map(([v, l]) => <button key={v} className={`pill ${filter === v ? 'active' : ''}`} aria-pressed={filter === v} onClick={() => setFilter(v)}>{l}</button>)}</div>
      </div>
      {state === 'loading' ? <Loading label="Loading community listings…" />
        : state === 'error' ? <ErrorState message={error} onRetry={load} />
        : visible.length ? <div className="listing-grid">{visible.map(item => <ListingCard key={item.id} item={item} />)}</div>
        : <Empty title="Nothing shared here yet" message="Be the first to share something with your community." action={<Link to="/post/give" className="btn btn-primary">Post an item</Link>} />}
    </section>
    <section className="banner"><div><h2>A stronger community starts with you 💗</h2><p>One small act of kindness can make someone's day.</p></div><div className="banner-actions"><Link className="btn btn-primary" to="/signup">Create a free account</Link><Link className="btn btn-soft" to="/login">Log in</Link></div></section>
    <section className="section"><div className="section-head"><div><h2>How Sahayog works</h2><p>Helping each other is simple, fast and free.</p></div><Link className="text-link" to="/how-it-works">Learn more <ArrowRight size={15} /></Link></div><Steps /></section>
  </>;
}
function Stat({ icon, value, label }) { return <div className="stat"><span className="stat-icon" aria-hidden="true">{icon}</span><div><strong>{value}</strong><span>{label}</span></div></div>; }

// ───────────────────────── Give / Need ─────────────────────────

export function GiveNeed({ type }) {
  const navigate = useNavigate();
  const isGive = type === 'give';
  return <>
    <div className="breadcrumbs"><Link to="/">Home</Link> › {isGive ? 'Give' : 'Need Help'}</div>
    <h1 className="page-title">{isGive ? 'Give something' : 'Ask for help'}</h1>
    <p className="subtext">{isGive ? 'Pick a category to share something useful with someone who needs it.' : 'Pick a category and tell the community what you need. It is free.'}</p>
    <CategoryGrid onChoose={id => navigate(`/post/${type}?category=${id}`)} />
    <div className="notice"><Heart size={16} /> {isGive ? 'All donations are free. Please share items in safe, usable condition.' : 'Be clear about what you need. Please do not post sensitive personal information.'}</div>
    <div className="banner"><div><h2>{isGive ? 'Ready to share something?' : 'Tell the community what would help'}</h2><p>{isGive ? 'Add the details and help your item find a new home.' : 'Create a request and connect with people who can help.'}</p></div><Link className="btn btn-primary" to={`/post/${type}`}>{isGive ? 'Post an item' : 'Post a request'} <ArrowRight size={16} /></Link></div>
  </>;
}

// ───────────────────────── Post / edit listing ─────────────────────────

const EMPTY_LISTING = { title: '', category: 'books', description: '', conditionLabel: 'Good', quantity: '1', location: '', imageUrl: '' };

export function ListingForm({ mode = 'create' }) {
  const params = useParams();
  const [search] = useSearchParams();
  const { notify } = useAuth();
  const navigate = useNavigate();
  const editing = mode === 'edit';
  const [type, setType] = useState(params.type === 'need' ? 'need' : 'give');
  const [form, setForm] = useState({ ...EMPTY_LISTING, category: CATS.some(c => c.id === search.get('category')) ? search.get('category') : 'books' });
  const [loading, setLoading] = useState(editing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (!editing) setType(params.type === 'need' ? 'need' : 'give'); }, [params.type, editing]);
  useEffect(() => {
    if (!editing) return;
    api(`/listings/${params.id}`).then(d => {
      const l = d.listing;
      setType(l.type);
      setForm({ title: l.title, category: l.category, description: l.description, conditionLabel: l.conditionLabel || 'Good', quantity: l.quantity || '1', location: l.location, imageUrl: l.imageUrl || '' });
    }).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, [editing, params.id]);

  const isGive = type === 'give';
  function change(e) { setForm(f => ({ ...f, [e.target.name]: e.target.value })); }
  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      if (editing) {
        await api(`/listings/${params.id}`, { method: 'PUT', body: { ...form, type } });
        notify('Listing updated.', 'success');
        navigate('/dashboard/listings');
      } else {
        const result = await api('/listings', { method: 'POST', body: { ...form, type } });
        notify('Listing published.', 'success');
        navigate(`/item/${result.id}`);
      }
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  if (loading) return <Loading />;

  return <>
    <div className="breadcrumbs">{editing ? <><Link to="/dashboard/listings">My listings</Link> › Edit</> : <><Link to={isGive ? '/give' : '/need'}>{isGive ? 'Give' : 'Need Help'}</Link> › Post</>}</div>
    <h1 className="page-title">{editing ? 'Edit listing' : isGive ? 'Post an item to give' : 'Post a request for help'}</h1>
    <p className="subtext">{isGive ? 'Share the details so people who need it can reach you.' : 'Tell the community what you need.'}</p>
    {error && <div className="form-alert" role="alert">{error}</div>}
    <form className="panel form-panel" onSubmit={submit}>
      <div className="type-switch" role="radiogroup" aria-label="Listing type">
        {[['give', 'I want to give'], ['need', 'I need help']].map(([v, l]) => <button type="button" key={v} role="radio" aria-checked={type === v} className={type === v ? 'active' : ''} onClick={() => setType(v)}>{l}</button>)}
      </div>
      <div className="form-grid">
        <div>
          <Field label="Title *"><input name="title" value={form.title} onChange={change} minLength="3" maxLength="120" required placeholder={isGive ? 'e.g. Class 10 Science Books' : 'e.g. Need school books for Class 10'} /></Field>
          <Field label="Category *"><select name="category" value={form.category} onChange={change}>{CATS.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}</select></Field>
          <Field label="Description *" hint="At least 10 characters."><textarea name="description" value={form.description} onChange={change} minLength="10" maxLength="5000" required placeholder={isGive ? 'Describe the item, condition, size, etc.' : 'Describe what you need, quantity and useful details.'} /></Field>
          <div className="form-grid tight">
            <Field label={isGive ? 'Condition' : 'Condition preference'}><select name="conditionLabel" value={form.conditionLabel} onChange={change}>{['Good', 'New', 'Usable', 'Any', 'Urgent'].map(v => <option key={v}>{v}</option>)}</select></Field>
            <Field label="Quantity"><input name="quantity" value={form.quantity} onChange={change} maxLength="80" /></Field>
          </div>
        </div>
        <div>
          <Field label="Image URL (optional)" hint="Paste a public https:// link to a photo."><input type="url" name="imageUrl" value={form.imageUrl} onChange={change} placeholder="https://example.com/photo.jpg" /></Field>
          {form.imageUrl && /^https?:\/\//i.test(form.imageUrl) && <img className="form-preview" src={form.imageUrl} alt="Preview of the listing photo" onError={e => { e.currentTarget.style.display = 'none'; }} onLoad={e => { e.currentTarget.style.display = ''; }} />}
          <Field label="Location *"><input name="location" value={form.location} onChange={change} required minLength="2" maxLength="180" placeholder="City, state" /></Field>
          <div className="notice"><ShieldCheck size={16} /> Your contact details are not shown publicly. Coordinate safely through messages.</div>
          {!editing && <label className="checkline"><input type="checkbox" required /> I agree to the community guidelines</label>}
        </div>
      </div>
      <div className="form-actions">
        <button type="button" className="btn btn-outline" onClick={() => navigate(-1)}>Cancel</button>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : isGive ? 'Publish item' : 'Publish request'}</button>
      </div>
    </form>
  </>;
}

// ───────────────────────── Browse ─────────────────────────

export function Browse() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') || '');
  const debounced = useDebounced(query.trim(), 350);
  const cat = params.get('category') || 'all';
  const type = params.get('type') || 'all';
  const [listings, setListings] = useState([]);
  const [state, setState] = useState('loading');
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  // A search started elsewhere (e.g. the dashboard topbar) updates the box.
  const urlQ = params.get('q') || '';
  useEffect(() => { if (urlQ !== debounced) setQuery(urlQ); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [urlQ]);

  // Keep ?q= in the URL in sync with the (debounced) search box.
  useEffect(() => {
    const p = new URLSearchParams(params);
    if (debounced) p.set('q', debounced); else p.delete('q');
    if (p.toString() !== params.toString()) setParams(p, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  useEffect(() => {
    const ctrl = new AbortController(); // cancel stale requests (F-11)
    setState('loading');
    const qs = new URLSearchParams();
    if (cat !== 'all') qs.set('category', cat);
    if (type !== 'all') qs.set('type', type);
    if (debounced) qs.set('q', debounced);
    api(`/listings?${qs}`, { signal: ctrl.signal })
      .then(d => { setListings(d.listings || []); setState('ready'); })
      .catch(e => { if (e.name !== 'AbortError') { setError(e.message); setState('error'); } });
    return () => ctrl.abort();
  }, [cat, type, debounced, reload]);

  function setFilter(key, value) {
    const p = new URLSearchParams(params);
    if (value === 'all') p.delete(key); else p.set(key, value);
    setParams(p);
  }

  return <>
    <div className="breadcrumbs"><Link to="/">Home</Link> › Explore</div>
    <h1 className="page-title">{cat === 'all' ? 'Browse community listings' : category(cat).name}</h1>
    <p className="subtext">Find free items and community requests around you.</p>
    <div className="browse-layout">
      <aside className="sidebar-panel" aria-label="Filters">
        <h3>Categories</h3>
        <button className={`side-link side-button ${cat === 'all' ? 'active' : ''}`} onClick={() => setFilter('category', 'all')}>All categories</button>
        {CATS.map(c => <button key={c.id} className={`side-link side-button ${cat === c.id ? 'active' : ''}`} onClick={() => setFilter('category', c.id)}>{c.emoji} {c.name}</button>)}
        <hr />
        <h3>Listing type</h3>
        {[['all', 'All posts'], ['give', 'Give (free)'], ['need', 'Need help']].map(([v, l]) => <button key={v} className={`side-link side-button ${type === v ? 'active' : ''}`} onClick={() => setFilter('type', v)}>{l}</button>)}
      </aside>
      <section>
        <div className="browse-toolbar">
          <strong aria-live="polite">{state === 'loading' ? 'Loading…' : state === 'ready' ? `${listings.length} listing${listings.length === 1 ? '' : 's'}` : ''}</strong>
          <div className="searchbar compact"><Search size={17} aria-hidden="true" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search listings..." aria-label="Search listings" />{query && <button type="button" className="clear-btn" onClick={() => setQuery('')} aria-label="Clear search"><X size={15} /></button>}</div>
        </div>
        {state === 'loading' ? <Loading label="Loading listings…" />
          : state === 'error' ? <ErrorState message={error} onRetry={() => setReload(r => r + 1)} />
          : listings.length ? <div className="listing-grid">{listings.map(item => <ListingCard key={item.id} item={item} />)}</div>
          : <Empty title="No listings match" message="Try another category or search word, or be the first to post." action={<Link className="btn btn-primary" to="/post/give">Post an item</Link>} />}
      </section>
    </div>
  </>;
}

// ───────────────────────── Listing detail ─────────────────────────

export function ListingDetail() {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [contacting, setContacting] = useState(false);
  const { user, notify, savedIds, toggleSave } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    setLoading(true); setError(''); setItem(null);
    const ctrl = new AbortController();
    api(`/listings/${id}`, { signal: ctrl.signal }).then(d => setItem(d.listing)).catch(e => { if (e.name !== 'AbortError') setError(e.status === 404 || e.status === 400 ? '' : e.message); }).finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [id]);

  async function contact() {
    if (!user) { navigate('/login', { state: { from: `/item/${id}` } }); return; }
    setContacting(true);
    try { const d = await api('/conversations', { method: 'POST', body: { listingId: item.id } }); navigate(`/dashboard/messages?conversation=${d.conversationId}`); }
    catch (e) { notify(e.message, 'error'); } finally { setContacting(false); }
  }
  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} />;
  if (!item) return <Empty title="Listing not found" message="It may have been removed or completed." action={<Link className="btn btn-primary" to="/categories">Browse listings</Link>} />;
  const c = category(item.category);
  const mine = user && Number(item.userId) === Number(user.id);
  const saved = savedIds.has(Number(item.id));
  return <>
    <div className="breadcrumbs"><Link to="/categories">Explore</Link> › <Link to={`/categories?category=${item.category}`}>{c.name}</Link> › {item.title}</div>
    <div className="detail-grid">
      <div><img className="detail-main-image" src={listingImage(item)} alt={item.title} onError={onImageError} /></div>
      <section>
        <span className={`tag ${item.type === 'need' ? 'need' : ''}`}>{item.type === 'need' ? 'Needs help' : 'Free to give'}</span>
        {item.status === 'completed' && <span className="tag done">Completed</span>}
        <h1 className="page-title">{item.title}</h1>
        <div className="detail-price">{item.type === 'give' ? 'Free for someone who needs it' : 'Community request'}</div>
        <p className="item-meta"><MapPin size={14} /> {item.location} · Posted {dateLabel(item.createdAt)}</p>
        <p className="detail-description">{item.description}</p>
        <div className="panel spec-panel"><p><strong>Category</strong><span>{c.emoji} {c.name}</span></p><p><strong>Condition</strong><span>{item.conditionLabel}</span></p><p><strong>Quantity</strong><span>{item.quantity}</span></p></div>
        <div className="profile-card"><div className="avatar">{(item.ownerName || 'C').charAt(0).toUpperCase()}</div><div><strong>{mine ? 'You' : item.ownerName || 'Community member'}</strong><div className="item-meta">Verified Sahayog member</div></div></div>
        <div className="detail-actions">
          {mine
            ? <><Link className="btn btn-primary" to={`/dashboard/listings/${item.id}/edit`}><Pencil size={16} /> Edit listing</Link><Link className="btn btn-outline" to="/dashboard/listings">Manage my listings</Link></>
            : <>
              {item.status === 'active' && <button className="btn btn-primary" onClick={contact} disabled={contacting}><MessageCircle size={17} /> {item.type === 'give' ? 'Message the donor' : 'Offer to help'}</button>}
              <button className="btn btn-outline" onClick={() => (user ? toggleSave(Number(item.id)) : navigate('/login', { state: { from: `/item/${id}` } }))} aria-pressed={saved}><Heart size={16} fill={saved ? 'currentColor' : 'none'} /> {saved ? 'Saved' : 'Save'}</button>
            </>}
        </div>
        <div className="notice"><ShieldCheck size={16} /> Arrange handovers safely. Never share passwords or banking details.</div>
      </section>
    </div>
  </>;
}

// ───────────────────────── Static pages ─────────────────────────

export function HowItWorks() {
  return <><h1 className="page-title">How Sahayog works</h1><p className="subtext">Helping each other is simple, fast and free.</p><Steps /><div className="notice large-notice"><ShieldCheck size={18} /> Always meet in a safe public place, protect personal information, and report suspicious behaviour.</div><div className="banner"><div><h2>Ready to make a difference?</h2><p>Start with one small act of kindness.</p></div><Link className="btn btn-primary" to="/give">Get started <ArrowRight size={16} /></Link></div></>;
}
export function About() {
  return <><h1 className="page-title">About Sahayog</h1><p className="subtext">Give · Receive · Be Kind</p><div className="about-panel"><div className="about-icon"><HeartHandshake size={48} /></div><h2>Small acts. Stronger communities.</h2><p>Sahayog is a community sharing platform where people can give useful items or ask for help without payment. Our goal is to make giving easier, receiving help more dignified, and local communities more connected.</p><div className="steps">{[['💗', 'Kindness', 'Help without expecting money.'], ['🤝', 'Respect', 'Every person deserves dignity.'], ['🌱', 'Community', 'Make useful things go further.'], ['🛡️', 'Safety', 'Share responsibly and carefully.']].map(([i, t, d]) => <div className="step" key={t}><span className="step-icon">{i}</span><h3>{t}</h3><p>{d}</p></div>)}</div></div></>;
}
export function NotFound() { return <Empty title="Page not found" message="This page may have moved." action={<Link className="btn btn-primary" to="/">Go home</Link>} />; }
