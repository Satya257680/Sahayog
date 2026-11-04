import React from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth, RequireAuth, GuestOnly, FullPageLoader } from './auth';
import { PublicLayout, Landing, GiveNeed, ListingForm, Browse, ListingDetail, HowItWorks, About, NotFound } from './pages/PublicPages';
import { LoginPage, SignupPage, ForgotPasswordPage, AuthCallback } from './pages/AuthPages';
import AppShell from './pages/AppShell';
import { DashboardHome, MyListings, SavedPage, MessagesPage, ProfilePage } from './pages/DashboardPages';

/** Shared pages (Explore, listing detail, Give/Need…) open inside the dashboard shell when signed in. */
function AdaptiveLayout() {
  const { user, ready } = useAuth();
  if (!ready) return <FullPageLoader />;
  return user ? <AppShell /> : <PublicLayout />;
}

/** The landing page is for visitors; signed-in members land on their dashboard. */
function LandingRoute() {
  const { user, ready } = useAuth();
  if (!ready) return <FullPageLoader />;
  return user ? <Navigate to="/dashboard" replace /> : <Landing />;
}

/** Keeps old links (/saved, /messages, /register) working. */
function Redirect({ to }) {
  const { search } = useLocation();
  return <Navigate to={`${to}${search}`} replace />;
}

export default function App() {
  return <Routes>
    {/* Authentication */}
    <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
    <Route path="/signup" element={<GuestOnly><SignupPage /></GuestOnly>} />
    <Route path="/register" element={<Redirect to="/signup" />} />
    <Route path="/forgot-password" element={<GuestOnly><ForgotPasswordPage /></GuestOnly>} />
    <Route path="/auth/callback" element={<AuthCallback />} />

    {/* Visitor pages */}
    <Route element={<PublicLayout />}>
      <Route path="/" element={<LandingRoute />} />
    </Route>

    {/* Pages that work for visitors and members */}
    <Route element={<AdaptiveLayout />}>
      <Route path="/give" element={<GiveNeed type="give" />} />
      <Route path="/need" element={<GiveNeed type="need" />} />
      <Route path="/categories" element={<Browse />} />
      <Route path="/item/:id" element={<ListingDetail />} />
      <Route path="/how-it-works" element={<HowItWorks />} />
      <Route path="/about" element={<About />} />
      <Route path="/post/:type" element={<RequireAuth><ListingForm /></RequireAuth>} />
      <Route path="*" element={<NotFound />} />
    </Route>

    {/* Member dashboard */}
    <Route element={<RequireAuth><AppShell /></RequireAuth>}>
      <Route path="/dashboard" element={<DashboardHome />} />
      <Route path="/dashboard/listings" element={<MyListings />} />
      <Route path="/dashboard/listings/:id/edit" element={<ListingForm mode="edit" />} />
      <Route path="/dashboard/saved" element={<SavedPage />} />
      <Route path="/dashboard/messages" element={<MessagesPage />} />
      <Route path="/dashboard/profile" element={<ProfilePage />} />
    </Route>
    <Route path="/saved" element={<Redirect to="/dashboard/saved" />} />
    <Route path="/messages" element={<Redirect to="/dashboard/messages" />} />
  </Routes>;
}

