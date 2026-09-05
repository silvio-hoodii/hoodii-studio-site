import WalledLink from '@/components/WalledLink';
import KitchenNav from '../KitchenNav';
import { wantByName, wantByUrl, nameOfItem, type WantHit } from '@/lib/kitchen/want';
import { isAuthed } from '@/lib/auth-server';
import { thumb } from '@/lib/kitchen/corpus';
import PasteBox from './PasteBox';

export const dynamic = 'force-dynamic';

/* "I want X. What do I need?"
 *
 * The find page answers "what can I cook", which is the fridge's question. This answers HIS question,
 * asked on 2026-08-12: "I want a stroganoff beef. I know I don't have beef... I want this. What do I
 * need to make it?" Nothing in the app could answer that, because everything ranked by what the fridge
 * already supported, so anything needing a shop was unreachable.
 *
 * It also gives /kitchen/find rows somewhere to go. Until now every row linked off the site and nothing
 * on the page constituted picking a dish.
 *
 * Paste a URL and it reads that page live. That is the route for NYT Cooking and Maangchi, which both
 * ask AI crawlers not to harvest them and which we therefore do not harvest. One page he hands over, to
 * answer a question he asked about a dish he means to cook, is him using an agent as a browser.
 *
 * THE URL HALF NEEDS THE UNLOCK COOKIE since 2026-08-28, and only that half. "One page HE hands us"
 * was the argument for the feature and it was doing something else: an anonymous arbitrary-URL
 * server-side fetch off a public page whose `?url=` hrefs are crawlable. 15,367 invocations during
 * the meta-externalagent scrape. The refusal lives in `wantByUrl` itself, not here, so no future call
 * site can reintroduce it; this page only has to say so honestly. Search by name stays public.
 */

function Ingredients({ hit, label }: { hit: WantHit; label: (id: string) => string }) {
  const s = hit.score;
  return (
    <>
      {s.missing.length > 0 && (
        <div className="box warn" style={{ marginTop: 14 }}>
          <span className="k">You would need to buy {s.missing.length}</span>
          {s.missing.map((m, k) => (
            <div key={k} style={{ marginBottom: 6 }}>
              <b>{m.item ? label(m.item) : m.shown}</b>
              <span className="quiet"> for &ldquo;{m.line.trim()}&rdquo;</span>
              {m.note && <div className="quiet">{m.note}</div>}
            </div>
          ))}
        </div>
      )}

      {s.haveVia.length > 0 && (
        <div className="box look" style={{ marginTop: 14 }}>
          <span className="k">Covered by something you own</span>
          {s.haveVia.map((v, k) => (
            <div key={k} style={{ marginBottom: 6 }}>
              <b>{v.item ? label(v.item) : v.shown}</b> via your {v.via}
              {v.note && <div className="quiet">{v.note}</div>}
            </div>
          ))}
        </div>
      )}

      {s.have.length > 0 && (
        <div className="box done" style={{ marginTop: 14 }}>
          <span className="k">Already here, {s.have.length}</span>
          <div>{s.have.map((h) => (h.item ? label(h.item) : h.shown)).join(', ')}</div>
        </div>
      )}

      {/* Same omission as the dish rows had: the recipe's own optional lines were computed and never
          shown, so a dish could be cookable "despite" an ingredient he does not have with nothing
          explaining why. */}
      {s.optional.length > 0 && (
        <div className="box look" style={{ marginTop: 14 }}>
          <span className="k">The recipe says you can skip these</span>
          <div>{s.optional.map((o) => (o.item ? label(o.item) : o.shown)).join(', ')}</div>
        </div>
      )}

      {s.unknown.length > 0 && (
        <div className="box look" style={{ marginTop: 14 }}>
          <span className="k">Our list does not recognise these, {s.unknown.length}</span>
          <div>{s.unknown.map((u) => u.shown || u.line.trim()).join(', ')}</div>
          <div className="lede" style={{ marginTop: 4 }}>
            Not missing, just unrecognised. Check these yourself.
          </div>
        </div>
      )}

      <details className="devs" style={{ marginTop: 14 }}>
        <summary>The full ingredient list as published ({hit.ingredients.length})</summary>
        {hit.ingredients.map((line, k) => <div className="dev" key={k}><span>{line.trim()}</span></div>)}
      </details>
    </>
  );
}

function Verdict({ hit }: { hit: WantHit }) {
  const n = hit.score.missing.length;
  if (n === 0) return <span className="live">You can make this now</span>;
  return <span><b>{n}</b> thing{n === 1 ? '' : 's'} to buy</span>;
}

