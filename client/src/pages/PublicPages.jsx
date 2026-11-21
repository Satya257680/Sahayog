import React, { useEffect, useRef, useState } from "react";
import {
  Link,
  Outlet,
  useNavigate,
  useParams,
  useSearchParams,
  useLocation,
} from "react-router-dom";
import {
  HeartHandshake,
  Search,
  Menu,
  X,
  MapPin,
  Heart,
  ArrowRight,
  MessageCircle,
  LogOut,
  UserRound,
  ShieldCheck,
  Pencil,
  Repeat2,
  MessageCircleHeart,
  HandHelping,
  PackagePlus,
  MessagesSquare,
} from "lucide-react";
import { api } from "../api";
import { useAuth } from "../auth";
import { BrandLogo } from "../brand";
import {
  CATS,
  FALLBACK_IMAGES,
  category,
  dateLabel,
  listingImage,
  onImageError,
  useDebounced,
  Field,
  CategoryGrid,
  ListingCard,
  Steps,
  Loading,
  Empty,
  ErrorState,
} from "../shared";

// ───────────────────────── Public layout (signed-out) ─────────────────────────

/** Mobile-menu state shared by every page that shows the public header (landing + auth pages). */
export function usePublicMenu() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.hash]);
  // Escape closes the mobile menu.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);
  return [menuOpen, setMenuOpen];
}

