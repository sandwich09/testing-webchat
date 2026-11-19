// Links in an AI reply (ai-prompt section 6.1). LINE turns every URL into a tappable link, so a
// reply may only carry a link the admins themselves wrote in the knowledge base or the custom
// instructions.

/** Characters a URL may hold here. Thai text and spaces end a URL, as do quotes and angle brackets. */
const URL_CHARS = '[A-Za-z0-9\\-._~:/?#\\[\\]@!$&()*+,;=%]';
/** One DNS label, then a TLD of letters only, so prices (1.50), times (10.30) and versions never match. */
const DOMAIN = '(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\\.)+[A-Za-z]{2,24}';
/** Not right after a letter, digit, dot, hyphen or `@`, so the domain of an e-mail address never starts a link. */
const START = '(?<![A-Za-z0-9.@-])';

/** In a reply: a scheme URL, a `www.` host, or a bare domain followed by a path. */
const REPLY_LINK = new RegExp(
  `${START}(?:https?://${URL_CHARS}+|www\\.${URL_CHARS}+|${DOMAIN}/${URL_CHARS}*)`,
  'gi',
);
/** In the admins' own text: the same, plus a bare domain without a path, which widens what is allowed. */
const SOURCE_LINK = new RegExp(
  `${START}(?:https?://${URL_CHARS}+|www\\.${URL_CHARS}+|${DOMAIN}(?:/${URL_CHARS}*)?)`,
  'gi',
);

const TRAILING = new Set(['.', ',', ';', ':', '!', '?', "'", ')', ']', '}']);

/** Drops punctuation that ends the sentence rather than the URL, keeping a `)` that closes a `(`. */
const trimTrailing = (raw: string): string => {
  let url = raw;
  for (;;) {
    const last = url.at(-1);
    if (last === undefined || !TRAILING.has(last)) return url;
    if (last === ')' && url.split('(').length > url.split(')').length - 1) return url;
    url = url.slice(0, -1);
  }
};

/** Form used to compare two links: no scheme, no `www.`, no trailing slash, lower case. */
export const normalizeLink = (url: string): string =>
  trimTrailing(url)
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+(?=[?#]|$)/, '');

const linksOf = (text: string, pattern: RegExp): string[] =>
  [...text.matchAll(pattern)].map((m) => trimTrailing(m[0])).filter((url) => url !== '');

/** Every link of an AI reply, as written (without trailing punctuation). */
export const replyLinks = (reply: string): string[] => linksOf(reply, REPLY_LINK);

/** A normalized link and its host alone: the front page of a site the admins linked to is allowed. */
const withHost = (normalized: string): string[] => {
  const host = normalized.split(/[/?#]/, 1)[0] ?? normalized;
  return host === normalized ? [normalized] : [normalized, host];
};

/**
 * The links of `reply` that appear in none of `sources` (knowledge text, custom instructions),
 * compared by normalizeLink. An empty array means the reply may be sent as it is.
 */
export const disallowedLinks = (reply: string, sources: readonly string[]): string[] => {
  const found = replyLinks(reply);
  if (found.length === 0) return [];
  const allowed = new Set(
    sources.flatMap((s) => linksOf(s, SOURCE_LINK)).flatMap((url) => withHost(normalizeLink(url))),
  );
  return found.filter((url) => !allowed.has(normalizeLink(url)));
};
