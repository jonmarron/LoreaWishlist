/**
 * Row-level security tests.
 *
 * These are the real safety net for this project: the anon key is public, so
 * supabase/schema.sql is the only thing deciding who may do what. The policies
 * are exercised against a throwaway Postgres container, with auth.uid() and
 * auth.jwt() shimmed exactly as Supabase defines them.
 *
 *   npm run test:policies      (needs Docker)
 */
import { readFileSync } from "node:fs";
import pg from "pg";

const ADMIN_EMAIL = "you@example.com"; // the address the schema seeds into public.admins
const SECOND_ADMIN = "zweiter@example.com";

const ANNA = "11111111-1111-1111-1111-111111111111";
const BEN = "22222222-2222-2222-2222-222222222222";
const ADMIN = "33333333-3333-3333-3333-333333333333";
const MISSING = "99999999-9999-9999-9999-999999999999";

const CONNECTION_STRING =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:test@127.0.0.1:55433/wishlist_test";

const client = new pg.Client({ connectionString: CONNECTION_STRING });
await client.connect();

// Fresh schema each run.
await client.query("drop schema if exists public cascade; create schema public;");
await client.query(readFileSync("test/supabase-shim.sql", "utf8"));
await client.query(readFileSync("supabase/schema.sql", "utf8"));

/** Visitors and the admin, as PostgREST would present them. */
const visitor = (sub) => ({ role: "authenticated", claims: { sub, is_anonymous: true } });
const admin = { role: "authenticated", claims: { sub: ADMIN, email: ADMIN_EMAIL, is_anonymous: false } };
const impostor = {
  role: "authenticated",
  claims: { sub: BEN, email: "mallory@example.com", is_anonymous: false },
};
const signedOut = { role: "anon", claims: {} };

/**
 * Run statements the way a given caller would, then roll everything back.
 * `body` gets a `run` it can call more than once -- a second statement sees the
 * first one's writes, which a single SELECT would not.
 */
async function session({ role, claims }, body) {
  await client.query("begin");
  try {
    await client.query(`set local role ${role}`);
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify(claims),
    ]);
    return await body((sql, params = []) => client.query(sql, params));
  } finally {
    await client.query("rollback");
  }
}

/** Shorthand for the common single-statement case. */
const as = (caller, sql, params = []) => session(caller, (run) => run(sql, params));

async function seedItem({ claimedBy = null, claimedByUid = null } = {}) {
  const { rows } = await client.query(
    `insert into public.items (name, url, note, claimed_by, claimed_by_uid, claimed_at)
     values ('Espresso cups', 'https://example.com/cups', 'set of four', $1::text, $2::uuid,
             case when $1::text is null then null else now() end)
     returning id`,
    [claimedBy, claimedByUid],
  );
  return rows[0].id;
}

