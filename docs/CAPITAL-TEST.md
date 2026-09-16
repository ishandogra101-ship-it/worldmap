# What the capital test counts, and what moved

The test was reporting 180 failures. 109 of those were real. The rest were
correct maps drawn under a name the canonical layer had not been told about, and
because they sat in the same list as the real errors, nobody could see the real
errors. Fixing the matching changed no geometry.

## The three ways a map can be right and still not match

A polity's capital is a point where one polity held power, so the name the
border layer writes there can be checked without any argument about frontiers.
But "the name matches" is not the same as "the map is right", and there turned
out to be three distinct reasons a correct map fails a naive string compare.

**Another name for the same polity.** The layer writes "Mamluke Sultanate",
"Empire of Ghana", "Fulani Empire". These go in `mapsTo`, which
`canonical/polities/_format.md` already defines as a statement about the dataset
rather than about history. Each new one here is corroborated by a Wikipedia
redirect: if `Fulani Empire` redirects to `Sokoto Caliphate`, something outside
this repository agrees they are one polity. `npm run verify:aliases` re-runs that
check.

The redirect test is sufficient, not necessary, and it earned its place by
refusing two aliases that looked obvious:

- `Principality of Kyiv` resolves to Principality of Kiev, which is a *successor*
  of Kievan Rus rather than another name for it.
- `Tsardom of Muscovy` resolves to the Tsardom of Russia, the state that
  *followed* the Grand Duchy of Moscow.

Both would have taught the test to accept a wrong name at Kyiv and at Moscow.

**A group label covering several polities.** "Rajput kingdoms" over Jodhpur,
"Greek city-states" over Athens, "Maya states" over Tikal. The map is right and
coarse. These live in `canonical/collectives.json`, are counted as a pass, and
are still printed under their own heading, because a group label is precisely
where the claim layer has work left. Folding them into `mapsTo` would have
erased that signal.

**A vassal drawn under its overlord.** This mechanism already existed. It was
mostly failing for a name reason rather than a history reason: Travancore,
Marwar, Mysore and Hyderabad all carried `subordinateTo: british-raj` and all
still failed at 1945, because the layer draws **India** and the Raj's `mapsTo`
did not have it. Wikipedia's British Raj article says the territory "was commonly
called India in contemporaneous usage". One alias, five rows.

## Where the line is

An ethnographic label is none of the three. When the layer writes "Eastern North
American hunter-gatherers" over Cahokia, "Bantu peoples" over Mbanza Kongo, or
"West African cereal farmers" over Benin City, it is declining to name a state
where we hold that a state stood. Cahokia was a city of some tens of thousands.
That stays a failure and should. A collective names polities; this names a way of
life, and the difference is not cosmetic.

## Canonical records the sources contradicted

Three capitals were being tested in years they were not capitals, so the map was
right and the test was wrong:

| record | was | now | source |
|---|---|---|---|
| Ottoman, Bursa | no start year | `from: 1335` | Bursa "became the capital of the Ottoman Empire ... from 1335 until the 1360s". Byzantine at the 1300 snapshot. |
| Bahmani, Gulbarga | no end year | `to: 1425` | Ahmad Shah I (r. 1422–1436) moved the seat to Bidar. The Bidar capital record already said 1425. |
| Parthian, Ctesiphon | no start year | `from: -141` | Mithridates I took Seleucid Mesopotamia in 141 BCE. At the 200 BCE snapshot it was Seleucid, correctly drawn. |

Ctesiphon at 100 BCE still fails, and that one is real: the Seleucids had lost
Mesopotamia forty years earlier.

## Subordination added

Each of these is a historical claim, unlike an alias, and each was checked
against the linked article before it was written.

- Goryeo under the Yuan, 1270–1356. "became a vassal state of the Yuan dynasty".
- Abbasid under the Buyids 945–1055 and the Seljuks 1055–1157. The caliphs "were
  reduced to mere figureheads". They recovered Iraq afterwards, so a Buyid name
  over Baghdad at **1200** is still an error and still listed.
- Moscow under the Golden Horde, 1283–1480. The khan "held suzerainty over the
  princes" and Ivan I collected his tribute.
- Prussia and the German Empire, 1871–1918, as `personal-union`: the King of
  Prussia was ex officio German Emperor. None of the six `kind` values means
  "federal constituent", and this is the closest that is not simply wrong.

Two polities were added because an overlord cannot be named without a record:
the **Buyid dynasty** (934–1062) and the **German Empire** (1871–1918). Both
pass their own capital tests.

## A latent bug the alias checker found by itself

`Jin dynasty (265–420)` and `Jin dynasty (1115–1234)` both claimed the bare name
`Jin`, and the Jurchen Jin also claimed `Jin Empire` — which the border layer
only ever draws at year 500, three centuries before the Jurchen Jin existed.
Nothing was breaking, because neither record carries a capital and `existsAt`
gates the comparison. It would have broken the day someone gave one of them a
capital. Both are now windowed to their own lifespans.

## Verification

Nothing here changed a `verification.method`. All 208 records remain `drafted`.
`mapsTo` is dataset reconciliation and `RULES.md` reserves `reviewed` and `cited`
for a person. Sources were opened for the claims above and are named in place,
but promoting records to `cited` is a decision for the owner, not something to
take while passing through. See HANDOFF priority 2.
