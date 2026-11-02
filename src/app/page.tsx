import './hub.css';

export const metadata = { alternates: { canonical: '/' } };

/* STATIC, AND IT STAYS STATIC. Stripped on 2026-11-02 on his ruling ("hoodii studio as a whole has not
 * been used"). This page reads no database and makes no network call at render, so a crawler that
 * fetches it again and again costs nothing and wakes nothing. It used to be rebuilt from data, and
 * a failing source kept it re-running about thirty queries on every request. Do not give it data
 * again. docs/agents/removed.md says what else stays off it. */
const person = {
  '@context': 'https://schema.org',
  '@type': 'Person',
  name: 'Silvio Neyra',
  url: 'https://hoodii.studio',
  email: 'mailto:silvio@hoodii.studio',
  sameAs: ['https://github.com/silvio-hoodii', 'https://linkedin.com/in/silvio-neyra-rivas'],
};

export default function Home() {
  return (
    <main className="idx">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(person) }} />
      <h1>Silvio Neyra</h1>
      <p className="go"><a href="/gym">Gym</a></p>
    </main>
  );
}