export function PublicLayout() {
  const [menuOpen, setMenuOpen] = usePublicMenu();
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <PublicHeader menuOpen={menuOpen} setMenuOpen={setMenuOpen} />
      <main className="container" id="main" tabIndex={-1}>
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

/**
 * Public navigation introduces Sahayog; it does not link into the product.
 * Give / Need / Explore stay available as routes and inside the signed-in app.
 */
const SECTION_HASHES = ["#who-we-are", "#how-it-works"];
const PUBLIC_NAV = [
  { to: "/", hash: "", label: "Home" },
  { to: "/#who-we-are", hash: "#who-we-are", label: "Who We Are" },
  { to: "/#how-it-works", hash: "#how-it-works", label: "How It Works" },
];

export function PublicHeader({ menuOpen, setMenuOpen }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname, hash } = useLocation();
  const onLanding = pathname === "/";
  const isActive = (item) =>
    onLanding &&
    (item.hash ? hash === item.hash : !SECTION_HASHES.includes(hash));
  // Close the menu on any link click: the location effect alone misses clicks on the current URL.
  const closeOnLink = (e) => {
    if (e.target.closest("a")) setMenuOpen(false);
  };
  return (
    <header className="topbar">
      <Link to="/" className="brand" aria-label="Sahayog home">
        <BrandLogo size={40} className="brand-logo--nav" />
        <span>
          <strong>Sahayog</strong>
          <small>Give · Receive · Be Kind</small>
        </span>
      </Link>
      <button
        type="button"
        className="mobile-menu"
        onClick={() => setMenuOpen(!menuOpen)}
        aria-label={menuOpen ? "Close navigation" : "Open navigation"}
        aria-expanded={menuOpen}
        aria-controls="public-nav"
      >
        {menuOpen ? <X size={20} /> : <Menu size={20} />}
      </button>
      <nav
        id="public-nav"
        className={`nav ${menuOpen ? "open" : ""}`}
        aria-label="Main"
        onClick={closeOnLink}
      >
        {PUBLIC_NAV.map((item) => {
          const active = isActive(item);
          return (
            <Link
              key={item.label}
              to={item.to}
              className={active ? "active" : undefined}
              aria-current={
                active ? (item.hash ? "location" : "page") : undefined
              }
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="top-actions">
        {user ? (
          <>
            <Link
              className="btn btn-outline btn-small desktop-only"
              to="/dashboard"
            >
              <UserRound size={15} /> Dashboard
            </Link>
            <button
              type="button"
              className="btn btn-primary btn-small"
              onClick={async () => {
                await logout();
                navigate("/");
              }}
            >
              <LogOut size={14} /> Log out
            </button>
          </>
        ) : (
          // Only "Log in" here: the header has no sign-up button (account creation stays on the
          // landing hero and the login page). Visible at every width, so it replaces the mobile-menu copy.
          <Link className="btn btn-ghost btn-small header-login" to="/login">
            Log in
          </Link>
        )}
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-about">
          <Link to="/" className="footer-brand">
            <BrandLogo size={24} /> Sahayog
          </Link>
          <p className="footer-tagline">Give · Receive · Be Kind</p>
          <p className="footer-mission">
            A community for sharing useful things, asking for help, and making
            everyday kindness easier.
          </p>
        </div>
        <nav className="footer-col" aria-label="About Sahayog">
          <strong>About</strong>
          <ul>
            <li>
              <Link to="/#who-we-are">Who We Are</Link>
            </li>
            <li>
              <Link to="/#how-it-works">How It Works</Link>
            </li>
          </ul>
        </nav>
        <nav className="footer-col" aria-label="Account">
          <strong>Account</strong>
          <ul>
            <li>
              <Link to="/login">Log in</Link>
            </li>
            <li>
              <Link to="/signup">Sign up free</Link>
            </li>
          </ul>
        </nav>
      </div>
      <div className="footer-base">
        <p>Give freely. Receive with dignity. Be kind.</p>
        <small>© {new Date().getFullYear()} Sahayog</small>
      </div>
    </footer>
  );
}

// ───────────────────────── Landing ─────────────────────────

// Everyday categories shown in the hero. Photos are the project's existing category images.
const HERO_TILES = ["books", "clothes", "food"];

const IDEAS = [
  [
    Repeat2,
    "Pass it forward",
    "A book, a useful item, or an everyday essential can continue to help long after you are done with it.",
  ],
  [
    MessageCircleHeart,
    "Ask without hesitation",
    "Everyone needs a hand sometimes. Sahayog makes space for people to express what they need with respect.",
  ],
  [
    HandHelping,
    "Make kindness practical",
    "Helping does not always need a grand gesture. Sometimes it starts with sharing one useful thing or responding to one request.",
  ],
];

const JOURNEY = [
  [
    PackagePlus,
    "Share what you can",
    "Have something useful that you no longer need? Add a few details and let the community know it is available.",
  ],
  [
    MessageCircle,
    "Tell the community what you need",
    "Looking for something that would help? Describe what you are hoping to find so others can understand your request.",
  ],
  [
    Search,
    "Find a connection",
    "Explore the available offers and requests. You may find someone with just the thing you need, or discover a request you can help with.",
  ],
  [
    MessagesSquare,
    "Talk and agree on the details",
    "Get in touch with the other person. Discuss the item, ask any questions, and agree on a practical way to complete the exchange.",
  ],
  [
    HeartHandshake,
    "Pass it on",
    "Complete the exchange together. Something useful gets a new home, and a small act of generosity makes a difference.",
  ],
];

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Scrolls to /#who-we-are and /#how-it-works (React Router does not do this by itself). */
function useSectionScroll() {
  const { hash, key } = useLocation();
  const first = useRef(true);
  useEffect(() => {
    const isFirst = first.current;
    first.current = false;
    if (!SECTION_HASHES.includes(hash)) {
      // Clicking Home or the logo from a section returns to the top; the initial load is left alone.
      if (!isFirst && !hash)
        window.scrollTo({
          top: 0,
          behavior: prefersReducedMotion() ? "auto" : "smooth",
        });
      return;
    }
    const target = document.getElementById(hash.slice(1));
    if (!target) return;
    // scroll-margin-top in CSS keeps the heading clear of the sticky header.
    target.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "start",
    });
    target.focus({ preventScroll: true });
  }, [hash, key]);
}

export function Landing() {
  useSectionScroll();
  return (
    <div className="landing">
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero__copy">
          <p className="landing-eyebrow">A kinder community, together</p>
          <h1 id="landing-title" className="landing-title">
            Give a little.
            <br />
            <span className="landing-title__accent">Change a lot.</span>
          </h1>
          <p className="landing-lede">
            A place where people help each other, freely.
            <br />
            Give what you can. Get what you need.
          </p>
          <div className="landing-entry">
            <Link className="landing-btn landing-btn--primary" to="/login">
              Log in to Sahayog <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <p className="landing-entry__signup">
              New to Sahayog? <Link to="/signup">Create an account</Link>
            </p>
          </div>
        </div>

        <figure className="landing-hero__visual" aria-hidden="true">
          <div className="landing-mosaic">
            {HERO_TILES.map((id) => (
              <div
                className={`landing-mosaic__tile landing-mosaic__tile--${id}`}
                key={id}
              >
                <img
                  src={FALLBACK_IMAGES[id]}
                  alt=""
                  loading="eager"
                  decoding="async"
                  onError={onImageError}
                />
                <span className="landing-mosaic__label">
                  {category(id).name}
                </span>
              </div>
            ))}
          </div>
          <figcaption>
            Books, clothes and everyday essentials, passed on freely.
          </figcaption>
        </figure>
      </section>

      <section
        id="who-we-are"
        className="landing-section landing-about"
        aria-labelledby="who-we-are-title"
        tabIndex={-1}
      >
        <div className="landing-about__story">
          <p className="landing-eyebrow">Who we are</p>
          <h2 id="who-we-are-title" className="landing-heading">
            A community where what you can give meets what someone needs.
          </h2>
          <div className="landing-prose">
            <p>
              Sahayog brings people together to share useful things and support
              one another. It gives people a simple way to pass along items they
              no longer need and a place to ask when something would make a
              difference in their day.
            </p>
            <p>
              A book that has been read, clothes that no longer fit, or everyday
              essentials that are still useful can mean a lot to someone else.
              Sahayog helps those things find a new home instead of going to
              waste.
            </p>
            <p>
              We believe help should be offered with kindness and received with
              dignity. It is not about how much someone has. It is about what
              people can do for one another.
            </p>
          </div>
        </div>
        <aside
          className="landing-about__aside"
          aria-label="Our mission and vision"
        >
          <blockquote className="landing-quote">
            <p>
              What is no longer needed by one person can be valuable to another.
            </p>
          </blockquote>
          <dl className="landing-purpose">
            <div>
              <dt>Our mission</dt>
              <dd>
                Make it easier for people to share useful things, ask for
                support, reduce waste, and help their communities.
              </dd>
            </div>
            <div>
              <dt>Our vision</dt>
              <dd>
                A world where people look out for one another and useful things
                reach the people who can use them.
              </dd>
            </div>
          </dl>
        </aside>
      </section>

      <section
        className="landing-section landing-idea"
        aria-labelledby="idea-title"
      >
        <div className="landing-idea__intro">
          <div>
            <p className="landing-eyebrow">The idea behind Sahayog</p>
            <h2 id="idea-title" className="landing-heading">
              Good things deserve another chance.
            </h2>
          </div>
          <p className="landing-idea__statement">
            Sometimes the things we no longer need are exactly what someone else
            is looking for. A little sharing can make everyday life easier, and
            keep useful things from going to waste.
          </p>
        </div>
        <ul className="landing-idea__list">
          {IDEAS.map(([Icon, title, text]) => (
            <li key={title}>
              <span className="landing-icon" aria-hidden="true">
                <Icon size={20} strokeWidth={1.8} />
              </span>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section
        id="how-it-works"
        className="landing-section landing-how"
        aria-labelledby="how-it-works-title"
        tabIndex={-1}
      >
        <div className="landing-how__intro">
          <p className="landing-eyebrow">How it works</p>
          <h2 id="how-it-works-title" className="landing-heading">
            From one person to another.
          </h2>
          <p className="landing-how__lede">
            A simple way to pass something on, ask for what you need, and make a
            useful connection.
          </p>
          <p className="landing-how__note">
            Sahayog helps people find each other. The people involved talk it
            through and arrange the exchange themselves.
          </p>
        </div>
        <ol className="landing-journey">
          {JOURNEY.map(([Icon, title, text], i) => (
            <li key={title}>
              <div className="landing-journey__marker" aria-hidden="true">
                <span>{String(i + 1).padStart(2, "0")}</span>
              </div>
              <div className="landing-journey__body">
                <h3>
                  <Icon size={18} strokeWidth={1.9} aria-hidden="true" />{" "}
                  {title}
                </h3>
                <p>{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section
        className="landing-closing"
        aria-labelledby="landing-closing-title"
      >
        <div>
          <h2 id="landing-closing-title">A little help can go a long way.</h2>
          <p>
            Be part of a community where useful things find a new home and
            people look out for one another.
          </p>
        </div>
        <div className="landing-closing__actions">
          <Link className="landing-btn landing-btn--light" to="/signup">
            Create a free account
          </Link>
          <Link className="landing-btn landing-btn--ghost-light" to="/login">
            Log in
          </Link>
        </div>
      </section>
    </div>
  );
}

// ───────────────────────── Give / Need ─────────────────────────

export function GiveNeed({ type }) {
  const navigate = useNavigate();
  const isGive = type === "give";
  return (
    <>
      <div className="breadcrumbs">
        <Link to="/">Home</Link> › {isGive ? "Give" : "Need Help"}
      </div>
      <h1 className="page-title">
        {isGive ? "Give something" : "Ask for help"}
      </h1>
      <p className="subtext">
        {isGive
          ? "Pick a category to share something useful with someone who needs it."
          : "Pick a category and tell the community what you need. It is free."}
      </p>
      <CategoryGrid
        onChoose={(id) => navigate(`/post/${type}?category=${id}`)}
      />
      <div className="notice">
        <Heart size={16} />{" "}
        {isGive
          ? "All donations are free. Please share items in safe, usable condition."
          : "Be clear about what you need. Please do not post sensitive personal information."}
      </div>
      <div className="banner">
        <div>
          <h2>
            {isGive
              ? "Ready to share something?"
              : "Tell the community what would help"}
          </h2>
          <p>
            {isGive
              ? "Add the details and help your item find a new home."
              : "Create a request and connect with people who can help."}
          </p>
        </div>
        <Link className="btn btn-primary" to={`/post/${type}`}>
          {isGive ? "Post an item" : "Post a request"} <ArrowRight size={16} />
        </Link>
      </div>
    </>
  );
}

// ───────────────────────── Post / edit listing ─────────────────────────

const EMPTY_LISTING = {
  title: "",
  category: "books",
  description: "",
  conditionLabel: "Good",
  quantity: "1",
  location: "",
  imageUrl: "",
};

export function ListingForm({ mode = "create" }) {
  const params = useParams();
  const [search] = useSearchParams();
  const { notify } = useAuth();
  const navigate = useNavigate();
  const editing = mode === "edit";
  const [type, setType] = useState(params.type === "need" ? "need" : "give");
  const [form, setForm] = useState({
    ...EMPTY_LISTING,
    category: CATS.some((c) => c.id === search.get("category"))
      ? search.get("category")
      : "books",
  });
  const [loading, setLoading] = useState(editing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!editing) setType(params.type === "need" ? "need" : "give");
  }, [params.type, editing]);
  useEffect(() => {
    if (!editing) return;
    api(`/listings/${params.id}`)
      .then((d) => {
        const l = d.listing;
        setType(l.type);
        setForm({
          title: l.title,
          category: l.category,
          description: l.description,
          conditionLabel: l.conditionLabel || "Good",
          quantity: l.quantity || "1",
          location: l.location,
          imageUrl: l.imageUrl || "",
        });
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [editing, params.id]);

  const isGive = type === "give";
  function change(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (editing) {
        await api(`/listings/${params.id}`, {
          method: "PUT",
          body: { ...form, type },
        });
        notify("Listing updated.", "success");
        navigate("/dashboard/listings");
      } else {
        const result = await api("/listings", {
          method: "POST",
          body: { ...form, type },
        });
        notify("Listing published.", "success");
        navigate(`/item/${result.id}`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <Loading />;

  return (
    <>
      <div className="breadcrumbs">
        {editing ? (
          <>
            <Link to="/dashboard/listings">My listings</Link> › Edit
          </>
        ) : (
          <>
            <Link to={isGive ? "/give" : "/need"}>
              {isGive ? "Give" : "Need Help"}
            </Link>{" "}
            › Post
          </>
        )}
      </div>
      <h1 className="page-title">
        {editing
          ? "Edit listing"
          : isGive
            ? "Post an item to give"
            : "Post a request for help"}
      </h1>
      <p className="subtext">
        {isGive
          ? "Share the details so people who need it can reach you."
          : "Tell the community what you need."}
      </p>
      {error && (
        <div className="form-alert" role="alert">
          {error}
        </div>
      )}
      <form className="panel form-panel" onSubmit={submit}>
        <div
          className="type-switch"
          role="radiogroup"
          aria-label="Listing type"
        >
          {[
            ["give", "I want to give"],
            ["need", "I need help"],
          ].map(([v, l]) => (
            <button
              type="button"
              key={v}
              role="radio"
              aria-checked={type === v}
              className={type === v ? "active" : ""}
              onClick={() => setType(v)}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="form-grid">
          <div>
            <Field label="Title *">
              <input
                name="title"
                value={form.title}
                onChange={change}
                minLength="3"
                maxLength="120"
                required
                placeholder={
                  isGive
                    ? "e.g. Class 10 Science Books"
                    : "e.g. Need school books for Class 10"
                }
              />
            </Field>
            <Field label="Category *">
              <select name="category" value={form.category} onChange={change}>
                {CATS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.emoji} {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Description *" hint="At least 10 characters.">
              <textarea
                name="description"
                value={form.description}
                onChange={change}
                minLength="10"
                maxLength="5000"
                required
                placeholder={
                  isGive
                    ? "Describe the item, condition, size, etc."
                    : "Describe what you need, quantity and useful details."
                }
              />
            </Field>
            <div className="form-grid tight">
              <Field label={isGive ? "Condition" : "Condition preference"}>
                <select
                  name="conditionLabel"
                  value={form.conditionLabel}
                  onChange={change}
                >
                  {["Good", "New", "Usable", "Any", "Urgent"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </Field>
              <Field label="Quantity">
                <input
                  name="quantity"
                  value={form.quantity}
                  onChange={change}
                  maxLength="80"
                />
              </Field>
            </div>
          </div>
          <div>
            <Field
              label="Image URL (optional)"
              hint="Paste a public https:// link to a photo."
            >
              <input
                type="url"
                name="imageUrl"
                value={form.imageUrl}
                onChange={change}
                placeholder="https://example.com/photo.jpg"
              />
            </Field>
            {form.imageUrl && /^https?:\/\//i.test(form.imageUrl) && (
              <img
                className="form-preview"
                src={form.imageUrl}
                alt="Preview of the listing photo"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
                onLoad={(e) => {
                  e.currentTarget.style.display = "";
                }}
              />
            )}
            <Field label="Location *">
              <input
                name="location"
                value={form.location}
                onChange={change}
                required
                minLength="2"
                maxLength="180"
                placeholder="City, state"
              />
            </Field>
            <div className="notice">
              <ShieldCheck size={16} /> Your contact details are not shown
              publicly. Coordinate safely through messages.
            </div>
            {!editing && (
              <label className="checkline">
                <input type="checkbox" required /> I agree to the community
                guidelines
              </label>
            )}
          </div>
        </div>
        <div className="form-actions">
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => navigate(-1)}
          >
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy
              ? "Saving…"
              : editing
                ? "Save changes"
                : isGive
                  ? "Publish item"
                  : "Publish request"}
          </button>
        </div>
      </form>
    </>
  );
}

// ───────────────────────── Browse ─────────────────────────

export function Browse() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") || "");
  const debounced = useDebounced(query.trim(), 350);
  const cat = params.get("category") || "all";
  const type = params.get("type") || "all";
  const [listings, setListings] = useState([]);
  const [state, setState] = useState("loading");
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  // A search started elsewhere (e.g. the dashboard topbar) updates the box.
  const urlQ = params.get("q") || "";
  useEffect(() => {
    if (urlQ !== debounced)
      setQuery(urlQ); /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [urlQ]);

  // Keep ?q= in the URL in sync with the (debounced) search box.
  useEffect(() => {
    const p = new URLSearchParams(params);
    if (debounced) p.set("q", debounced);
    else p.delete("q");
    if (p.toString() !== params.toString()) setParams(p, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  useEffect(() => {
    const ctrl = new AbortController(); // cancel stale requests (F-11)
    setState("loading");
    const qs = new URLSearchParams();
    if (cat !== "all") qs.set("category", cat);
    if (type !== "all") qs.set("type", type);
    if (debounced) qs.set("q", debounced);
    api(`/listings?${qs}`, { signal: ctrl.signal })
      .then((d) => {
        setListings(d.listings || []);
        setState("ready");
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setError(e.message);
          setState("error");
        }
      });
    return () => ctrl.abort();
  }, [cat, type, debounced, reload]);

  function setFilter(key, value) {
    const p = new URLSearchParams(params);
    if (value === "all") p.delete(key);
    else p.set(key, value);
    setParams(p);
  }

  return (
    <>
      <div className="breadcrumbs">
        <Link to="/">Home</Link> › Explore
      </div>
      <h1 className="page-title">
        {cat === "all" ? "Browse community listings" : category(cat).name}
      </h1>
      <p className="subtext">
        Find free items and community requests around you.
      </p>
      <div className="browse-layout">
        <aside className="sidebar-panel" aria-label="Filters">
          <h3>Categories</h3>
          <button
            className={`side-link side-button ${cat === "all" ? "active" : ""}`}
            onClick={() => setFilter("category", "all")}
          >
            All categories
          </button>
          {CATS.map((c) => (
            <button
              key={c.id}
              className={`side-link side-button ${cat === c.id ? "active" : ""}`}
              onClick={() => setFilter("category", c.id)}
            >
              {c.emoji} {c.name}
            </button>
          ))}
          <hr />
          <h3>Listing type</h3>
          {[
            ["all", "All posts"],
            ["give", "Give (free)"],
            ["need", "Need help"],
          ].map(([v, l]) => (
            <button
              key={v}
              className={`side-link side-button ${type === v ? "active" : ""}`}
              onClick={() => setFilter("type", v)}
            >
              {l}
            </button>
          ))}
        </aside>
        <section>
          <div className="browse-toolbar">
            <strong aria-live="polite">
              {state === "loading"
                ? "Loading…"
                : state === "ready"
                  ? `${listings.length} listing${listings.length === 1 ? "" : "s"}`
                  : ""}
            </strong>
            <div className="searchbar compact">
              <Search size={17} aria-hidden="true" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search listings..."
                aria-label="Search listings"
              />
              {query && (
                <button
                  type="button"
                  className="clear-btn"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                >
                  <X size={15} />
                </button>
              )}
            </div>
          </div>
          {state === "loading" ? (
            <Loading label="Loading listings…" />
          ) : state === "error" ? (
            <ErrorState
              message={error}
              onRetry={() => setReload((r) => r + 1)}
            />
          ) : listings.length ? (
            <div className="listing-grid">
              {listings.map((item) => (
                <ListingCard key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <Empty
              title="No listings match"
              message="Try another category or search word, or be the first to post."
              action={
                <Link className="btn btn-primary" to="/post/give">
                  Post an item
                </Link>
              }
            />
          )}
        </section>
      </div>
    </>
  );
}

// ───────────────────────── Listing detail ─────────────────────────

export function ListingDetail() {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [contacting, setContacting] = useState(false);
  const { user, notify, savedIds, toggleSave } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    setLoading(true);
    setError("");
    setItem(null);
    const ctrl = new AbortController();
    api(`/listings/${id}`, { signal: ctrl.signal })
      .then((d) => setItem(d.listing))
      .catch((e) => {
        if (e.name !== "AbortError")
          setError(e.status === 404 || e.status === 400 ? "" : e.message);
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [id]);

  async function contact() {
    if (!user) {
      navigate("/login", { state: { from: `/item/${id}` } });
      return;
    }
    setContacting(true);
    try {
      const d = await api("/conversations", {
        method: "POST",
        body: { listingId: item.id },
      });
      navigate(`/dashboard/messages?conversation=${d.conversationId}`);
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setContacting(false);
    }
  }
  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} />;
  if (!item)
    return (
      <Empty
        title="Listing not found"
        message="It may have been removed or completed."
        action={
          <Link className="btn btn-primary" to="/categories">
            Browse listings
          </Link>
        }
      />
    );
  const c = category(item.category);
  const mine = user && Number(item.userId) === Number(user.id);
  const saved = savedIds.has(Number(item.id));
  return (
    <>
      <div className="breadcrumbs">
        <Link to="/categories">Explore</Link> ›{" "}
        <Link to={`/categories?category=${item.category}`}>{c.name}</Link> ›{" "}
        {item.title}
      </div>
      <div className="detail-grid">
        <div>
          <img
            className="detail-main-image"
            src={listingImage(item)}
            alt={item.title}
            onError={onImageError}
          />
        </div>
        <section>
          <span className={`tag ${item.type === "need" ? "need" : ""}`}>
            {item.type === "need" ? "Needs help" : "Free to give"}
          </span>
          {item.status === "completed" && (
            <span className="tag done">Completed</span>
          )}
          <h1 className="page-title">{item.title}</h1>
          <div className="detail-price">
            {item.type === "give"
              ? "Free for someone who needs it"
              : "Community request"}
          </div>
          <p className="item-meta">
            <MapPin size={14} /> {item.location} · Posted{" "}
            {dateLabel(item.createdAt)}
          </p>
          <p className="detail-description">{item.description}</p>
          <div className="panel spec-panel">
            <p>
              <strong>Category</strong>
              <span>
                {c.emoji} {c.name}
              </span>
            </p>
            <p>
              <strong>Condition</strong>
              <span>{item.conditionLabel}</span>
            </p>
            <p>
              <strong>Quantity</strong>
              <span>{item.quantity}</span>
            </p>
          </div>
          <div className="profile-card">
            <div className="avatar">
              {(item.ownerName || "C").charAt(0).toUpperCase()}
            </div>
            <div>
              <strong>
                {mine ? "You" : item.ownerName || "Community member"}
              </strong>
              <div className="item-meta">Verified Sahayog member</div>
            </div>
          </div>
          <div className="detail-actions">
            {mine ? (
              <>
                <Link
                  className="btn btn-primary"
                  to={`/dashboard/listings/${item.id}/edit`}
                >
                  <Pencil size={16} /> Edit listing
                </Link>
                <Link className="btn btn-outline" to="/dashboard/listings">
                  Manage my listings
                </Link>
              </>
            ) : (
              <>
                {item.status === "active" && (
                  <button
                    className="btn btn-primary"
                    onClick={contact}
                    disabled={contacting}
                  >
                    <MessageCircle size={17} />{" "}
                    {item.type === "give"
                      ? "Message the donor"
                      : "Offer to help"}
                  </button>
                )}
                <button
                  className="btn btn-outline"
                  onClick={() =>
                    user
                      ? toggleSave(Number(item.id))
                      : navigate("/login", { state: { from: `/item/${id}` } })
                  }
                  aria-pressed={saved}
                >
                  <Heart size={16} fill={saved ? "currentColor" : "none"} />{" "}
                  {saved ? "Saved" : "Save"}
                </button>
              </>
            )}
          </div>
          <div className="notice">
            <ShieldCheck size={16} /> Arrange handovers safely. Never share
            passwords or banking details.
          </div>
        </section>
      </div>
    </>
  );
}

// ───────────────────────── Static pages ─────────────────────────

export function HowItWorks() {
  return (
    <>
      <h1 className="page-title">How Sahayog works</h1>
      <p className="subtext">Helping each other is simple, fast and free.</p>
      <Steps />
      <div className="notice large-notice">
        <ShieldCheck size={18} /> Always meet in a safe public place, protect
        personal information, and report suspicious behaviour.
      </div>
      <div className="banner">
        <div>
          <h2>Ready to make a difference?</h2>
          <p>Start with one small act of kindness.</p>
        </div>
        <Link className="btn btn-primary" to="/give">
          Get started <ArrowRight size={16} />
        </Link>
      </div>
    </>
  );
}
export function About() {
  return (
    <>
      <h1 className="page-title">About Sahayog</h1>
      <p className="subtext">Give · Receive · Be Kind</p>
      <div className="about-panel">
        <div className="about-icon">
          <HeartHandshake size={48} />
        </div>
        <h2>Small acts. Stronger communities.</h2>
        <p>
          Sahayog is a community sharing platform where people can give useful
          items or ask for help without payment. Our goal is to make giving
          easier, receiving help more dignified, and local communities more
          connected.
        </p>
        <div className="steps">
          {[
            ["💗", "Kindness", "Help without expecting money."],
            ["🤝", "Respect", "Every person deserves dignity."],
            ["🌱", "Community", "Make useful things go further."],
            ["🛡️", "Safety", "Share responsibly and carefully."],
          ].map(([i, t, d]) => (
            <div className="step" key={t}>
              <span className="step-icon">{i}</span>
              <h3>{t}</h3>
              <p>{d}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
export function NotFound() {
  return (
    <Empty
      title="Page not found"
      message="This page may have moved."
      action={
        <Link className="btn btn-primary" to="/">
          Go home
        </Link>
      }
    />
  );
}
