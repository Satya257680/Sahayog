import React, { useEffect, useId, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, Shirt, Soup, Pill, Droplet, Heart, ArrowRight, MapPin } from 'lucide-react';
import { useAuth } from './auth';

export const CATS = [
  { id: 'books', name: 'School Books', icon: BookOpen, emoji: '📚', tint: 'pink', blurb: 'Learning materials' },
  { id: 'clothes', name: 'Clothes', icon: Shirt, emoji: '👕', tint: 'blue', blurb: 'Give or get clothes' },
  { id: 'food', name: 'Food', icon: Soup, emoji: '🍲', tint: 'orange', blurb: 'Give or get food' },
  { id: 'medicine', name: 'Medicine', icon: Pill, emoji: '💊', tint: 'green', blurb: 'Give or get medicine' },
  { id: 'blood', name: 'Blood', icon: Droplet, emoji: '🩸', tint: 'rose', blurb: 'Find or offer donors' },
  { id: 'other', name: 'Other Help', icon: Heart, emoji: '🧸', tint: 'violet', blurb: 'Support and essentials' }
];
export const FALLBACK_IMAGES = {
  books: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=900&q=80',
  clothes: 'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?auto=format&fit=crop&w=900&q=80',
  food: 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=80',
  medicine: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=900&q=80',
  blood: 'https://images.unsplash.com/photo-1615461066841-6116e61058f4?auto=format&fit=crop&w=900&q=80',
  other: 'https://images.unsplash.com/photo-1559454403-b8fb88521f11?auto=format&fit=crop&w=900&q=80'
};
export function category(id) { return CATS.find(c => c.id === id) || CATS[CATS.length - 1]; }
export function dateLabel(date) {
  if (!date) return '';
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
export function timeLabel(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
export function listingImage(item) { return item.imageUrl || FALLBACK_IMAGES[item.category] || FALLBACK_IMAGES.other; }
export function onImageError(e) { if (e.currentTarget.src !== FALLBACK_IMAGES.other) e.currentTarget.src = FALLBACK_IMAGES.other; }

/** Debounced value (F-11: search no longer fires a request on every keystroke). */
export function useDebounced(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const t = setTimeout(() => setDebounced(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return debounced;
}

/** Form field with a properly associated label and optional hint / error. */
export function Field({ label, hint, error, children, id: givenId }) {
  const autoId = useId();
  const id = givenId || autoId;
  const child = React.Children.only(children);
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
  return <div className={`field ${error ? 'has-error' : ''}`}>
    <label htmlFor={id}>{label}</label>
    {React.cloneElement(child, { id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
    {hint && <small id={`${id}-hint`}>{hint}</small>}
    {error && <small id={`${id}-error`} className="field-error">{error}</small>}
  </div>;
}

export function CategoryGrid({ onChoose }) {
  return <div className="category-grid">{CATS.map(c =>
    <button type="button" className="category-card" key={c.id} onClick={() => onChoose?.(c.id)}>
      <span className={`category-icon ${c.tint}`} aria-hidden="true">{c.emoji}</span>
      <span><strong>{c.name}</strong><small>{c.blurb}</small></span>
      <ArrowRight className="category-arrow" size={16} aria-hidden="true" />
    </button>)}
  </div>;
}

export function ListingCard({ item, onUnsave }) {
  const { user, savedIds, toggleSave } = useAuth();
  const navigate = useNavigate();
  const c = category(item.category);
  const saved = savedIds.has(Number(item.id));
  const mine = user && Number(item.userId) === Number(user.id);
  async function onHeart() {
    if (!user) { navigate('/login', { state: { from: `/item/${item.id}` } }); return; }
    const nowSaved = await toggleSave(Number(item.id));
    if (!nowSaved) onUnsave?.(item.id);
  }
  return <article className="item-card">
    <Link to={`/item/${item.id}`} tabIndex={-1} aria-hidden="true"><img className="item-image" src={listingImage(item)} alt="" loading="lazy" onError={onImageError} /></Link>
    <div className="item-body">
      <div className="card-top">
        <span className={`tag ${item.type === 'need' ? 'need' : ''}`}>{item.type === 'need' ? 'Needs help' : 'Free to give'}</span>
        {!mine && <button type="button" className={`heart-btn ${saved ? 'is-saved' : ''}`} onClick={onHeart} aria-pressed={saved} aria-label={saved ? `Remove ${item.title} from saved` : `Save ${item.title}`}><Heart size={17} fill={saved ? 'currentColor' : 'none'} /></button>}
      </div>
      <Link to={`/item/${item.id}`}><h3 className="item-title">{item.title}</h3></Link>
      <p className="item-meta">{c.emoji} {c.name} · {item.conditionLabel || 'Good'}</p>
      <p className="item-meta"><MapPin size={13} aria-hidden="true" /> {item.location}</p>
      <div className="card-bottom"><small>{mine ? 'Your listing' : `By ${item.ownerName || 'Community member'}`}</small><Link className="btn btn-primary btn-small" to={`/item/${item.id}`}>View</Link></div>
    </div>
  </article>;
}

export function Steps() {
  const steps = [['👤', 'Join the community', 'Create a free account in minutes.'], ['🎁', 'Give or ask', 'Post something you can give or need.'], ['💬', 'Connect safely', 'Message the person and arrange details.'], ['💗', 'Make a difference', 'Complete the exchange and spread kindness.']];
  return <ol className="steps">{steps.map(s => <li className="step" key={s[1]}><div className="step-icon" aria-hidden="true">{s[0]}</div><h3>{s[1]}</h3><p>{s[2]}</p></li>)}</ol>;
}

export function Loading({ label = 'Loading…' }) { return <div className="loading" role="status"><span className="spinner" /> {label}</div>; }
export function Empty({ title, message, action, icon = '💗' }) { return <div className="empty"><div className="empty-icon" aria-hidden="true">{icon}</div><h3>{title}</h3><p>{message}</p>{action}</div>; }
export function ErrorState({ message, onRetry }) {
  return <div className="empty error-state" role="alert"><div className="empty-icon" aria-hidden="true">⚠️</div><h3>Couldn't load this</h3><p>{message}</p>{onRetry && <button type="button" className="btn btn-outline" onClick={onRetry}>Try again</button>}</div>;
}