const tests = [
  // ── reading ───────────────────────────────────────────────────────────────
  ["anyone, even signed out, can read the list", async () => {
    await seedItem();
    const { rows } = await as(signedOut, "select * from public.items");
    assert(rows.length > 0, "signed-out read returned nothing");
  }],

  ["anyone can read the list title", async () => {
    const { rows } = await as(signedOut, "select title from public.meta");
    assert(rows.length === 1, "meta not readable");
  }],

  // ── adding and removing is admin-only ─────────────────────────────────────
  ["admin can add an item", async () => {
    const { rowCount } = await as(
      admin,
      "insert into public.items (name, url, note) values ('Bike', '', '')",
    );
    assert(rowCount === 1, "admin insert did not happen");
  }],

  ["a visitor cannot add an item", async () => {
    await assertRejected(
      as(visitor(ANNA), "insert into public.items (name, url, note) values ('Bike', '', '')"),
    );
  }],

  ["someone who signed up with their own email cannot add an item", async () => {
    await assertRejected(
      as(impostor, "insert into public.items (name, url, note) values ('Bike', '', '')"),
    );
  }],

  ["a visitor cannot delete an item", async () => {
    const id = await seedItem();
    const { rowCount } = await as(visitor(ANNA), "delete from public.items where id = $1", [id]);
    assert(rowCount === 0, "a visitor deleted an item");
  }],

  ["admin can delete an item", async () => {
    const id = await seedItem();
    const { rowCount } = await as(admin, "delete from public.items where id = $1", [id]);
    assert(rowCount === 1, "admin could not delete");
  }],

  ["a visitor cannot edit an item's name or link", async () => {
    const id = await seedItem();
    const { rowCount } = await as(
      visitor(ANNA),
      "update public.items set name = 'Hacked', url = 'https://evil.example' where id = $1",
      [id],
    );
    assert(rowCount === 0, "a visitor edited an item");
  }],

  ["admin can fix a typo", async () => {
    const id = await seedItem();
    const { rowCount } = await as(admin, "update public.items set name = 'Espresso glasses' where id = $1", [id]);
    assert(rowCount === 1, "admin could not edit");
  }],

  ["admin can edit name, link and note together", async () => {
    const id = await seedItem();
    const { rowCount } = await as(
      admin,
      "update public.items set name = $2, url = $3, note = $4 where id = $1",
      [id, "Kletterschuhe", "https://example.com/schuhe", "Größe 32"],
    );
    assert(rowCount === 1, "admin could not edit all three fields at once");
  }],

  ["editing an item leaves an existing claim untouched", async () => {
    const id = await seedItem({ claimedBy: "Anna", claimedByUid: ANNA });
    const row = await session(admin, async (run) => {
      await run("update public.items set name = $2, url = $3, note = $4 where id = $1", [
        id,
        "Umbenannt",
        "https://example.com/neu",
        "neue Notiz",
      ]);
      const { rows } = await run(
        "select name, claimed_by, claimed_by_uid from public.items where id = $1",
        [id],
      );
      return rows[0];
    });
    assert(row.name === "Umbenannt", "the edit did not apply");
    assert(
      row.claimed_by === "Anna" && row.claimed_by_uid === ANNA,
      "editing the item wiped the claim",
    );
  }],

  ["a visitor cannot edit an item's note", async () => {
    const id = await seedItem();
    const { rowCount } = await as(
      visitor(ANNA),
      "update public.items set note = 'hacked' where id = $1",
      [id],
    );
    assert(rowCount === 0, "a visitor edited the note");
  }],

  // ── claiming ──────────────────────────────────────────────────────────────
  ["a visitor can claim an unclaimed item", async () => {
    const id = await seedItem();
    const { rows } = await as(visitor(ANNA), "select public.claim_item($1, 'Anna') as r", [id]);
    assert(rows[0].r.ok === true, `claim failed: ${JSON.stringify(rows[0].r)}`);
  }],

  ["a claim is stamped with the caller's own uid, not one they supply", async () => {
    const id = await seedItem();
    const uid = await session(visitor(ANNA), async (run) => {
      await run("select public.claim_item($1, 'Anna')", [id]);
      const { rows } = await run("select claimed_by_uid from public.items where id = $1", [id]);
      return rows[0].claimed_by_uid;
    });
    assert(uid === ANNA, `expected ${ANNA}, got ${uid}`);
  }],

  ["a signed-out visitor cannot claim", async () => {
    const id = await seedItem();
    await assertRejected(as(signedOut, "select public.claim_item($1, 'Nobody')", [id]));
  }],

  ["a visitor cannot claim an item someone else already holds", async () => {
    const id = await seedItem({ claimedBy: "Anna", claimedByUid: ANNA });
    const { rows } = await as(visitor(BEN), "select public.claim_item($1, 'Ben') as r", [id]);
    assert(rows[0].r.ok === false, "a second claim succeeded");
    assert(rows[0].r.claimed_by === "Anna", "the loser was not told who holds it");
  }],

  ["an empty name is not a claim", async () => {
    const id = await seedItem();
    await assertRejected(as(visitor(ANNA), "select public.claim_item($1, '   ')", [id]));
  }],

  ["claiming something that does not exist is an error, not a silent no-op", async () => {
    await assertRejected(as(visitor(ANNA), "select public.claim_item($1, 'Anna')", [MISSING]));
  }],

  ["a visitor cannot set claimed_by directly, bypassing the function", async () => {
    const id = await seedItem();
    const { rowCount } = await as(
      visitor(ANNA),
      "update public.items set claimed_by = 'Anna', claimed_by_uid = $2, claimed_at = now() where id = $1",
      [id, ANNA],
    );
    assert(rowCount === 0, "a visitor wrote a claim directly");
  }],

  // ── releasing ─────────────────────────────────────────────────────────────
  ["the claimer can release their own claim", async () => {
    const id = await seedItem({ claimedBy: "Anna", claimedByUid: ANNA });
    const { rows } = await as(visitor(ANNA), "select public.release_item($1) as r", [id]);
    assert(rows[0].r.ok === true, "the claimer could not release");
  }],

  ["a visitor cannot release someone else's claim", async () => {
    const id = await seedItem({ claimedBy: "Anna", claimedByUid: ANNA });
    const { rows } = await as(visitor(BEN), "select public.release_item($1) as r", [id]);
    assert(rows[0].r.ok === false, "someone released a claim that was not theirs");
  }],

  ["admin can clear anyone's claim", async () => {
    const id = await seedItem({ claimedBy: "Anna", claimedByUid: ANNA });
    const { rowCount } = await as(
      admin,
      "update public.items set claimed_by = null, claimed_by_uid = null, claimed_at = null where id = $1",
      [id],
    );
    assert(rowCount === 1, "admin could not clear a claim");
  }],

  // ── the title ─────────────────────────────────────────────────────────────
  ["admin can rename the list", async () => {
    const { rowCount } = await as(admin, "update public.meta set title = 'Birthday' where id = true");
    assert(rowCount === 1, "admin could not rename");
  }],

  ["a visitor cannot rename the list", async () => {
    const { rowCount } = await as(visitor(ANNA), "update public.meta set title = 'Pwned' where id = true");
    assert(rowCount === 0, "a visitor renamed the list");
  }],

  // ── shape guarantees ──────────────────────────────────────────────────────
  ["a half-written claim is rejected by the database", async () => {
    await assertRejected(
      client.query("insert into public.items (name, claimed_by) values ('X', 'Anna')"),
    );
  }],

  ["there can only ever be one meta row", async () => {
    await assertRejected(client.query("insert into public.meta (id) values (false)"));
  }],

  // ── who is an admin ───────────────────────────────────────────────────────
  ["inserting an email into admins makes that person an admin", async () => {
    const promoted = {
      role: "authenticated",
      claims: { sub: BEN, email: SECOND_ADMIN, is_anonymous: false },
    };

    const before = await as(promoted, "select public.is_admin() as ok");
    assert(before.rows[0].ok === false, "a stranger was already an admin");

    await client.query("insert into public.admins (email) values ($1)", [SECOND_ADMIN]);
    try {
      const after = await as(promoted, "select public.is_admin() as ok");
      assert(after.rows[0].ok === true, "inserting into admins did not grant access");

      const { rowCount } = await as(
        promoted,
        "insert into public.items (name, url, note) values ('Von Admin 2', '', '')",
      );
      assert(rowCount === 1, "the new admin still could not add an item");
    } finally {
      await client.query("delete from public.admins where email = $1", [SECOND_ADMIN]);
    }
  }],

  ["removing someone from admins revokes it again", async () => {
    const demoted = {
      role: "authenticated",
      claims: { sub: BEN, email: SECOND_ADMIN, is_anonymous: false },
    };
    await client.query("insert into public.admins (email) values ($1)", [SECOND_ADMIN]);
    await client.query("delete from public.admins where email = $1", [SECOND_ADMIN]);

    const { rows } = await as(demoted, "select public.is_admin() as ok");
    assert(rows[0].ok === false, "a removed admin kept their access");
  }],

  ["an anonymous visitor is never an admin, whatever the table says", async () => {
    // Same uid, but the anonymous flag set and no email claim.
    const { rows } = await as(
      { role: "authenticated", claims: { sub: ANNA, is_anonymous: true } },
      "select public.is_admin() as ok",
    );
    assert(rows[0].ok === false, "an anonymous session passed the admin check");
  }],

  ["nobody can read the list of admins through the API", async () => {
    await assertRejected(as(signedOut, "select * from public.admins"));
    await assertRejected(as(visitor(ANNA), "select * from public.admins"));
    await assertRejected(as(admin, "select * from public.admins"));
  }],

  ["nobody can make themselves an admin through the API", async () => {
    await assertRejected(
      as(visitor(ANNA), "insert into public.admins (email) values ('mallory@example.com')"),
    );
    // Not even an existing admin -- that is a dashboard-only operation.
    await assertRejected(
      as(admin, "insert into public.admins (email) values ('mallory@example.com')"),
    );
  }],

  // ── the race that matters ─────────────────────────────────────────────────
  ["two people claiming the same item at the same instant", async () => {
    const id = await seedItem();

    // Separate connections, no explicit transactions: this is genuine
    // concurrency, not two statements taking turns.
    const racers = [pg.Client, pg.Client].map(
      () => new pg.Client({ connectionString: CONNECTION_STRING }),
    );
    await Promise.all(racers.map((racer) => racer.connect()));

    try {
      const claim = async (racer, uid, name) => {
        await racer.query("set role authenticated");
        await racer.query("select set_config('request.jwt.claims', $1, false)", [
          JSON.stringify({ sub: uid, is_anonymous: true }),
        ]);
        const { rows } = await racer.query("select public.claim_item($1, $2) as r", [id, name]);
        return rows[0].r;
      };

      const [anna, ben] = await Promise.all([
        claim(racers[0], ANNA, "Anna"),
        claim(racers[1], BEN, "Ben"),
      ]);

      const winners = [anna, ben].filter((result) => result.ok === true);
      assert(winners.length === 1, `expected exactly one winner, got ${winners.length}`);

      const loser = [anna, ben].find((result) => result.ok === false);
      const { rows } = await client.query(
        "select claimed_by from public.items where id = $1",
        [id],
      );
      assert(
        loser.claimed_by === rows[0].claimed_by,
        "the loser was told the wrong person holds it",
      );
    } finally {
      await Promise.all(racers.map((racer) => racer.end()));
      await client.query("delete from public.items where id = $1", [id]);
    }
  }],
];

function assert(condition, detail) {
  if (!condition) throw new Error(detail);
}

async function assertRejected(promise) {
  try {
    await promise;
  } catch {
    return;
  }
  throw new Error("expected the database to refuse this, but it went through");
}

let failures = 0;
for (const [label, run] of tests) {
  try {
    await run();
    console.log(`  ok   ${label}`);
  } catch (cause) {
    failures++;
    console.log(`  FAIL ${label}\n       ${cause?.message ?? cause}`);
  }
}

await client.end();
console.log(
  failures === 0
    ? `\nAll ${tests.length} policy checks passed.\n`
    : `\n${failures} of ${tests.length} check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
