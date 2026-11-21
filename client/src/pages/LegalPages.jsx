import React, { useEffect } from "react";
import { Link } from "react-router-dom";

/*
 * Terms of Service and Privacy Policy linked from the sign-up form.
 * The text describes what the Sahayog code actually does today (data stored, cookies used).
 * IMPORTANT: have it reviewed by the company's legal adviser and fill in the contact address
 * before public launch. Update LAST_UPDATED whenever the text changes.
 */
const LAST_UPDATED = "19 November 2026";
const CONTACT = "the contact details published on this site";

function LegalLayout({ title, children }) {
  useEffect(() => {
    document.title = `${title} | Sahayog`;
    return () => {
      document.title = "Sahayog | Give · Receive · Be Kind";
    };
  }, [title]);
  return (
    <article className="legal">
      <h1 className="page-title">{title}</h1>
      <p className="subtext">Last updated: {LAST_UPDATED}</p>
      {children}
      <p className="legal-back">
        <Link to="/">← Back to Sahayog</Link>
      </p>
    </article>
  );
}

export function TermsPage() {
  return (
    <LegalLayout title="Terms of Service">
      <p>
        Sahayog is a free community platform where people offer things they no
        longer need and ask for things they do. By creating an account or using
        Sahayog you agree to these terms.
      </p>
      <h2>Your account</h2>
      <ul>
        <li>
          Give your real name and an email address you control. Keep your
          password private; you are responsible for activity on your account.
        </li>
        <li>
          You must be old enough to enter into this agreement where you live, or
          have a parent or guardian's permission.
        </li>
      </ul>
      <h2>Sharing kindly and safely</h2>
      <ul>
        <li>
          Only list items you are allowed to give away, and describe them
          honestly.
        </li>
        <li>
          Sahayog is free: do not sell items, ask for payment, or use the
          platform for advertising.
        </li>
        <li>
          Do not post anything illegal, unsafe, hateful, or misleading.
          Medicines, food and blood donations must follow local laws and medical
          guidance.
        </li>
        <li>
          Meet in safe, public places and use your own judgement. Sahayog
          introduces people but is not a party to any exchange.
        </li>
      </ul>
      <h2>Content and moderation</h2>
      <p>
        You keep ownership of what you post but allow Sahayog to display it on
        the platform. We may remove listings or messages, or suspend accounts,
        that break these terms.
      </p>
      <h2>No warranty</h2>
      <p>
        Sahayog is provided as-is. We do not inspect items or verify members and
        are not responsible for items exchanged between members, to the extent
        the law allows.
      </p>
      <h2>Changes and contact</h2>
      <p>
        We may update these terms and will change the date above when we do.
        Questions: use {CONTACT}.
      </p>
    </LegalLayout>
  );
}

export function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy">
      <p>This policy explains what Sahayog stores about you and why.</p>
      <h2>What we store</h2>
      <ul>
        <li>
          <strong>Account:</strong> your name, email address and a one-way hash
          of your password (we never store the password itself). Optionally your
          phone number, city and state if you add them to your profile.
        </li>
        <li>
          <strong>Activity:</strong> the listings you post, items you save, and
          messages you exchange with other members.
        </li>
        <li>
          <strong>Security records:</strong> sign-in and password-reset events
          with the IP address, used to protect accounts and prevent abuse.
        </li>
        <li>
          <strong>Password reset:</strong> when you ask to reset your password
          we email you a one-time link. We store only a scrambled (hashed) form
          of it, and it expires automatically.
        </li>
      </ul>
      <h2>Cookies</h2>
      <p>
        We use a secure, HttpOnly session cookie to keep you signed in, and a
        small companion cookie that only tells the site whether you are signed
        in. We do not use advertising or tracking cookies.
      </p>
      <h2>Who can see your information</h2>
      <p>
        Your name and listings are visible to other members. Your email address
        is not shown publicly. We do not sell your data. Emails are delivered
        through our email provider only to send you account messages.
      </p>
      <h2>Your choices</h2>
      <p>
        You can update your profile at any time. To have your account and data
        deleted, contact us using {CONTACT}.
      </p>
      <h2>Changes</h2>
      <p>We will update the date above when this policy changes.</p>
    </LegalLayout>
  );
}
