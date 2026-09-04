/* REGRESSION SUITE FOR THE LOGIN RETURN PATH.
 *
 *   node --experimental-strip-types src/lib/return-to.test.ts
 *
 * WHY THIS FILE EXISTS. Two reasons, and they pull in opposite directions, which is the whole
 * difficulty of the function it tests.
 *
 * The BUG being fixed (A3 of the 2026-09-04 audit) was a guard that was too STRICT: four login
 * pages each checked `to.startsWith('/kitchen')` or their own app's prefix, so signing in from
 * /reading/shelf with a correct password dumped him in the kitchen, two apps away from the book he
 * was about to save. Loosening a redirect guard is how open redirects get introduced, so the
 * must-REJECT half of this file is the half that matters, and it is written first.
 *
 * The thing on the other side of this form is the ONLY credential on the site: one password, one
 * cookie, a year long, gating every write route. A login form that can be made to bounce someone
 * to another origin is worth more to an attacker here than on a site with accounts.
 *
 * `/` + `\` IS THE CASE PEOPLE FORGET. WHATWG URL parsing treats a backslash as equivalent to a
 * slash in the authority position, so `/\evil.example` is protocol-relative and navigates OFF SITE
 * in every current browser, while sailing past a `startsWith('//')` check. It is asserted here
 * because a reviewer reading the function should see that it was considered rather than trust that
 * it was.
 */
import { safeReturnTo, returnToLabel, DEFAULT_RETURN_TO } from './return-to.ts';

let failed = 0;

function eq(name: string, got: unknown, want: unknown) {
  if (got === want) {
    console.log(`ok    ${name}`);
    return;
  }
  failed++;
  console.log(
    `FAIL  ${name}\n        expected ${JSON.stringify(want)}\n        got      ${JSON.stringify(got)}`,
  );
}

const TAB = String.fromCharCode(9);
const NEWLINE = String.fromCharCode(10);
const NUL = String.fromCharCode(0);

/* ---- must REJECT: anything that could leave this origin -------------------------------------- */

eq('an absolute http url', safeReturnTo('https://evil.example'), DEFAULT_RETURN_TO);
eq('a scheme-less host', safeReturnTo('evil.example'), DEFAULT_RETURN_TO);
eq('a javascript url', safeReturnTo('javascript:alert(1)'), DEFAULT_RETURN_TO);
eq('a data url', safeReturnTo('data:text/html,x'), DEFAULT_RETURN_TO);
eq('protocol-relative, two slashes', safeReturnTo('//evil.example'), DEFAULT_RETURN_TO);
eq('protocol-relative, three slashes', safeReturnTo('///evil.example'), DEFAULT_RETURN_TO);
/* The one people forget. '/\\' in source is the two characters / and backslash. */
eq('protocol-relative, backslash', safeReturnTo('/\\evil.example'), DEFAULT_RETURN_TO);
eq('backslash and slash', safeReturnTo('/\\/evil.example'), DEFAULT_RETURN_TO);
eq('a tab smuggling a host', safeReturnTo('/' + TAB + '/evil.example'), DEFAULT_RETURN_TO);
eq('a newline smuggling a host', safeReturnTo('/' + NEWLINE + '/evil.example'), DEFAULT_RETURN_TO);
eq('a space smuggling a host', safeReturnTo('/ /evil.example'), DEFAULT_RETURN_TO);
eq('a NUL byte', safeReturnTo('/kitchen' + NUL + '.evil.example'), DEFAULT_RETURN_TO);
eq('a leading space before the slash', safeReturnTo(' /kitchen'), DEFAULT_RETURN_TO);

/* ---- must REJECT: not a usable value at all --------------------------------------------------- */

eq('an empty string', safeReturnTo(''), DEFAULT_RETURN_TO);
eq('undefined', safeReturnTo(undefined), DEFAULT_RETURN_TO);
eq('null', safeReturnTo(null), DEFAULT_RETURN_TO);
eq('an array, as a repeated query param arrives', safeReturnTo(['/kitchen']), DEFAULT_RETURN_TO);
eq('a number', safeReturnTo(42), DEFAULT_RETURN_TO);

/* ---- must ACCEPT: this is the half the four prefix checks got wrong --------------------------- */

eq('the shelf, which was the actual bug', safeReturnTo('/reading/shelf'), '/reading/shelf');
eq('the kitchen front door', safeReturnTo('/kitchen'), '/kitchen');
eq('a dish page', safeReturnTo('/kitchen/piccata'), '/kitchen/piccata');
eq('a path with a query', safeReturnTo('/health?s=volume'), '/health?s=volume');
eq('a path with an encoded query', safeReturnTo('/kitchen/want?url=https%3A%2F%2Fx.dev'), '/kitchen/want?url=https%3A%2F%2Fx.dev');
eq('a swim sub-tab, an app that never had a login page', safeReturnTo('/swim?s=how'), '/swim?s=how');
eq('the hub itself', safeReturnTo('/'), '/');
eq('a fragment', safeReturnTo('/reading/about#score'), '/reading/about#score');
/* An explicit fallback overrides the default, which is what lets the form keep its own idea of
   where "back" is when there is no `to` at all. */
eq('an explicit fallback is honoured', safeReturnTo('', '/kitchen'), '/kitchen');
eq('a rejected value uses the explicit fallback', safeReturnTo('//evil.example', '/kitchen'), '/kitchen');

/* ---- the eyebrow, which is derived rather than mapped ---------------------------------------- */

eq('kitchen', returnToLabel('/kitchen'), 'Kitchen');
eq('gym', returnToLabel('/gym'), 'Gym');
eq('health', returnToLabel('/health'), 'Health');
eq('french', returnToLabel('/french'), 'French');
/* The four above are exactly the labels the four deleted login pages hardcoded. The two below are
   the ones a hand-kept map would have been missing, which is the argument for deriving it. */
eq('reading, from a sub-path', returnToLabel('/reading/shelf'), 'Reading');
eq('swim, which never had a login page', returnToLabel('/swim?s=how'), 'Swim');
eq('a segment with a query stuck to it', returnToLabel('/health?s=volume'), 'Health');
eq('the hub has no app name', returnToLabel('/'), null);
eq('an empty path', returnToLabel(''), null);
/* Must not title a slug: "12-Rules-For-Life" over a password field would be nonsense. */
eq('a book slug is not an app', returnToLabel('/reading/12-rules-for-life'), 'Reading');
eq('a numeric first segment', returnToLabel('/2026/report'), null);
eq('a hyphenated first segment', returnToLabel('/some-thing/x'), null);

console.log('-'.repeat(70));
if (failed) {
  console.log(`${failed} case(s) failed.`);
  process.exit(1);
}
console.log('return-to: all cases passed.');
