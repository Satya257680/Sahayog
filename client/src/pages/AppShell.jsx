import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  HeartHandshake, Menu, X, Search, Home, Compass, HandHeart, LifeBuoy, PlusCircle, ListChecks,
  Bookmark, MessageCircle, UserRound, LogOut, ChevronDown, CircleHelp
} from 'lucide-react';
import { useAuth } from '../auth';

const DESKTOP_QUERY = '(min-width: 1024px)';
const PREF_KEY = 'sahayog_sidebar_open';

function readPref() {
  try { const v = localStorage.getItem(PREF_KEY); return v === null ? true : v === '1'; } catch { return true; }
}
function writePref(open) { try { localStorage.setItem(PREF_KEY, open ? '1' : '0'); } catch { /* storage unavailable */ } }

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.matchMedia(DESKTOP_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isDesktop;
}

const NAV = [
  {
    label: null,
    items: [
      { to: '/dashboard', label: 'Home', icon: Home, end: true },
      { to: '/categories', label: 'Explore listings', icon: Compass }
    ]
  },
  {
    label: 'Share',
    items: [
      { to: '/post/give', label: 'Give an item', icon: HandHeart },
      { to: '/post/need', label: 'Ask for help', icon: LifeBuoy },
      { to: '/give', label: 'Browse by category', icon: PlusCircle, end: true }
    ]
  },
  {
    label: 'My activity',
    items: [
      { to: '/dashboard/listings', label: 'My listings', icon: ListChecks },
      { to: '/dashboard/saved', label: 'Saved items', icon: Bookmark },
      { to: '/dashboard/messages', label: 'Messages', icon: MessageCircle }
    ]
  },
  {
    label: 'Account',
    items: [
      { to: '/dashboard/profile', label: 'Profile & security', icon: UserRound },
      { to: '/how-it-works', label: 'How it works', icon: CircleHelp }
    ]
  }
];

/**
 * Shopify-admin style shell (F-06):
 *  - Topbar with a menu button that opens/closes the sidebar.
 *  - Desktop (≥1024px): sidebar is docked and the button collapses/expands it (preference remembered).
 *  - Mobile/tablet: sidebar is an off-canvas drawer with a dimmed overlay; closes on overlay click,
 *    the close button, Escape, or navigation. Body scroll is locked and focus is managed while open.
 */
