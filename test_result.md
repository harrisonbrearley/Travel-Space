#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  Multi-feature iteration on the Travel Space mobile app:
  1) Fix the backend generic sub-item PATCH so it does a TRUE partial update (previously the
     dict-defaults on Pydantic models were overwriting untouched fields).
  2) Allow PDF uploads for bookings (AutoAddSheet) and tickets (ticket photo/PDF picker).
     Server extracts PDF text via pypdf before feeding to GPT.
  3) Add a NEW "Documents" tab (9th tab). Any photo or PDF can be attached, with optional
     linked_type/linked_item_id to cross-reference other trip items (flight, transport,
     stay, attraction, ticket).
  4) Offline / local-only mode: a "Continue without signing in" button on the login screen
     that switches all API calls to an AsyncStorage-backed store. Guest banner + Sign-In
     upsell shown on home.
  5) Collaboration invites: sharing a trip now offers three modes — Read-only link
     (existing behaviour), Invite to trip (adds accepter to `collaborators`, sync writes),
     Send a copy (deep-clones the trip + all sub-items into a new trip for the accepter).
  6) Sora 2 promotional video (12s, 1280x720) saved to /app/frontend/assets/marketing/promo.mp4.

backend:
  - task: "Partial PATCH for sub-items"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          _generic_update_factory now accepts a `dict` body (via fastapi Body) and only
          $set's whitelisted keys from Model.model_fields (minus id/trip_id). Same treatment
          for the new /documents PATCH. Verified with curl: PATCH flights with only {"notes"}
          keeps airline/cost/etc unchanged.
      - working: true
        agent: "testing"
        comment: |
          Verified via /app/backend/tests/backend_round4_test.py::TestPartialPatchRegression.
          For each of flights, transport, stays, attractions, tickets, and documents:
          created a fully-populated sub-item, PATCHed exactly ONE field, GET'd back and
          asserted every other field is unchanged. All 6 sub-item classes PASS. On documents,
          file_base64 and size are also preserved when PATCHing only notes.
  - task: "PDF ingestion for AI booking parser"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          When mime=="application/pdf", server uses pypdf to extract up to 20 pages, caps at
          18k chars, and passes as text prompt (no image_base64 to Vision). ParseBookingRequest
          max_length raised to 14 MB base64 (~10 MB PDF).
      - working: true
        agent: "testing"
        comment: |
          Per review request, skipped the real-PDF LLM path (cost/flakiness). Verified the
          error branch: POST /api/ai/parse-booking with mime=application/pdf and invalid
          base64 bytes ("not a real PDF") returns 400 with detail "Could not read PDF" —
          confirms the pypdf try/except correctly funnels malformed input to the 400 path
          and does NOT leak to the LLM. Test: TestParseBookingPDFInvalid.
  - task: "Documents collection + CRUD"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          New Document model + GET/POST/PATCH/DELETE endpoints. list_documents strips
          file_base64 to keep responses small; get_document returns the blob. 8 MB cap.
          Public share endpoint returns documents metadata (no blobs).
      - working: true
        agent: "testing"
        comment: |
          Full CRUD lifecycle verified (TestDocumentsCRUD::test_full_lifecycle):
          POST returns computed size; LIST strips file_base64 to "" while keeping size>0;
          single GET returns full blob equal to what was POSTed; PATCH notes-only preserves
          blob + size; DELETE removes the doc and subsequent GET is 404. Access control
          verified (TestDocumentsAccessControl): a second seeded user gets 404 on GET
          single, LIST via trip, PATCH, and DELETE for a doc owned by user_demo_marketing.
  - task: "Collaboration invites (collab + copy) + collaborators access"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          Added Trip.collaborators: List[str]. require_trip supports owner+collaborator, with
          owner_only kwarg for delete/invite creation. New endpoints:
            POST /api/trips/{id}/invites   {mode: collab|copy}
            GET  /api/invites/{token}       (public preview, no auth)
            POST /api/invites/{token}/accept
            DELETE /api/trips/{id}/collaborators/{user_id}
          Copy mode deep-clones sub-items with a UUID remap so ticket <-> item links survive.
          list_trips now returns trips where the user is owner OR collaborator.
      - working: true
        agent: "testing"
        comment: |
          Collab flow (TestInviteCollab): owner POST invite → public GET preview no-auth
          returns trip/owner info with expired=false → second user accepts → trip appears
          in second user's /trips list → second user PATCH flight on shared trip SUCCEEDS
          (verified other fields preserved) → second user DELETE /trips returns 403 (owner
          only) → owner revokes via DELETE /trips/{id}/collaborators/{uid} and trip
          disappears from ex-collaborator's list. Copy flow (TestInviteCopy): owner has
          trip with flight+ticket bidirectionally linked; copy invite accepted by second
          user returns NEW trip_id owned by them; cloned name starts with "Copy of ";
          cloned flight/ticket have new UUIDs; CRITICAL: cloned_ticket.linked_item_id
          points to cloned_flight.id AND cloned_flight.ticket_id points to cloned_ticket.id
          (not originals); deleting the clone leaves original flight+ticket intact. All
          checks PASS.

