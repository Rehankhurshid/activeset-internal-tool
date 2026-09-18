# tests

## Firestore security rules — `firestore.rules.test.ts`

Exercises every rule in `firestore.rules` against the **Firestore emulator**
(never production) using `@firebase/rules-unit-testing` and Node's built-in
`node:test` runner.

### Prerequisites

- **Java 11+ on `PATH`** — the Firestore emulator is a JAR that firebase-tools
  downloads and runs. `java -version` must work. (macOS: `brew install openjdk@21`
  then follow brew's PATH hint.)
- `npm install` — brings in `firebase-tools` and `@firebase/rules-unit-testing`.
- No Firebase login or credentials. The suite runs under `--project demo-activeset`;
  `demo-*` project IDs are offline demo projects that firebase-tools never
  contacts Google for.

### Run

```sh
npm run test:rules
```

This runs `firebase emulators:exec --only firestore --project demo-activeset
"tsx --test tests/firestore.rules.test.ts"`: it boots the emulator on the port
in `firebase.json` (8080), exports `FIRESTORE_EMULATOR_HOST` for the test
process, loads `firestore.rules` into the emulator, runs the suite, and shuts
the emulator down.

To iterate faster, keep an emulator running in one terminal
(`npx firebase emulators:start --only firestore --project demo-activeset`) and
run `npx tsx --test tests/firestore.rules.test.ts` in another; the suite falls
back to `127.0.0.1:8080` when `FIRESTORE_EMULATOR_HOST` is unset.

### What it covers

Each `it` is one assertion of *who* (signed-out, signed-in `@gmail.com`,
`@activeset.co`, admin `rehan@activeset.co`, admin-by-custom-claim) may do
*what* on *which* collection:

| Collection | Asserted behaviour |
| --- | --- |
| `projects` | signed-out and non-`@activeset.co` reads denied (incl. an `@activeset.com` lookalike); team, hardcoded admin and `admin:true` claim reads allowed; any create/update carrying `webflowConfig.apiToken` (whole-map or dotted path) denied, plain updates allowed |
| `project_secrets` | server-only: admin read and write denied |
| `tasks`, `project_timelines`, `project_checklists`, `requests` | signed-out read allowed; signed-out and `@gmail.com` writes denied; team write allowed |
| `access_control` | signed-out read allowed; `@activeset.co` non-admin write denied; admin write allowed |
| `proposals`, `templates` | signed-out and `@gmail.com` reads denied; team read/write allowed |
| `shared_proposals` | signed-out read allowed; signed-out write denied; team write allowed |
| `proposal_comments` | signed-out read allowed; signed-out create allowed only with `authorType: 'client'`; signed-out update denied; team update allowed |
| `proposal_history` | signed-out create allowed only with `changeType: 'signed'`; signed-out read denied; team read allowed |
| `proposal_views` | server-only: admin read and write denied |
| `client_portal_tokens`, `client_portal_views` | not mentioned in the rules — default deny for admin, team and signed-out |
| `webflow_sessions` | documents the deliberate public read/write exception used by the Webflow extension |

### This is the gate for rules changes

Every change to `firestore.rules` must keep this suite green **before**
`npm run security:deploy-firestore-rules`. When you add a collection or change
who may touch one, add or update the matching `describe` block in the same PR.

### Known caveat: peer dependency mismatch

`@firebase/rules-unit-testing@5.x` declares a peer dependency on `firebase@^12`,
while this repo is on `firebase@11`. It was installed with `--legacy-peer-deps`
and works because the package only imports the compat entrypoints
(`firebase/compat/app`, `firebase/compat/firestore`), which are unchanged in 11.
If a fresh `npm install` / `npm ci` fails with `ERESOLVE`, either pass
`--legacy-peer-deps`, pin `@firebase/rules-unit-testing@^4` (the release that
targets `firebase@^11`), or upgrade `firebase` to 12.
