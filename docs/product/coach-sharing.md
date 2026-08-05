# Sharing progress with coaches — design options and plan

Status: written 2026-08-05. **C-1 shipped the same day** — coaches, referral
links, the patient-list filter and the trainees view; nothing shares anything
yet. §5 records where building it corrected this document. §8 lists the open
decisions; none of them blocked C-1 and none block C-2.

---

## 1. The shape the practice actually has

Two relationships, and conflating them is the first mistake available:

- **Direct patient.** Comes to the practice, is the practice's patient. This is
  the only relationship the app models today.
- **Trainee.** Comes _through_ a personal trainer. Still the practice's
  patient — she measures them, she writes the plan, the record is hers to keep
  and theirs to have. What is new is that a third person, the trainer, has a
  legitimate interest in how they are progressing.

One trainer has many trainees. The practice has both trainers-with-trainees and
direct patients, at the same time, forever. And a trainer may perfectly well be
a patient too — the same human in two roles, which the model must allow without
forcing.

So the new entity is a **Coach**: a separate aggregate, not a patient, linked to
the patients they refer. One coach to many patients; a patient has at most one
active coach at a time.

A coach is **not a user of the app**. That distinction is doing a lot of work
further down.

## 2. The constraint that decides everything

**The trainer may be the one paying. The data belongs to the trainee.**

This is the whole feature in one line. It is commercially tempting to treat the
trainer as the customer and their trainees as an account — they send the
business, they may pay the invoice, they will certainly ask for "their
clients'" numbers. But the patient is the data subject, and none of that
changes it. Consent comes from the trainee, only from the trainee, and the
trainee can withdraw it while the trainer keeps paying. If those two ever
disagree, the trainee wins and the trainer gets a refund.

Two consequences that follow directly:

**Health data is _dato personal sensible_.** Under the LFPDPPP, transferring it
to a third party who is not a treating professional needs the patient's express
consent for that purpose. The app already has the slot: `third_party_transfer`
is in `ConsentType` (`packages/domain/src/consent/consent.ts`) and is today the
**only consent type nothing in the app uses**. This feature is what it was
reserved for. The consent must name the coach — a blanket "share with third
parties" is not consent to anything.

> Not legal advice. A contador handles the CFDI question in
> `subscription.md §4`; this one wants an hour with someone who knows LFPDPPP
> transfers, before the first report is sent, not after.

**A coach never writes.** Read-only in the strongest sense: a coach cannot
create, edit, comment, or cause anything to appear in a clinical record. This
is not a permissions decision that could be relaxed later — it is what keeps
this feature out of the multi-user/sync project (`subscription.md §6`, S-4).
The moment a coach can write, the practice needs concurrency, attribution,
per-user audit and a shared database, and the local-first architecture is over.

## 3. What a coach may see — and what they may never