frontend:
  - task: "Documents tab UI"
    implemented: true

  - task: "Offline mutation queue + client-provided id on create"
    implemented: true
    working: true
    file: "/app/frontend/src/api.ts, /app/frontend/src/localStore.ts, /app/frontend/src/syncQueue.ts, /app/frontend/src/syncWorker.tsx, /app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: |
          Server: TripCreate accepts optional `id`; if it collides with an existing trip
          owned by the same user, the endpoint returns that trip (idempotent). Same
          idempotency added to the generic sub-item create factory.
          Client: a new `serverMirror` LocalStore instance mirrors every online GET into
          AsyncStorage so offline reads keep working. Every online write is optimistically
          applied to the mirror; when fetch throws a TypeError / network error, the
          mutation is enqueued in `ts:syncqueue:v1`. A `SyncProvider` in _layout runs a
          NetInfo-driven drain loop that replays queued ops FIFO once connectivity
          returns, marks 4xx/409/410 as permanent failures (recorded in a "failed" log
          the user can dismiss) and invalidates react-query on success.
          E2E screenshot test confirmed: with /api/** blocked, creating a trip renders
          it instantly, the queue persists to localStorage, and once the block is
          removed the server received the create in FIFO order with the client-provided
          id preserved.
      - working: true
        agent: "testing"
        comment: |
          Round 5 verified via /app/backend/tests/backend_round5_test.py — 12/12 PASS.
          Also re-ran Round 4 regression: 14/14 PASS after fixing one stale assertion.
          Total 26/26 PASS. Confirmed:
          • POST /api/trips with client id → returned trip.id == supplied uuid.
          • Repeat POST same payload → same id, DB count unchanged (idempotent).
          • Same id + different name/destination → returns ORIGINAL trip unchanged

  - task: "PWA: installable manifest + service worker + offline shell"
    implemented: true
    working: true
    file: "/app/frontend/public/manifest.json, /app/frontend/public/sw.js, /app/frontend/public/icon-192.png, /app/frontend/public/icon-512.png, /app/frontend/public/icon-maskable-512.png, /app/frontend/public/apple-touch-icon.png, /app/frontend/public/favicon.png, /app/frontend/src/pwa.ts, /app/frontend/app/_layout.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: |
          Web app is now installable:
          - Generated 192/512/maskable/180/32 icon PNGs from the black-hole
            "TS" logo into /app/frontend/public/. Every image starts with a
            valid PNG magic.
          - Added /public/manifest.json with name, short_name, start_url "/",
            display "standalone", theme_color "#6B8E7A", background_color
            "#F7F5F0", three icon entries (any + maskable), and a "New trip"
            shortcut.
          - Added /public/sw.js: precaches app-shell assets on install;
            stale-while-revalidate for static JS/CSS/images/fonts;
            network-first with cached "/" fallback for navigations; never
            intercepts /api/* so the existing sync queue / localStore
            offline layer remains authoritative for app data.
          - Because expo-router with web.output "single" bypasses +html.tsx,
            registration happens from /app/frontend/src/pwa.ts (called once
            in _layout.tsx). It injects <link rel="manifest">, theme-color,
            apple-* meta tags, apple-touch-icon and viewport-fit=cover, and
            registers the service worker on window.load. Skipped on Metro
            dev origins so hot reload keeps working.
          - Verified in a real browser via screenshot_tool: all head tags
            appear, /manifest.json returns 200 JSON with 3 icons, /sw.js
            returns 200 with correct MIME, navigator.serviceWorker.register
            resolves with active:true, and a guest-created trip persists
            across a full page reload (localStorage entry preserved).
          - Offline app-data is unchanged from previous rounds: localApi
            handles guest mode, serverMirror + syncQueue handle signed-in
            offline usage.

            (proves the endpoint does not stomp existing docs).
          • Second-user hijack attempt → server issues a FRESH uuid, returned trip
            belongs to the second user, first user's trip untouched (name, destination,
            user_id all intact).
          • Sub-item POST flights: same id + same trip → returns existing row, no dup;
            same id + DIFFERENT trip → server generates fresh id, both flights coexist.
          • DELETE cleanup works on client-id-created trips.
          • Seed trip 'Tokyo & Kyoto' + seed token still authenticate at the end.
          • Round 4 regression (partial PATCH ×6, documents CRUD, invite collab + copy)
            all still green.
          One tiny test-file fix applied: backend_round4_test.py owner_email assertion
          updated from 'alex@travelspace.demo' to '' — server correctly masks the email
          on the public invite preview (privacy fix noted in Round 4 action items);
          the old assertion was stale.
  - task: "Import Guest Trips on sign-in"
    implemented: true
    working: true
    file: "/app/frontend/src/components/ImportGuestModal.tsx, /app/frontend/app/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          One-time modal after Google sign-in when localApi still has trips. Reuses the
          new idempotent create-with-id endpoints so the migration preserves ids across
          every collection (trips, flights, transport, stays, attractions, tickets,
          documents). Options: Import / Keep locally / Discard. Dismissal tracked in
          storage under ts_guest_import_dismissed.

    working: true
    file: "/app/frontend/src/components/tabs/Documents.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          Photo (ImagePicker) + PDF/File (DocumentPicker) upload, base64-encoded on device,
          preview thumbnail, link-to selector for any other tab item, opens via cache write +
          Linking on native / data URI on web. Registered as 9th tab in /app/trip/[id].tsx.
  - task: "PDF picker in AutoAddSheet"
    implemented: true
    working: true
    file: "/app/frontend/src/components/AutoAddSheet.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          "Or attach a PDF booking" secondary button uses DocumentPicker with pdf type.
          Body sent with mime=application/pdf so server routes to pypdf extractor.
  - task: "PDF attachment on Tickets"
    implemented: true
    working: true
    file: "/app/frontend/src/components/tabs/Tickets.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          Two side-by-side pickers (Photo | PDF) in the ticket modal. Card preview shows a
          "Open PDF" tile when a PDF is attached; tapping downloads it to cache and opens
          via Linking.
  - task: "Guest / local-only mode"
    implemented: true
    working: true
    file: "/app/frontend/src/localStore.ts, /app/frontend/src/api.ts, /app/frontend/src/auth.tsx, /app/frontend/app/login.tsx, /app/frontend/app/_layout.tsx, /app/frontend/app/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          "Continue without signing in" on the login screen calls useLocal() which sets
          isLocal=true and setLocalMode(true) on the api client. All trip/sub-item calls
          route to localApi (AsyncStorage-backed) instead of fetch. AuthGate accepts either
          user or isLocal to consider the session valid. Home shows a "Guest mode" banner
          with a Sign-in upsell.
  - task: "Share sheet with three modes + invite screen"
    implemented: true
    working: true
    file: "/app/frontend/src/components/ShareOptionsSheet.tsx, /app/frontend/app/invite/[token].tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          ShareOptionsSheet now shows three big mode cards (Read-only / Invite / Copy) and
          conditionally shows the per-tab toggle rows only for the public read-only case.
          Invite screen (/invite/[token]) is added to the "in-public" allowlist so it works
          without login; it previews trip name + owner and dispatches accept.

metadata:
  created_by: "main_agent"
  version: "2.0"
  test_sequence: 4
  run_ui: false

test_plan:
  current_focus:
    - "Partial PATCH for sub-items"
    - "PDF ingestion for AI booking parser"
    - "Documents collection + CRUD"
    - "Collaboration invites (collab + copy) + collaborators access"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      Please run backend regression + new-endpoint tests. Auth token to use:
      Authorization: Bearer demo_marketing_token_12345
      Seeded user_id: user_demo_marketing (email alex@travelspace.demo)
      Seeded trip_id: 9fbdeac7-a11c-4be2-a448-9c8560a1b6ad (has 1 flight, etc.)
      Focus:
      1. PATCH /api/flights/{id} with only {"notes":"x"} — assert airline/cost unchanged.
      2. Same partial-update check on transport, stays, attractions, tickets, documents.
      3. POST /api/trips/{id}/documents with a tiny base64 blob, then list (should strip
         file_base64), get single (should return blob), PATCH notes only, DELETE.
      4. Invite lifecycle: POST /trips/{id}/invites both modes, GET /invites/{token}
         preview without auth, POST /invites/{token}/accept — for collab mode, the trip
         list of ANOTHER user (create a second session? or use existing) should include
         the trip after accept; for copy mode, a new trip is returned with cloned
         sub-items and ticket <-> item links preserved.
      5. Access control: user without ownership OR collab must 404 on GET/PATCH.
      6. Backward-compat: ensure /trips still includes existing single-user trip.
      Skip frontend testing this round; UI was screenshot-verified.
  - agent: "testing"
    message: |
      Round 4 complete — 14/14 tests PASS (100%). See /app/backend/tests/backend_round4_test.py
      and /app/test_reports/iteration_3.json + /app/test_reports/pytest/round4_results.xml.

      Highlights:
      • Partial PATCH regression PASSES for all 6 collections (flights/transport/stays/
        attractions/tickets/documents). Every non-patched field survives, including
        file_base64/size on documents.
      • Documents CRUD works end-to-end. LIST strips blob (empty string, size>0);
        single GET returns blob; PATCH notes-only preserves blob.
      • Access control isolates a second seeded user (404 on GET/LIST/PATCH/DELETE).
      • Collab invite: public preview no-auth works, accept adds user to collaborators,
        collab can PATCH sub-items, collab CANNOT delete trip (403), owner can revoke.
      • Copy invite: deep-clones flight+ticket with UUID remap — cloned ticket's
        linked_item_id and cloned flight's ticket_id both point to the CLONED IDs, not
        the originals. Deleting the clone leaves original data intact.
      • PDF invalid-bytes path returns 400 "Could not read PDF" as designed.
      • Seed token demo_marketing_token_12345 preserved; seed trip + QF25 flight untouched.

      Non-blocking action items for main agent:
      1. InvitePreview leaks owner_email to unauthenticated callers — consider dropping
         it or masking to first-letter+domain (@travelspace.demo).
      2. A collaborator can currently PATCH the trip itself (rename/etc). If that's not
         intended, tighten update_trip to owner_only or add finer-grained perms.
      3. Round 2 test file (backend_round2_test.py) still uses no auth — will 401 now.
         Either add Authorization headers or archive it.
  - agent: "testing"
    message: |
      Round 5 complete — 26/26 tests PASS (100%: 14 Round 4 regression + 12 new).
      Files: /app/backend/tests/backend_round5_test.py, /app/test_reports/iteration_4.json,
      /app/test_reports/pytest/round5_full_results.xml.

      New client-provided-id behaviour (all VERIFIED):
      • POST /api/trips with {"id": <new-uuid>, "name":"T1"} → 200, returned trip.id ==
        the uuid I sent. DB row count reflects exactly one insert.
      • Repeat identical POST → 200, same id, DB count DOES NOT grow (idempotent).
      • POST with same id but a different name/destination → returns the ORIGINAL trip
        UNCHANGED (server does not stomp existing docs — this is Read-Existing-If-Owned).
      • DELETE /api/trips/{id} still cleans up when the id was client-supplied.
      • Sub-item POST flights: same id + same trip returns existing row (no dup); same
        id + DIFFERENT trip → server issues a FRESH uuid, both rows coexist under
        their respective trips with independent data.
      • Hijack attempt: second seeded user POSTs with the first user's trip.id → server
        assigns a fresh id, returned trip belongs to the second user, first user's
        trip is intact (user_id, name, destination unchanged).
      • Seed regression: GET /api/trips/9fbdeac7-a11c-4be2-a448-9c8560a1b6ad still
        returns name "Tokyo & Kyoto"; GET /api/trips (seeded user) still contains it;
        Bearer demo_marketing_token_12345 still authenticates via /auth/me.

  - agent: "testing"
    message: |
      Round 6 complete — 26/26 tests PASS (100%). Files:
      /app/backend/tests/backend_round6_test.py,
      /app/test_reports/iteration_5.json,
      /app/test_reports/pytest/round6_results.xml.

      Verified all three deployment blocker fixes:

      A. PNG validity — every .png under /app/frontend/assets/ (14 files, incl. the
         10 that were fixed and the 4 pre-existing template PNGs) starts with the
         canonical 89 50 4E 47 0D 0A 1A 0A signature, Pillow reports format='PNG',
         and im.verify() passes. app.json icon/adaptiveIcon/favicon/splash paths
         all resolve to real PNGs. AAPT will now accept them on EAS Android build.

      B. /health endpoints — GET /health, HEAD /health, and GET /api/health on
         localhost:8001 all return 200 with {"status":"ok"}. GET /api/health via
         the public ingress URL also 200 without any auth header. Deployment
         probes will now succeed.

      C. DELETE /api/auth/me — end-to-end cascade verified with a scratch user:
         • Created scratch user (users + user_sessions rows in Mongo).
         • Scratch user created a trip + flight, and accepted a collab invite
           onto the seeded trip → confirmed collaborators list contained them.
         • DELETE /api/auth/me returned 200 {"ok": true}.
         • Post-delete assertions all PASS:
           - Scratch trip: gone.
           - Scratch flight: gone (cascade_delete_trip fired).
           - Scratch session: gone (subsequent GET /auth/me → 401).
           - Scratch user removed from seed trip's collaborators.
           - Seed trip untouched (id / name / destination / user_id / share_id /
             cover_photo / start_date / end_date all preserved).
           - Seed trip's flights unchanged (same ids and count).
           - users row for scratch user deleted.
           - Seed token demo_marketing_token_12345 still authenticates.
         • DELETE without Authorization → 401.

      D. Regression (non-destructive to seed data): partial PATCH on flights
         preserves other fields; documents create returns size, LIST strips
         file_base64 to empty, single GET returns full blob; invite create +
         public preview (no auth) returns expired=false + trip_name.

      No bugs found. No re-test needed. Nothing on the frontend was touched
      (per the review request, help.tsx delete button was skipped). One tiny
      optional cleanup listed in iteration_5.json: 10 <name>.png.jpg-source
      backup files can be deleted from /app/frontend/assets/ once the fix is
      confirmed on EAS.

  - agent: "testing"
    message: |
      Round 7 — PWA (web-only) verification. All checks PASS.

      A. Static assets (via curl + /app/backend/tests/pwa_static_test.py — 10/10):
         • GET /manifest.json → 200 application/json; body parses; name/short_name =
           "Travel Space"; display "standalone"; start_url "/"; theme_color "#6B8E7A";
           background_color "#F7F5F0"; icons include ("192x192","any"),
           ("512x512","any"), ("512x512","maskable"); shortcut "New trip" -> /trip/new.
         • GET /sw.js → 200 application/javascript; source contains isApiRequest guard
           that skips /api and /api/*.
         • /icon-192.png, /icon-512.png, /icon-maskable-512.png, /apple-touch-icon.png,
           /favicon.png → all 200 image/png with 89 50 4E 47 magic bytes.

      B. Runtime DOM injection (Playwright, 375x667 mobile viewport, waited for
         [data-testid=guest-btn]):
         • link[rel=manifest].href ends with /manifest.json.
         • meta[name=theme-color].content === "#6B8E7A".
         • meta[name=apple-mobile-web-app-capable].content === "yes".
         • meta[name=apple-mobile-web-app-title].content === "Travel Space".
         • link[rel=apple-touch-icon].href ends with /apple-touch-icon.png.
         • meta[name=viewport].content contains "viewport-fit=cover".

      C. Service worker registration (from page context, since setupPwa correctly
         skips localhost:3000 dev port):
         • 'serviceWorker' in navigator === true.
         • navigator.serviceWorker.register('/sw.js', {scope: '/'}) → registration.active
           truthy within ~1s; registration.scope === "http://localhost:3000/"
           (ends with "/"); active.state === "activated".
         • Post-registration fetch('/manifest.json') → 200 with body.name === "Travel Space"
           (SW did not break precache lookup).

      D. Offline / guest data-path (SW active during the full flow):
         • Tapped [data-testid=guest-btn] → home screen (create-trip FAB rendered).
         • Tapped [data-testid=create-trip-fab], filled input-name="PWA Offline Trip"
           and input-destination="Nowhere, Offline", tapped save-trip-btn.
         • JSON.parse(localStorage.getItem('ts:localstore:v1')).trips.length === 1,
           name "PWA Offline Trip" present.
         • page.reload() — NOT bounced to login (STILL_ON_LOGIN_AFTER_RELOAD=false);
           landed on trip detail (back-btn present).
         • localStorage after reload still has the trip.
         • [data-testid=tab-documents] opens with empty-state text
           "Attach visas, boarding passes, reservations, or any file that doesn't
           fit another tab." — a no-network read did not crash.

      E. SW does NOT hijack /api/*:
         • fetch('/api/health') via public ingress origin
           (https://explore-itinerary-30.preview.emergentagent.com/api/health) → 200
           {status: "ok"} while the SW is registered and controlling clients.
         • Note: same-origin fetch on localhost:3000/api/health returns Metro's
           index.html (Metro dev server doesn't proxy /api). This is expected — and
           it further proves the SW isn't the one serving it, since the response is
           text/html from Metro, not the cached shell.

      F. Backend regression (/app/backend/tests/backend_round6_test.py):
         • 26/26 PASS in 1.90s. Health endpoints, PNG validity across all 14 asset
           PNGs, DELETE /auth/me cascade with scratch user, partial-PATCH flight,
           documents blob strip, and invite lifecycle all still green with seed
           token demo_marketing_token_12345 intact.

      New files:
         • /app/backend/tests/pwa_static_test.py — reusable PWA static-asset suite.
         • /app/test_reports/pytest/round7_pwa_static.xml
         • /app/test_reports/pytest/round7_regression.xml
         • /app/test_reports/iteration_6.json

      No bugs found. No re-test needed. Nothing modified in application code.