export default function AppShell() {
  const { user, logout } = useAuth();
  const isDesktop = useIsDesktop();
  const location = useLocation();
  const navigate = useNavigate();
  const [desktopOpen, setDesktopOpen] = useState(readPref);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [search, setSearch] = useState('');
  const menuBtn = useRef(null);
  const sidebar = useRef(null);
  const profileRef = useRef(null);

  const open = isDesktop ? desktopOpen : mobileOpen;
  const drawerMode = !isDesktop;

  const closeMenu = useCallback((returnFocus = true) => {
    if (isDesktop) { setDesktopOpen(false); writePref(false); } else setMobileOpen(false);
    if (returnFocus) menuBtn.current?.focus();
  }, [isDesktop]);
  function toggleMenu() {
    if (isDesktop) { setDesktopOpen(o => { writePref(!o); return !o; }); } else setMobileOpen(o => !o);
  }

  // Close the drawer and profile menu whenever the route changes.
  useEffect(() => { setMobileOpen(false); setProfileOpen(false); }, [location.pathname, location.search]);
  // Leaving mobile size never leaves an invisible open drawer behind.
  useEffect(() => { if (isDesktop) setMobileOpen(false); }, [isDesktop]);

  // Drawer: lock body scroll, move focus inside, trap Tab, close on Escape.
  useEffect(() => {
    if (!drawerMode || !mobileOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const first = sidebar.current?.querySelector('a, button');
    first?.focus();
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); closeMenu(); return; }
      if (e.key === 'Tab' && sidebar.current) {
        const nodes = [...sidebar.current.querySelectorAll('a[href], button:not([disabled])')];
        if (!nodes.length) return;
        const firstEl = nodes[0], lastEl = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
        else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey); };
  }, [drawerMode, mobileOpen, closeMenu]);

  // Desktop: Escape collapses the sidebar when focus is inside it.
  function onSidebarKey(e) {
    if (isDesktop && e.key === 'Escape') { e.preventDefault(); closeMenu(); }
  }

  // Profile dropdown: close on outside click / Escape.
  useEffect(() => {
    if (!profileOpen) return undefined;
    const onDown = e => { if (!profileRef.current?.contains(e.target)) setProfileOpen(false); };
    const onKey = e => { if (e.key === 'Escape') setProfileOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [profileOpen]);

  async function doLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  const initial = (user?.name || 'S').charAt(0).toUpperCase();

  return <div className={`shell ${open ? 'is-open' : 'is-collapsed'} ${drawerMode ? 'is-drawer' : 'is-docked'}`}>
    <a href="#shell-main" className="skip-link">Skip to content</a>
    <header className="shell-top">
      <button ref={menuBtn} type="button" className="shell-menu-btn" onClick={toggleMenu}
        aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} aria-controls="app-sidebar">
        {open && drawerMode ? <X size={20} /> : <Menu size={20} />}
      </button>
      <Link to="/dashboard" className="shell-brand"><span className="brand-mark small"><HeartHandshake size={20} /></span><strong>Sahayog</strong></Link>
      <form className="shell-search" role="search" onSubmit={e => { e.preventDefault(); navigate(`/categories${search.trim() ? `?q=${encodeURIComponent(search.trim())}` : ''}`); setSearch(''); }}>
        <Search size={16} aria-hidden="true" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search listings" aria-label="Search listings" />
      </form>
      <div className="shell-top-actions">
        <Link to="/post/give" className="btn btn-primary btn-small shell-post"><PlusCircle size={15} /> <span>Post</span></Link>
        <div className="profile-menu" ref={profileRef}>
          <button type="button" className="profile-btn" onClick={() => setProfileOpen(o => !o)} aria-haspopup="menu" aria-expanded={profileOpen}>
            <span className="avatar small">{initial}</span><span className="profile-name">{user?.name?.split(' ')[0]}</span><ChevronDown size={15} aria-hidden="true" />
          </button>
          {profileOpen && <div className="profile-pop" role="menu">
            <div className="profile-pop-head"><strong>{user?.name}</strong><small>{user?.email}</small></div>
            <Link role="menuitem" to="/dashboard/profile"><UserRound size={15} /> Profile & security</Link>
            <Link role="menuitem" to="/dashboard/listings"><ListChecks size={15} /> My listings</Link>
            <button role="menuitem" type="button" onClick={doLogout}><LogOut size={15} /> Log out</button>
          </div>}
        </div>
      </div>
    </header>

    {drawerMode && mobileOpen && <div className="shell-overlay" onClick={() => closeMenu()} aria-hidden="true" />}

    <aside id="app-sidebar" ref={sidebar} className="shell-side" aria-label="Dashboard menu" onKeyDown={onSidebarKey}
      aria-hidden={!open ? true : undefined} {...(!open ? { inert: '' } : {})}
      role={drawerMode ? 'dialog' : undefined} aria-modal={drawerMode && mobileOpen ? true : undefined}>
      <div className="shell-side-head">
        <span className="avatar">{initial}</span>
        <span className="shell-user"><strong>{user?.name}</strong><small>{user?.email}</small></span>
        {drawerMode && <button type="button" className="shell-close" onClick={() => closeMenu()} aria-label="Close menu"><X size={18} /></button>}
      </div>
      <nav className="shell-nav">
        {NAV.map((group, gi) => <div className="shell-group" key={gi}>
          {group.label && <p className="shell-group-label">{group.label}</p>}
          {group.items.map(({ to, label, icon: Icon, end }) =>
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `shell-link ${isActive ? 'active' : ''}`}>
              <Icon size={18} aria-hidden="true" /> <span>{label}</span>
            </NavLink>)}
        </div>)}
      </nav>
      <div className="shell-side-foot">
        <button type="button" className="shell-link" onClick={doLogout}><LogOut size={18} aria-hidden="true" /> <span>Log out</span></button>
      </div>
    </aside>

    <main id="shell-main" className="shell-main" tabIndex={-1}>
      <div className="shell-content"><Outlet /></div>
    </main>
  </div>;
}
