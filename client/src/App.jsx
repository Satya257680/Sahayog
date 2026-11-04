import React, { createContext, useContext, useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { HeartHandshake, Search, Menu, X, MapPin, BookOpen, Shirt, Soup, Pill, Droplet, Heart, ArrowRight, Plus, MessageCircle, CheckCircle2, Package, Users, Sparkles, Bookmark, LogOut, UserRound, HandHeart, ShieldCheck, Send, LayoutDashboard } from 'lucide-react';
import { api, clearSession, getToken, getUser, setSession } from './api';

const CATS = [
  { id: 'books', name: 'School Books', short: 'Books', icon: BookOpen, emoji: '📚', tint: 'pink' },
  { id: 'clothes', name: 'Clothes', icon: Shirt, emoji: '👕', tint: 'blue' },
  { id: 'food', name: 'Food', icon: Soup, emoji: '🍲', tint: 'orange' },
  { id: 'medicine', name: 'Medicine', icon: Pill, emoji: '💊', tint: 'green' },
  { id: 'blood', name: 'Blood', icon: Droplet, emoji: '🩸', tint: 'rose' },
  { id: 'other', name: 'Other Help', icon: Heart, emoji: '🧸', tint: 'violet' }
];
const FALLBACK_IMAGES = {
  books: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=900&q=85',
  clothes: 'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?auto=format&fit=crop&w=900&q=85',
  food: 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=85',
  medicine: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=900&q=85',
  blood: 'https://images.unsplash.com/photo-1615461066841-6116e61058f4?auto=format&fit=crop&w=900&q=85',
  other: 'https://images.unsplash.com/photo-1559454403-b8fb88521f11?auto=format&fit=crop&w=900&q=85'
};
const AuthContext = createContext(null);
function useAuth() { return useContext(AuthContext); }
function category(id) { return CATS.find(c => c.id === id) || CATS[0]; }
function dateLabel(date) { try { return new Date(date).toLocaleDateString(); } catch { return ''; } }

function App() {
  const [user, setUser] = useState(getUser());
  const [toast, setToast] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const notify = (message) => { setToast(message); window.clearTimeout(window.__sahayogToast); window.__sahayogToast = window.setTimeout(() => setToast(''), 2800); };
  const authValue = { user, setUser, notify };
  return <AuthContext.Provider value={authValue}>
    <div className="app-shell">
      <Header menuOpen={menuOpen} setMenuOpen={setMenuOpen} />
      <main className="container"><Routes>
        <Route path="/" element={<Home />} />
        <Route path="/give" element={<GiveNeed type="give" />} />
        <Route path="/need" element={<GiveNeed type="need" />} />
        <Route path="/post/:type" element={<PostListing />} />
        <Route path="/categories" element={<Browse />} />
        <Route path="/item/:id" element={<ListingDetail />} />
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/saved" element={<SavedPage />} />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/how-it-works" element={<HowItWorks />} />
        <Route path="/about" element={<About />} />
        <Route path="*" element={<NotFound />} />
      </Routes></main>
      <Footer />
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  </AuthContext.Provider>;
}

function Header({ menuOpen, setMenuOpen }) {
  const { user } = useAuth();
  const nav = [['/', 'Home'], ['/give', 'Give'], ['/need', 'Need Help'], ['/categories', 'Explore'], ['/how-it-works', 'How It Works']];
  return <header className="topbar">
    <Link to="/" className="brand" onClick={() => setMenuOpen(false)}><span className="brand-mark"><HeartHandshake size={30} /></span><span><strong>Sahayog</strong><small>Give · Receive · Be Kind</small></span></Link>
    <button className="mobile-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle navigation">{menuOpen ? <X /> : <Menu />}</button>
    <nav className={`nav ${menuOpen ? 'open' : ''}`}>{nav.map(([to, label]) => <NavLink key={to} to={to} onClick={() => setMenuOpen(false)} end={to === '/'}>{label}</NavLink>)}</nav>
    <div className="top-actions"><span className="location desktop-only"><MapPin size={14} /> India</span>
      {user ? <><Link className="btn btn-outline btn-small desktop-only" to="/dashboard"><UserRound size={15} /> {user.name?.split(' ')[0] || 'My account'}</Link><button className="btn btn-primary btn-small" onClick={() => { clearSession(); window.location.href = '/'; }}> <LogOut size={14} /> Logout</button></> : <><Link className="btn btn-outline btn-small desktop-only" to="/login">Login</Link><Link className="btn btn-primary btn-small" to="/register">Join Free</Link></>}
    </div>
  </header>;
}

function Footer() {
  return <footer className="footer"><div className="footer-inner"><div><Link to="/" className="footer-brand"><HeartHandshake /> Sahayog</Link><p>Give · Receive · Be Kind</p><span>Small acts of kindness create stronger communities.</span></div><div><strong>Explore</strong><p><Link to="/give">Give something</Link> · <Link to="/need">Need help</Link> · <Link to="/how-it-works">How it works</Link></p></div><div><strong>Community first</strong><p>Free to use · Be respectful · Keep exchanges safe</p><small>Built to help communities share more.</small></div></div></footer>;
}

function CategoryGrid({ onChoose }) {
  return <div className="category-grid">{CATS.map(c => <button className="category-card" key={c.id} onClick={() => onChoose?.(c.id)}><span className={`category-icon ${c.tint}`}>{c.emoji}</span><span><strong>{c.name}</strong><small>{c.id === 'books' ? 'Learning materials' : c.id === 'other' ? 'Support and essentials' : `Give or get ${c.name.toLowerCase()}`}</small></span><ArrowRight className="category-arrow" size={16} /></button>)}</div>;
}

function Home() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const { notify } = useAuth();
  useEffect(() => { api('/listings?limit=8').then(d => setListings(d.listings || [])).catch(e => notify(e.message)).finally(() => setLoading(false)); }, []);
  const visible = listings.filter(i => (filter === 'all' || i.type === filter) && (!query || `${i.title} ${i.description} ${i.category} ${i.location}`.toLowerCase().includes(query.toLowerCase())));
  return <>
    <section className="hero"><div className="hero-art" aria-hidden="true"><div className="hero-orb orb-one" /><div className="hero-orb orb-two" /><div className="hero-people">🫶 💗 🤝</div><div className="hero-note note-one">Kindness looks good on you ✨</div><div className="hero-note note-two">100% free to share</div></div><div className="hero-copy"><span className="eyebrow"><Sparkles size={14} /> A kinder community, together</span><h1>Give a little.<br /><span className="gradient-text">Change a lot.</span></h1><p>A place where people help each other — freely.<br />Give what you can. Get what you need.</p><form className="searchbar" onSubmit={e => { e.preventDefault(); window.location.href = `/categories?q=${encodeURIComponent(query)}`; }}><Search size={21} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search books, clothes, food..." /><button className="btn btn-primary" type="submit">Search</button></form><div className="hero-actions"><Link className="btn btn-primary" to="/give"><HandHeart size={17} /> Give Something</Link><Link className="btn btn-soft" to="/need">I Need Help</Link></div></div></section>
    <section className="stats"><Stat icon={<Users />} value="Community first" label="People helping people" /><Stat icon={<Heart />} value="Free forever" label="No payment for items" /><Stat icon={<Package />} value={listings.length.toString()} label="Active listings loaded" /><Stat icon={<ShieldCheck />} value="Safer sharing" label="Connect with care" /></section>
    <section className="section"><div className="section-head"><div><h2>Explore Categories</h2><p>Find a way to give or get help.</p></div><Link className="text-link" to="/categories">View all categories <ArrowRight size={15} /></Link></div><CategoryGrid onChoose={id => window.location.href = `/categories?category=${id}`} /></section>
    <section className="section"><div className="section-head"><div><h2>📍 Nearby & Available</h2><p>Free items and requests shared by the community.</p></div><div className="pills"><button className={`pill ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>All</button><button className={`pill ${filter === 'give' ? 'active' : ''}`} onClick={() => setFilter('give')}>Give</button><button className={`pill ${filter === 'need' ? 'active' : ''}`} onClick={() => setFilter('need')}>Need</button></div></div>
      {loading ? <Loading /> : visible.length ? <div className="listing-grid">{visible.slice(0, 8).map(item => <ListingCard key={item.id} item={item} />)}</div> : <Empty title="No listings yet" message="Be the first to share something with your community." action={<Link to="/post/give" className="btn btn-primary">Post an item</Link>} />}
    </section>
    <section className="banner"><div><h2>A stronger community starts with you 💗</h2><p>One small act of kindness can make someone's day.</p></div><div className="banner-actions"><Link className="btn btn-primary" to="/give">Give Something <ArrowRight size={16} /></Link><Link className="btn btn-soft" to="/need">I Need Help</Link></div></section>
    <section className="section"><div className="section-head"><div><h2>How Sahayog Works</h2><p>Helping each other is simple, fast and free.</p></div><Link className="text-link" to="/how-it-works">Learn more <ArrowRight size={15} /></Link></div><Steps /></section>
  </>;
}
function Stat({ icon, value, label }) { return <div className="stat"><span className="stat-icon">{icon}</span><div><strong>{value}</strong><span>{label}</span></div></div>; }
function Steps() { const steps = [['👤', 'Join the community', 'Create a free account in minutes.'], ['🎁', 'Give or ask', 'Post something you can give or need.'], ['💬', 'Connect safely', 'Message the person and arrange details.'], ['💗', 'Make a difference', 'Complete the exchange and spread kindness.']]; return <div className="steps">{steps.map(s => <div className="step" key={s[1]}><div className="step-icon">{s[0]}</div><h3>{s[1]}</h3><p>{s[2]}</p></div>)}</div>; }

function ListingCard({ item }) {
  const { user, notify } = useAuth();
  const [saved, setSaved] = useState(false);
  const c = category(item.category);
  async function toggleSave() {
    if (!user) return notify('Please log in to save listings.');
    try { if (!saved) { await api(`/saved/${item.id}`, { method: 'POST' }); setSaved(true); notify('Listing saved.'); } else { await api(`/saved/${item.id}`, { method: 'DELETE' }); setSaved(false); notify('Removed from saved items.'); } }
    catch (e) { notify(e.message); }
  }
  return <article className="item-card"><Link to={`/item/${item.id}`}><img className="item-image" src={item.imageUrl || FALLBACK_IMAGES[item.category]} alt={item.title} onError={e => { e.currentTarget.src = FALLBACK_IMAGES.other; }} /></Link><div className="item-body"><div className="card-top"><span className={`tag ${item.type === 'need' ? 'need' : ''}`}>{item.type === 'need' ? 'Need help' : 'Give · Free'}</span><button className="heart-btn" onClick={toggleSave} aria-label="Save listing"><Heart size={17} fill={saved ? 'currentColor' : 'none'} /></button></div><Link to={`/item/${item.id}`}><h3 className="item-title">{item.title}</h3></Link><p className="item-meta">{c.emoji} {c.name} · {item.conditionLabel || 'Good'}</p><p className="item-meta"><MapPin size={13} /> {item.location}</p><div className="card-bottom"><small>By {item.ownerName || 'Community member'}</small><Link className="btn btn-primary btn-small" to={`/item/${item.id}`}>View</Link></div></div></article>;
}

function GiveNeed({ type }) {
  const isGive = type === 'give';
  return <><div className="breadcrumbs"><Link to="/">Home</Link>　›　{isGive ? 'Give' : 'Need Help'}</div><h1 className="page-title">{isGive ? 'Give Something' : 'I Need Help'}</h1><p className="subtext">{isGive ? 'Share something useful with someone who needs it.' : 'Ask the community for what you need. It is free.'}</p><CategoryGrid onChoose={id => window.location.href = `/post/${type}?category=${id}`} /><div className="notice"><Heart size={16} /> {isGive ? 'All donations are free. Please share items in safe, usable condition.' : 'Be clear about what you need. Please do not post sensitive personal information.'}</div><div className="banner"><div><h2>{isGive ? 'Ready to share something?' : 'Tell the community what would help'}</h2><p>{isGive ? 'Add the details and help your item find a new home.' : 'Create a request and connect with people who can help.'}</p></div><Link className="btn btn-primary" to={`/post/${type}`}>{isGive ? 'Post an Item' : 'Post a Need Request'} <ArrowRight size={16} /></Link></div></>;
}

function PostListing() {
  const { type } = useParams();
  const isGive = type === 'give';
  const { user, notify } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title: '', category: params.get('category') || 'books', description: '', conditionLabel: 'Good', quantity: '1', location: '', imageUrl: '' });
  function change(e) { setForm({ ...form, [e.target.name]: e.target.value }); }
  async function submit(e) {
    e.preventDefault();
    if (!user || !getToken()) { notify('Please log in before publishing a listing.'); navigate('/login'); return; }
    setBusy(true);
    try {
      const result = await api('/listings', { method: 'POST', body: JSON.stringify({ ...form, type }) });
      notify('Your listing has been published!');
      navigate(`/item/${result.id}`);
    } catch (err) { notify(err.message); } finally { setBusy(false); }
  }
  return <><div className="breadcrumbs"><Link to="/">Home</Link>　›　<Link to={isGive ? '/give' : '/need'}>{isGive ? 'Give' : 'Need Help'}</Link>　›　Post</div><h1 className="page-title">{isGive ? 'Post an Item to Give' : 'Post a Need Request'}</h1><p className="subtext">{isGive ? 'Share the details so people who need it can reach you.' : 'Tell the community what you need.'}</p><form className="panel form-panel" onSubmit={submit}><div className="form-grid"><div><Field label="Title *"><input name="title" value={form.title} onChange={change} minLength="3" maxLength="120" required placeholder={isGive ? 'e.g. Class 10 Science Books' : 'e.g. Need school books for Class 10'} /></Field><Field label="Category *"><select name="category" value={form.category} onChange={change}>{CATS.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}</select></Field><Field label="Description *"><textarea name="description" value={form.description} onChange={change} minLength="10" maxLength="5000" required placeholder={isGive ? 'Describe the item, condition, size, etc.' : 'Describe what you need, quantity and useful details.'} /></Field><div className="form-grid"><Field label={isGive ? 'Condition' : 'Condition preference'}><select name="conditionLabel" value={form.conditionLabel} onChange={change}>{['Good','New','Usable','Any','Urgent'].map(v => <option key={v}>{v}</option>)}</select></Field><Field label="Quantity"><input name="quantity" value={form.quantity} onChange={change} maxLength="80" /></Field></div></div><div><Field label="Image URL (optional)"><input type="url" name="imageUrl" value={form.imageUrl} onChange={change} placeholder="https://example.com/photo.jpg" /><small>Use a public image URL for now. Upload support can be added later.</small></Field>{form.imageUrl && <img className="form-preview" src={form.imageUrl} alt="Preview" onError={e => e.currentTarget.style.display = 'none'} />}<Field label="Location *"><input name="location" value={form.location} onChange={change} required minLength="2" maxLength="180" placeholder="City, state" /></Field><div className="notice"><ShieldCheck size={16} /> Your contact details are not shown publicly. Coordinate safely through messages.</div><label className="checkline"><input type="checkbox" required /> I agree to the community guidelines</label></div></div><div className="form-actions"><Link className="btn btn-outline" to={isGive ? '/give' : '/need'}>Cancel</Link><button className="btn btn-primary" disabled={busy}>{busy ? 'Publishing…' : isGive ? 'Publish Item for Free' : 'Publish Need Request'} <ArrowRight size={16} /></button></div></form></>;
}
function Field({ label, children }) { return <div className="field"><label>{label}</label>{children}</div>; }

function Browse() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') || '');
  const [type, setType] = useState('all');
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const { notify } = useAuth();
  const cat = params.get('category') || 'all';
  useEffect(() => { setLoading(true); const qs = new URLSearchParams(); if (cat !== 'all') qs.set('category', cat); if (type !== 'all') qs.set('type', type); if (query.trim()) qs.set('q', query.trim()); api(`/listings?${qs}`).then(d => setListings(d.listings || [])).catch(e => notify(e.message)).finally(() => setLoading(false)); }, [cat, type, query]);
  return <><div className="breadcrumbs"><Link to="/">Home</Link>　›　Explore</div><h1 className="page-title">{cat === 'all' ? 'Browse Community Listings' : category(cat).name}</h1><p className="subtext">Find free items and community requests around you.</p><div className="browse-layout"><aside className="sidebar-panel"><h3>Categories</h3><Link className={`side-link ${cat === 'all' ? 'active' : ''}`} to="/categories">All categories</Link>{CATS.map(c => <Link key={c.id} className={`side-link ${cat === c.id ? 'active' : ''}`} to={`/categories?category=${c.id}`}>{c.emoji} {c.name}</Link>)}<hr /><h3>Listing type</h3>{[['all','All posts'],['give','Give (Free)'],['need','Need help']].map(([v,l]) => <button key={v} className={`side-link side-button ${type === v ? 'active' : ''}`} onClick={() => setType(v)}>{l}</button>)}</aside><section><div className="browse-toolbar"><strong>{loading ? 'Loading…' : `${listings.length} listings`}</strong><div className="searchbar compact"><Search size={17} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search listings..." /></div></div>{loading ? <Loading /> : listings.length ? <div className="listing-grid">{listings.map(item => <ListingCard key={item.id} item={item} />)}</div> : <Empty title="No listings found" message="Try another category or be the first to post." action={<Link className="btn btn-primary" to="/post/give">Post an item</Link>} />}</section></div></>;
}

function ListingDetail() {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const { user, notify } = useAuth();
  const navigate = useNavigate();
  useEffect(() => { api(`/listings/${id}`).then(d => setItem(d.listing)).catch(e => notify(e.message)).finally(() => setLoading(false)); }, [id]);
  async function contact() {
    if (!user) { notify('Please log in to contact the listing owner.'); navigate('/login'); return; }
    try { const d = await api('/conversations', { method: 'POST', body: JSON.stringify({ listingId: item.id }) }); navigate(`/messages?conversation=${d.conversationId}`); }
    catch (e) { notify(e.message); }
  }
  if (loading) return <Loading />;
  if (!item) return <Empty title="Listing not found" message="It may have been removed or completed." action={<Link className="btn btn-primary" to="/categories">Browse listings</Link>} />;
  const c = category(item.category);
  return <><div className="breadcrumbs"><Link to="/">Home</Link>　›　<Link to={`/categories?category=${item.category}`}>{c.name}</Link>　›　{item.title}</div><div className="detail-grid"><div><img className="detail-main-image" src={item.imageUrl || FALLBACK_IMAGES[item.category]} alt={item.title} onError={e => e.currentTarget.src = FALLBACK_IMAGES.other} /></div><section><span className={`tag ${item.type === 'need' ? 'need' : ''}`}>{item.type === 'need' ? 'Need help' : 'Give · Free'}</span><h1 className="page-title">{item.title}</h1><div className="detail-price">{item.type === 'give' ? 'Free for someone who needs it' : 'Community request'}</div><p className="item-meta"><MapPin size={14} /> {item.location} · Posted {dateLabel(item.createdAt)}</p><p className="detail-description">{item.description}</p><div className="panel spec-panel"><p><strong>Category</strong><span>{c.emoji} {c.name}</span></p><p><strong>Condition</strong><span>{item.conditionLabel}</span></p><p><strong>Quantity</strong><span>{item.quantity}</span></p></div><div className="profile-card"><div className="avatar">{(item.ownerName || 'C').charAt(0).toUpperCase()}</div><div><strong>{item.ownerName || 'Community member'}</strong><div className="item-meta">Sahayog community member</div></div></div><div className="detail-actions"><button className="btn btn-primary" onClick={contact}><MessageCircle size={17} /> {item.type === 'give' ? 'Contact Donor' : 'I Can Help'}</button><Link className="btn btn-outline" to="/categories">Back to Explore</Link></div><div className="notice"><ShieldCheck size={16} /> Arrange handovers safely. Never share passwords or banking details.</div></section></div></>;
}

function AuthPage({ mode }) {
  const isLogin = mode === 'login';
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const { setUser, notify } = useAuth();
  const navigate = useNavigate();
  function change(e) { setForm({ ...form, [e.target.name]: e.target.value }); }
  async function submit(e) {
    e.preventDefault(); setBusy(true);
    try {
      const data = await api(`/auth/${isLogin ? 'login' : 'register'}`, { method: 'POST', body: JSON.stringify(form) });
      setSession(data); setUser(data.user); notify(isLogin ? 'Welcome back!' : 'Welcome to Sahayog!'); navigate('/');
    } catch (e) { notify(e.message); } finally { setBusy(false); }
  }
  return <div className="auth-wrap"><div className="auth-art"><div className="auth-heart">💗</div><h2>{isLogin ? 'Welcome back to kindness.' : 'Join a community that cares.'}</h2><p>Every item shared can make a real difference.</p><div className="auth-floating">🤝 &nbsp; Give · Receive · Be Kind</div></div><form className="panel auth-form" onSubmit={submit}><span className="eyebrow">SAHAYOG COMMUNITY</span><h1>{isLogin ? 'Login' : 'Join free'}</h1><p className="subtext">{isLogin ? 'Continue helping your community.' : 'Create an account in just a minute.'}</p>{!isLogin && <Field label="Your name"><input name="name" value={form.name} onChange={change} required minLength="2" maxLength="100" placeholder="Full name" /></Field>}<Field label="Email address"><input type="email" name="email" value={form.email} onChange={change} required placeholder="you@example.com" /></Field><Field label="Password"><input type="password" name="password" value={form.password} onChange={change} required minLength="8" placeholder="At least 8 characters" /></Field><button className="btn btn-primary auth-submit" disabled={busy}>{busy ? 'Please wait…' : isLogin ? 'Login' : 'Create account'} <ArrowRight size={16} /></button><p className="auth-switch">{isLogin ? 'New to Sahayog?' : 'Already a member?'} <Link to={isLogin ? '/register' : '/login'}>{isLogin ? 'Join free' : 'Login'}</Link></p></form></div>;
}

function Dashboard() {
  const { user, notify } = useAuth();
  const navigate = useNavigate();
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  async function refresh() { try { const d = await api('/listings/mine'); setListings(d.listings || []); } catch (e) { notify(e.message); } finally { setLoading(false); } }
  useEffect(() => { if (!user) { navigate('/login'); return; } refresh(); }, []);
  async function changeStatus(item) {
    try { await api(`/listings/${item.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: item.status === 'completed' ? 'active' : 'completed' }) }); notify('Listing status updated.'); refresh(); }
    catch (e) { notify(e.message); }
  }
  if (!user) return null;
  return <><div className="breadcrumbs"><Link to="/">Home</Link>　›　My account</div><h1 className="page-title">My Dashboard</h1><p className="subtext">Welcome back, {user.name}. Manage your listings and community activity.</p><div className="dashboard-layout"><aside className="dashboard-nav"><div className="dashboard-user"><div className="avatar">{user.name.charAt(0).toUpperCase()}</div><strong>{user.name}</strong><small>{user.email}</small></div><NavLink to="/dashboard"><LayoutDashboard size={16} /> My Listings</NavLink><NavLink to="/saved"><Bookmark size={16} /> Saved Items</NavLink><NavLink to="/messages"><MessageCircle size={16} /> Messages</NavLink><button className="side-link side-button" onClick={() => { clearSession(); window.location.href = '/'; }}><LogOut size={16} /> Log out</button></aside><section className="dashboard-content"><div className="dashboard-heading"><div><h2>My Listings</h2><p>Manage your shared items and requests.</p></div><Link className="btn btn-primary btn-small" to="/post/give"><Plus size={16} /> New listing</Link></div>{loading ? <Loading /> : listings.length ? <div className="table-list">{listings.map(item => <div className="list-row" key={item.id}><img src={item.imageUrl || FALLBACK_IMAGES[item.category]} alt="" /><div><h3>{item.title}</h3><p>{category(item.category).name} · {item.location}</p><p>Posted {dateLabel(item.createdAt)}</p><span className={`tag ${item.status === 'completed' ? '' : 'need'}`}>{item.status}</span></div><div className="row-actions"><Link className="btn btn-outline btn-small" to={`/item/${item.id}`}>View</Link><button className="btn btn-soft btn-small" onClick={() => changeStatus(item)}>{item.status === 'completed' ? 'Reopen' : 'Mark completed'}</button></div></div>)}</div> : <Empty title="Your first act of kindness starts here" message="You haven't posted anything yet." action={<Link className="btn btn-primary" to="/post/give">Post an item</Link>} />}</section></div></>;
}

