# The canonical layer

This directory is the Atlas of Power history database. It is the source of
truth. Everything under `public/data/` is generated; everything here is
authored.

## The one rule

**A record may only claim what was actually done to it.**

`verification.method` says how a claim got here, and it is not a compliment.
There are exactly three values and they mean specific things:

- `drafted` — written from an assistant's training knowledge. The named
  references are where a reader should go to check it. Nobody has opened them.
  This is the honest label for most of what is here today.
- `reviewed` — a human read the record against at least one of its named
  references and confirmed or corrected it. `verification.by` names them and
  `verification.date` says when.
- `sourced` — an automated process fetched a specific document and wrote the
  record from what it said. `verification.retrieved` records the URL, the
  revision and the date, so the claim can be re-checked against the same bytes
  rather than against a page that has since changed. This is weaker than
  `cited`: nobody judged whether the document is any good, only that it was
  actually opened and actually says this.
- `cited` — the record was transcribed from a specific passage of a specific
  source, with the locator recorded in `sources[].locator`.

Nothing may be marked `reviewed` or `cited` by an automated process.

`sourced` exists because the rule above was written by a session with no network
at all, where any citation would necessarily have been invented. That is no
longer the situation, and the gap it left was the wrong one: an agent that had
genuinely opened Wikipedia and recorded the revision id had no way to say so, so
real retrieval and pure recall both had to be filed as `drafted`. They are not
the same thing and the layer should be able to tell them apart. What has not
changed is that an assistant may not certify its own work as reviewed. The
validator enforces `sourced` the only way that means anything: a record claiming
it must name what it fetched, or it fails. The
validator enforces this: a record whose `verification.method` is `reviewed`
must carry a `by` that is not the string "claude", and one marked `cited` must
carry a locator on at least one source.

This exists because the project's whole value is that its claims can be
trusted. A canonical layer that labels its own guesses as verified is worse
than no canonical layer, because it launders them.

## What this is not

It is not a confidence system. The map does not display these fields and does
not hedge. A record either belongs in the atlas or it does not. Provenance is
answerable on demand — "why is this here?" — and is otherwise out of the way.

## Sources

`sources[]` names real works: author, title, edition, and a locator where one
exists. A URL goes in only if someone opened it. The session that seeded this
directory had no network access to Wikipedia, Britannica, Wikidata's query
service or any academic host — every one returns a connection failure — so the
seed records name their references and carry no URLs.

## Precedence

canonical > staging. Always. An import can propose; it cannot decide. See
`scripts/canonical/promote.mjs`, which refuses to write a canonical record from
staging data.

## Where this stands today

172 polities and 36 people, nearly every one of them `drafted` — written from an
assistant's training knowledge against the named works, with nobody having
opened those works. That is the honest state and the validator will not let it
be described as anything else.

The session that built this had no network route to Wikipedia, Britannica,
Wikidata's query service or any academic host; all of them refuse the
connection. So the seeding could not be verification, and pretending otherwise
would have been the exact failure this layer exists to prevent.

What is here is a backbone with the shape the project needs: globally
distributed (East Asia 18%, Europe 16%, South Asia 14%, Sub-Saharan Africa 12%,
against 58% Europe in the imported layer), independent of any import, and
checked by 20 historical anchors that fail loudly. Review turns `drafted` into
`reviewed`, one record at a time, and that is the work from here.