| Shared                                          | Never shared                          |
| ----------------------------------------------- | ------------------------------------- |
| Measurement dates                               | SOAP / consultation notes             |
| Weight, and its trend                           | Clinical history, pathologies         |
| Body composition (% fat, lean mass)             | Medications, allergies                |
| Circumferences                                  | Lab results                           |
| Adherence, where recorded                       | Any diagnosis or interpretation       |
| Plan energy + protein targets (optional, §8 #2) | Anything AI-generated                 |
| —                                               | Progress photos (§8 #3 — default off) |

The test for the left column is: **does a trainer program differently because
of it?** Lean mass, weight trend and adherence, yes — that is their job.
Nothing in the right column changes a training block, and every item in it is
either a diagnosis or something that could cost the patient a job or an
insurance policy if the trainer forwards the file to the wrong person. Which
they will, eventually, because they are not bound by professional secrecy and
their phone syncs to a laptop their partner also uses.

**The safe artifact already exists.** `packages/reporting/src/progress-report-pdf.ts`
is _already_ this document, and its own header comment says so: "Deliberately
NOT a clinical summary — no notes, no diagnosis, no interpretation… every
number comes from a stored measurement or a frozen calculated value". T-31 in
the threat model already covers it. So the hard part of this feature is not the
document. It is **who receives it and on what authority**, which is §5 and §6.

## 4. Three levels, and only the first two are cheap

### Level 0 — the coach as an organising concept. Nothing leaves the machine.

Coach entity, patient↔coach link, filter the patient list by coach, a "trainees
of Carlos: 7" view, and batch progress-report generation. She sends them
herself, over WhatsApp or email, exactly as she does today.

One migration, one vertical slice, no new egress, no new attack surface, no new
infrastructure. **This is most of the value**, and it is worth being honest
about that: what she is missing today is not a delivery mechanism, it is the
ability to see that seven of her patients belong to one trainer and to produce
seven reports without hunting for them one at a time.

### Level 1 — the coach pack.

One document per coach per period covering all of their trainees, gated on the
`third_party_transfer` consent, watermarked with the consent and date it was
issued under, scoped by explicit per-patient flags, and audited. Still delivered
by her, by hand.

The watermark matters more than it sounds: it makes an accidental forward
traceable, and it makes the legal position self-documenting on the face of the
document rather than in a database she would have to be asked to query.

### Level 2 — a coach portal.

The trainer logs in to something and sees live progress. This is the one that
inverts the architecture, and it should be priced accordingly — not in money,
in obligations:

- Patient data leaves her machine and lives on a server, which is the one thing
  the entire threat model was built to avoid.
- Whoever runs that server becomes a _responsable_ or _encargado_ under the
  LFPDPPP, with breach-notification duties and ARCO rights exercisable against
  it.
- Accounts, sessions, password resets and support for people who are not the
  customer — trainers who forget passwords at 9pm.
- It never goes down, because now a third party depends on it.

If it is ever built, build it as **publish, not sync**. She pushes a snapshot
when she decides to; the server stores a blob it cannot read, keyed to a link
that expires; revoking deletes it. That preserves the property that matters —
_she_ decides what leaves and when — and it keeps the server a dumb, boring
thing that a leak would not turn into a catastrophe. A live sync of her
database to a portal is a different product and should be refused under that
name.

**Recommendation: 0, then 1, and 2 only when a trainer actually asks for it and
is willing to pay for it.** Levels 0 and 1 make level 2 cheap later, because
the entity, the consent, the scope flags and the audit trail are the same ones.
Nothing is thrown away.

## 5. Data model

### C-1, migration 32 — shipped 2026-08-05

```sql
coaches
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
  organization TEXT,           -- gym / studio, nullable
  email TEXT, phone TEXT,
  notes TEXT,                  -- commercial, never clinical
  status TEXT NOT NULL,        -- 'active' | 'archived'
  created_at, updated_at, archived_at, version

patient_coach_links
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id),
  coach_id   TEXT NOT NULL REFERENCES coaches(id),
  linked_at TEXT NOT NULL,
  revoked_at TEXT, revoked_reason TEXT,
  created_at TEXT NOT NULL

CREATE UNIQUE INDEX ... ON patient_coach_links (patient_id) WHERE revoked_at IS NULL;
```

**Correction to the first draft of this document.** It put `consent_id NOT NULL`
and the share-scope flags on the link itself. Building C-1 showed that to be
wrong, and wrong in the direction that matters.

Recording that a patient trains with Carlos is ordinary practice
record-keeping — the same kind of fact as knowing which doctor referred
someone. It needs no consent from anybody. What needs express consent is the
_transfer_. Folding the two into one row would have meant she could not even
note who the trainer is without first producing a consent form, and — worse —
it would have quietly turned an administrative note into a licence to share
clinical data, which is precisely the confusion §2 exists to prevent.

So the link is a referral and authorises nothing, C-2 adds the authorisation as
a **separate record** pointing at both the link and the consent, and the
"unrepresentable rather than forbidden" property moves there where it belongs.

Three choices that did survive:

**Append-only, revoke-only.** Same shape as `consents`: a link is never edited
or deleted, only revoked, so "who was their trainer in March" stays answerable.
Coaches are archived, never deleted, for the same reason `foods` and `recipes`
are (T-29), and archiving a coach leaves every existing link untouched.

**One active trainer per patient, enforced by a partial unique index** rather
than by remembering to check. Changing trainer is a revoke followed by a link,
which is also the honest description of what happened.

**Scope will be enumerated columns, not a JSON blob** (C-2). A scope you cannot
enumerate in SQL is a scope you cannot audit, and adding a sixth field should be
a migration someone reviews, not a key someone writes at runtime.

### C-2, still to build

```sql
coach_share_grants
  id TEXT PRIMARY KEY,
  link_id    TEXT NOT NULL REFERENCES patient_coach_links(id),
  consent_id TEXT NOT NULL REFERENCES consent_records(id),  -- the authorisation
  share_measurements      INTEGER NOT NULL,
  share_body_composition  INTEGER NOT NULL,
  share_plan_targets      INTEGER NOT NULL,
  share_adherence         INTEGER NOT NULL,
  share_photos            INTEGER NOT NULL DEFAULT 0,
  granted_at TEXT NOT NULL,
  revoked_at TEXT, revoked_reason TEXT
```

A grant is _effective_ when it is unrevoked, its link is unrevoked, **and** its
consent is still `accepted`. That last clause must live in the domain, not the
query — see below.

## 6. Enforcement points

**Consent is checked in the domain, not the UI.** `canShareWith(patient, coach,
consents)` returns a decision, and the report generator refuses without it. A
UI check is a suggestion; a domain check is a rule. Withdrawing a
`third_party_transfer` consent must make every link authorised by it inactive
immediately — no background job, no cache, evaluated on read.

**New IPC channels**, each needing a Zod `.strict()` contract, an audit entry, a
threat-model row and a `CHANNEL_ACCESS` classification before merge (the
existing rule):

| Channel                                  | Licence access | Slice  |
| ---------------------------------------- | -------------- | ------ |
| `coach.create` / `update` / `set-status` | `write`        | ✅ C-1 |
| `coach.list` / `get` / `for-patient`     | `read`         | ✅ C-1 |
| `coach.link` / `unlink`                  | `write`        | ✅ C-1 |
| `coachShare.grant` / `revoke`            | `write`        | C-2    |
| `coachReport.generate`                   | `read`         | C-3    |

`coachReport.generate` is `read` on purpose, and it is worth stating why: T-32
says a billing dispute must never withhold clinical records, and getting data
out is never gated. Producing a report she has already promised a patient's
trainer is getting data out.

`coach.unlink` is a `write` despite being a removal, because it changes stored
data — the same treatment `consentWithdraw` already gets. Safe only because a
link grants nothing: while it cannot be removed, it is also not authorising
anything to be sent.

**Audit.** Every grant, revoke and report generation records patient id, coach
id and the scope flags — never a clinical value, per the standing rule. This
audit trail is not bookkeeping: it is the answer to "who has seen my data?",
which is an ARCO access right the patient can exercise. Level 1 should surface
it as a per-patient panel, because a question a practitioner cannot answer in
front of the patient is a question she will answer wrongly.

**Threat model** — **T-36** (the coach relationship becomes a back door into
the clinical record) and **T-37** (the paying party is mistaken for the data
subject) landed with C-1 and are marked implemented + tested there. Both will
need revisiting at C-2, when something actually leaves the machine.

## 7. Phasing

| ID  | Slice                                                                                                       | Level | Status        |
| --- | ----------------------------------------------------------------------------------------------------------- | ----- | ------------- |
| C-1 | Coach aggregate + link + migration 32, patient list filter, "trainees of X" view                            | 0     | ✅ 2026-08-05 |
| C-2 | `third_party_transfer` consent wired: capture naming the coach, domain gate, withdrawal revokes, audit view | 0/1   | ⬜            |
| C-3 | Coach pack — batch progress reports, scope flags applied, consent watermark on the document                 | 1     | ⬜            |
| C-4 | Coach portal — publish-snapshot model, encrypted blobs, expiring links                                      | 2     | ⬜            |

C-1 and C-2 are each about the size of the measurement-session slice. C-3 is
smaller than it looks because the PDF already exists. C-4 is a project, not a
slice, and should not be started on the strength of one trainer asking.

## 8. Decisions needed

1. **Does the trainer need live access, or is a report she sends enough?**
   This is the only one that changes the shape of the work rather than its
   details. Everything above assumes the second answer.
2. **Do coaches see plan targets** (kcal, protein), or only measured outcomes?
   Arguable both ways: it helps a trainer program, and it is also her
   professional work product being handed to someone who could copy it.
3. **Photos: never, or per-patient opt-in?** Body photos to a non-clinical
   third party is a materially different consent conversation, and the default
   in §5 is off. Recommend never, at least until a trainer explains why.
4. **Can a patient have two coaches?** The model says no. A trainee who
   switches gyms is a revoke plus a grant, which is also the honest description
   of what happened.
5. **Does the trainer pay, and for what?** If trainer-sourced volume becomes
   real, that is the "Clinic" pricing pressure in `subscription.md §6` S-4 —
   but note that coach sharing is deliberately **not** multi-tenancy, so it can
   be priced without building that.