export default async function Want({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; url?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? '').trim();
  const url = (sp.url ?? '').trim();

  const unlocked = await isAuthed();
  const byUrl = url ? await wantByUrl(url) : null;
  const byName = !url && q ? await wantByName(q) : null;
  const stock = byUrl?.stock ?? byName?.stock ?? null;
  const label = (id: string) => (stock ? nameOfItem(stock, id) : id);

  return (
    <div className="wrap">
      <KitchenNav here="want" />
      <h1>What would I need?</h1>
      <p className="lede">
        Name a dish, or paste a recipe link. You get told what is short.
      </p>

      <div className="filters">
        <form action="/kitchen/want" method="get" className="searchrow">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="beef stroganoff"
            aria-label="Name a dish you want to make"
            enterKeyHint="search"
          />
          <button type="submit" className="primary">Check</button>
        </form>
        {/* Honest states only, which on this site means a control that cannot work does not render
            as a control. A locked device gets told what the field would do and where the password
            is, rather than a box that answers "unlock this first" after being typed into. */}
        {unlocked ? (
          <form action="/kitchen/want" method="get" className="searchrow" style={{ marginTop: 8 }}>
            <input
              type="url"
              name="url"
              defaultValue={url}
              placeholder="or paste a recipe link, including one behind your own subscription"
              aria-label="Paste a recipe web address"
              enterKeyHint="go"
            />
            <button type="submit" className="primary">Read it</button>
          </form>
        ) : (
          <p className="lede" style={{ marginTop: 10 }}>
            Reading a link you point at is the one thing here that needs the device unlocked, because
            it fetches that page from this server. <WalledLink href="/login?to=/kitchen/want">Unlock</WalledLink>{' '}
            to use it. Searching by name is open to anyone.
          </p>
        )}
        <PasteBox />
      </div>

      <hr className="divider" />

      {byUrl?.error && (
        <div className="box warn" style={{ marginTop: 18 }}>
          <span className="k">{byUrl.locked ? 'This device is locked' : 'Could not read that page'}</span>
          <div>{byUrl.error}</div>
          {byUrl.locked && (
            <div style={{ marginTop: 6 }}>
              <WalledLink href={`/login?to=${encodeURIComponent(`/kitchen/want?url=${url}`)}`}>
                Unlock and read it
              </WalledLink>
            </div>
          )}
        </div>
      )}

      {byUrl?.hit && (
        <>
          <p className="count" style={{ marginTop: 22 }}>{byUrl.hit.provider}</p>
          <h2 style={{ marginTop: 4 }}>
            <a href={byUrl.hit.source!} target="_blank" rel="noreferrer">{byUrl.hit.name}</a>
          </h2>
          <p className="quiet" style={{ marginTop: 4 }}><Verdict hit={byUrl.hit} /></p>
          <Ingredients hit={byUrl.hit} label={label} />
        </>
      )}

      {byName && byName.hits.length === 0 && (
        <p className="count" style={{ marginTop: 22 }}>
          nothing in the corpus called that. Paste a link to it instead and it will be read live.
        </p>
      )}

      {byName && byName.hits.length > 0 && (
        <>
          <p className="count" style={{ marginTop: 22 }}>
            {byName.hits.length} match{byName.hits.length === 1 ? '' : 'es'} for &ldquo;{q}&rdquo;
          </p>
          <ul className="meallist">
            {byName.hits.map((h, k) => {
              const t = thumb(h.image);
              const n = h.score.missing.length;
              return (
                <li className="mealrow" key={k}>
                  {t
                    ? <img className="mealthumb" src={t} alt={h.name} loading="lazy" width={56} height={56} />
                    : <div className="mealthumb" />}
                  <div className="mealbody">
                    <div className="mealtop">
                      {/* Locked devices get the publisher's own page instead of a `?url=` link that
                          would only tell them to unlock. It is also where the crawlable `?url=`
                          space came from: those hrefs are what turned this page into 15,367
                          invocations, and they are now rendered only for a device that can use
                          them. */}
                      {unlocked ? (
                        <WalledLink href={`/kitchen/want?url=${encodeURIComponent(h.source ?? '')}`}>
                          <b>{h.name}</b>
                        </WalledLink>
                      ) : h.source ? (
                        <a href={h.source} target="_blank" rel="noreferrer nofollow">
                          <b>{h.name}</b>
                        </a>
                      ) : (
                        <b>{h.name}</b>
                      )}
                      <span className={`v ${n === 0 ? 'ok' : ''}`}>{n === 0 ? 'can make now' : `buy ${n}`}</span>
                    </div>
                    <div className="mealmeta">
                      {[h.area, h.category, h.provider].filter(Boolean).join(' · ')}
                    </div>
                    {n > 0 && (
                      <div className="mealmiss">
                        need {h.score.missing.map((m) => (m.item ? label(m.item) : m.shown)).join(', ')}
                      </div>
                    )}
                    {h.score.haveVia.length > 0 && (
                      <div className="mealvia">
                        {h.score.haveVia.map((v) => `${v.item ? label(v.item) : v.shown} via your ${v.via}`).join(' · ')}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="lede" style={{ marginTop: 10 }}>
            Tap one to see the full list and exactly what is short.
          </p>
        </>
      )}

      {!q && !url && (
        <>
          <p className="count" style={{ marginTop: 22 }}>Try one of these</p>
          <ul className="plainlist">
            {['beef stroganoff', 'spaghetti bolognese', 'lasagne', 'chicken curry', 'fried rice', 'meatballs'].map((x) => (
              <li key={x}>
                <WalledLink href={`/kitchen/want?q=${encodeURIComponent(x)}`}>{x}</WalledLink>
              </li>
            ))}
          </ul>
          {unlocked && (
            <p className="lede" style={{ marginTop: 14 }}>
              A pasted link works for sites this app will not crawl, like NYT Cooking or Serious Eats.
            </p>
          )}
        </>
      )}
    </div>
  );
}