function SavedPage() {
  const { user, notify } = useAuth();
  const navigate = useNavigate();
  const [listings, setListings] = useState([]);
  useEffect(() => { if (!user) { navigate('/login'); return; } api('/saved').then(d => setListings(d.listings || [])).catch(e => notify(e.message)); }, []);
  return <><h1 className="page-title">Saved Items</h1><p className="subtext">Listings you bookmarked for later.</p>{listings.length ? <div className="listing-grid">{listings.map(i => <ListingCard key={i.id} item={i} />)}</div> : <Empty title="No saved items yet" message="Explore listings and save items you want to revisit." action={<Link className="btn btn-primary" to="/categories">Explore listings</Link>} />}</>;
}

function MessagesPage() {
  const { user, notify } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [conversations, setConversations] = useState([]);
  const [active, setActive] = useState(params.get('conversation') || '');
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState('');
  async function loadConversations() { try { const d = await api('/conversations'); setConversations(d.conversations || []); } catch (e) { notify(e.message); } }
  async function loadMessages(id) { setActive(String(id)); try { const d = await api(`/conversations/${id}/messages`); setMessages(d.messages || []); } catch (e) { notify(e.message); } }
  useEffect(() => { if (!user) { navigate('/login'); return; } loadConversations(); }, []);
  useEffect(() => { if (active) loadMessages(active); }, [active]);
  async function send(e) { e.preventDefault(); if (!body.trim() || !active) return; try { await api(`/conversations/${active}/messages`, { method: 'POST', body: JSON.stringify({ body }) }); setBody(''); loadMessages(active); } catch (e) { notify(e.message); } }
  if (!user) return null;
  return <><h1 className="page-title">Messages</h1><p className="subtext">Connect respectfully and arrange a safe handover.</p><div className="chat-layout"><aside className="chat-list"><h3>Conversations</h3>{conversations.length ? conversations.map(c => <button key={c.id} className={`side-link side-button ${String(c.id) === active ? 'active' : ''}`} onClick={() => loadMessages(c.id)}><span>{c.otherUser}<small>{c.listingTitle}</small></span><span>›</span></button>) : <p className="item-meta">Your conversations appear here when you contact a listing owner.</p>}</aside><section className="chat-thread">{active ? <>{messages.map(m => <div key={m.id} className={`bubble ${Number(m.senderId) === Number(user.id) ? 'mine' : ''}`}><p>{m.body}</p><small>{dateLabel(m.createdAt)}</small></div>)}<form className="chat-compose" onSubmit={send}><input value={body} onChange={e => setBody(e.target.value)} placeholder="Type a message..." required maxLength="3000" /><button className="btn btn-primary" aria-label="Send message"><Send size={16} /></button></form></> : <div className="empty"><MessageCircle size={30} /><p>Select a conversation or contact someone from a listing.</p></div>}</section></div></>;
}

