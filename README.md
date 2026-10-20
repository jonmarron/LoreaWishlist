# Wishlist

A shared wishlist on GitHub Pages. You add items (name + link) on an admin page;
anyone with the link can claim one, which crosses it off for everyone else,
live, in every open tab.

Static site on GitHub Pages, data in Supabase. No server to run, no bill.

## How the security works

GitHub Pages serves static files, so everything the browser gets is public —
including the Supabase URL and anon key. **That is fine and intended.** Those
identify the project; they do not grant access to it. Access is decided by the
row-level security policies in [`supabase/schema.sql`](supabase/schema.sql),
which Postgres enforces and the browser cannot talk its way around.

| Who | Can |
| --- | --- |
| Anyone, signed out | Read the list |
| Any visitor | Claim an item nobody has claimed |
| The visitor who claimed it | Release that claim, and only that one |
| The admin account | Add, edit, delete items; clear any claim; rename the list |

Two things make that enforceable rather than decorative:

**Visitors are signed in anonymously** — invisible, no prompt, no account — so
the database has a stable `uid` to bind each claim to. That is what makes "only
the person who claimed it can release it" a rule instead of a suggestion.

**Claiming goes through a function, not an UPDATE.** Row-level security can say
*which rows* a visitor may touch but not *which columns* — so a plain claim
policy would also let a visitor rewrite an item's name or link. Instead,
`claim_item()` and `release_item()` are narrow `security definer` functions that
are physically unable to write anything else, and direct UPDATE is admin-only.

`claim_item()` also resolves the race: it updates `where claimed_by is null`, so
when two people tap Claim at the same instant Postgres picks a winner and the
loser is told who got there first.

The admin is one specific email address, named in both `admin_email()` in the
schema and `NEXT_PUBLIC_ADMIN_EMAIL`. **The copy in the database is the one that
is enforced**; the env var only decides what the UI offers.

All of the above is covered by `npm run test:policies` — 27 checks against the
real schema, including the concurrent-claim race on two live connections.

## Setup

### 1. Create a Supabase project

[supabase.com/dashboard](https://supabase.com/dashboard) → New project. Note the
database password somewhere; you will not need it for this app, but you will
want it eventually.

### 2. Turn on the two sign-in methods

Authentication → Sign In / Providers:

- **Email** — enabled by default. This is for you.
- **Anonymous sign-ins** — switch on. Visitors need this to claim items.

While you are there, under Email, turn **off** "Confirm email" (you are about to
create your own account by hand and there is nobody else to confirm).

### 3. Create your admin account — do this before deploying

Authentication → Users → Add user → Create new user. Use the address you will
put in the schema, and tick auto-confirm if offered.

Do this *first*. The policies trust that address, and Supabase will not let a
second account take an email that already exists — creating it now is what stops
anyone else from registering it with the public anon key.

**Leave "Allow new users to sign up" switched on.** It is tempting to turn it
off — only you need an account — but that setting also blocks anonymous
sign-ins, and visitors would no longer be able to claim anything. The sign-in
request comes back as `signup_disabled`.

Leaving it on is safe here. A stranger who registers an account is just another
visitor: `is_admin()` only ever returns true for the one address above, and
Supabase will not let a second account take an email that already exists, so
yours cannot be registered out from under you.

### 4. Apply the schema

Open `supabase/schema.sql`, change `admin_email()` to the address from step 3:

```sql
create or replace function public.admin_email() returns text
  language sql immutable
  as $$ select lower('you@example.com') $$;
```

Then paste the whole file into the dashboard's **SQL Editor** and run it. It is
safe to re-run.

### 5. Copy the project credentials

Project Settings → API: the **Project URL** and the **anon / publishable** key.
Not the service role key — that one is a real secret and must never go near this
project.

### 6. Configure the site repo

Push this project to a GitHub repo, then Settings → Secrets and variables →
Actions → **Variables**:

| Name | From |
| --- | --- |
| `SUPABASE_URL` | Project URL |
| `SUPABASE_ANON_KEY` | anon / publishable key |
| `ADMIN_EMAIL` | the address from step 3 |

Variables, not secrets — none of this is confidential, and treating it as a
secret would only make it harder to debug.

### 7. Turn on Pages and deploy

Settings → Pages → Source: **GitHub Actions**. Then push to `main`, or run the
workflow from the Actions tab. The site lands at
`https://<you>.github.io/<repo>/`.

Using a user/org site (`<you>.github.io`) or a custom domain at the root? Delete
the `BASE_PATH` line from `.github/workflows/deploy.yml`.

### 8. Allow the site's URL

Authentication → URL Configuration → Redirect URLs: add
`https://<you>.github.io/<repo>/**`.

## Local development

```bash
cp .env.example .env.local   # paste the project URL and anon key
npm install
npm run dev
```

This talks to the real Supabase project, so local changes are live changes.

## Testing the policies

```bash
npm run test:policies
```

Starts a throwaway Postgres in Docker, applies the real `supabase/schema.sql`
against a shim of Supabase's `auth.uid()` / `auth.jwt()`, and runs 27 checks:
that a visitor cannot delete an item, cannot claim something already taken,
cannot release someone else's claim, cannot edit a name while claiming, cannot
write a claim directly to bypass the function, and that two simultaneous claims
on separate connections produce exactly one winner.

Needs Docker running. Re-run it after any change to the schema — the policies
are the only thing protecting the data, and a mistake there is silent.

## Using it

- **`/`** — everything still available, with claimed items crossed off below.
  Claiming asks only for a name. Updates stream in live, so an item claimed on
  someone's phone greys out on your screen a second later.
- **`/admin`** — sign in with the admin account, then add items (name, link,
  optional note), edit or delete them, clear a claim, or rename the list. Every
  item shows whether it is still free or who has reserved it, and the heading
  counts how many are taken. Editing an item leaves any claim on it intact.

Claimer names are visible to everyone, including you. If you would rather not
know who picked what, drop the name from the badge in
`src/components/WishlistView.tsx` — the data is still there, just not shown.

## Things worth knowing

- **Free projects pause.** Supabase pauses a free project after about a week
  with no activity; the site will show a connection error until you resume it
  from the dashboard (one click, data intact). Worth knowing before you share
  the link after a quiet month.
- **Releasing is per-browser.** The claim is bound to the anonymous identity
  stored in that browser. Clear site data, or claim on your phone and try to
  release on a laptop, and the Release button will not appear. You can always
  clear the claim from the admin page.
- **Signing in as admin replaces an anonymous session.** If you claimed
  something as a visitor and then sign in to `/admin`, that claim is no longer
  "yours" — but as admin you can clear it anyway.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| "Not configured yet" | Variables missing at build time. Add them and re-run the deploy. |
| "The database refused that change" | Schema not applied, or `admin_email()` does not match the account you signed in with. |
| "Anonymous sign-ins are disabled" | The Anonymous provider is off — step 2. |
| Claiming fails with `signup_disabled` | "Allow new users to sign up" is off; it gates anonymous sign-ins too. Turn it back on — step 3. |
| Everything fails with a connection error | The free project is paused — resume it from the dashboard. |
| `items` table does not exist | Step 4 was skipped, or run against a different project. |
| CSS and JS 404 on the deployed site | `BASE_PATH` does not match the repo name. |
