import Link from 'next/link';

// Like the real app: the call to action is a link styled as a button, its
// accessible name (aria-label) differs from its visible text, and there's a
// second, hidden copy for small screens.
export default function Home() {
  return (
    <>
      <h1>Renew your permit online</h1>
      <p>You can renew online if your current permit was issued in the last 5 years.</p>
      <Link href="/onboarding/what-you-need/" className="button mobile-only" aria-label="Start permit renewal application">
        Get Started
      </Link>
      <Link href="/onboarding/what-you-need/" className="button desktop-only" aria-label="Start permit renewal application">
        Get Started
      </Link>
    </>
  );
}