function HowItWorks() { return <><h1 className="page-title">How Sahayog Works</h1><p className="subtext">Helping each other is simple, fast and free.</p><Steps /><div className="notice large-notice"><ShieldCheck size={18} /> Always meet in a safe public place, protect personal information, and report suspicious behaviour.</div><div className="banner"><div><h2>Ready to make a difference?</h2><p>Start with one small act of kindness.</p></div><Link className="btn btn-primary" to="/give">Get Started <ArrowRight size={16} /></Link></div></>; }
function About() { return <><h1 className="page-title">About Sahayog</h1><p className="subtext">Give · Receive · Be Kind</p><div className="about-panel"><div className="about-icon"><HeartHandshake size={48} /></div><h2>Small acts. Stronger communities.</h2><p>Sahayog is a community sharing platform where people can give useful items or ask for help without payment. Our goal is to make giving easier, receiving help more dignified, and local communities more connected.</p><div className="steps"><div className="step"><span className="step-icon">💗</span><h3>Kindness</h3><p>Help without expecting money.</p></div><div className="step"><span className="step-icon">🤝</span><h3>Respect</h3><p>Every person deserves dignity.</p></div><div className="step"><span className="step-icon">🌱</span><h3>Community</h3><p>Make useful things go further.</p></div><div className="step"><span className="step-icon">🛡️</span><h3>Safety</h3><p>Share responsibly and carefully.</p></div></div></div></>; }
function Loading() { return <div className="loading"><span className="spinner" /> Loading community listings…</div>; }
function Empty({ title, message, action }) { return <div className="empty"><div className="empty-icon">💗</div><h3>{title}</h3><p>{message}</p>{action}</div>; }
function NotFound() { return <Empty title="Page not found" message="This page may have moved." action={<Link className="btn btn-primary" to="/">Go home</Link>} />; }

export default App;
