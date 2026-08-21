# Deploying Liam's Day

No terminal required. Everything here is a browser, GitHub's web uploader, and Netlify's dashboard — the same way Japan Trip Splitter is edited.

Budget check: **each production deploy costs 15 of Netlify's 300 free monthly credits.** This whole process uses 2–3. Don't push twenty small fixes in an afternoon.

---

## Part A — Put the code on GitHub (~10 min)

**A1.** Go to **github.com/new**.

- **Repository name:** `liams-day`
- **Public** — recommended. There are no secrets in this code; the PIN lives in Netlify, not in any file. A public repo is a thing a hiring manager can click on, which is half the point of building it.
- Do **not** tick "Add a README" or "Add .gitignore" — the upload already includes one.
- Click **Create repository**.

**A2.** On the empty repo page, click the link **"uploading an existing file"**.

**A3.** ⚠️ **Show hidden files in Finder first.** Press **Cmd + Shift + .** (period). A file called `.gitignore` will appear in the folder — it's invisible otherwise, and it's the file that stops junk from being committed later.

**A4.** Open the project folder:
`Desktop → cowork homebase → 02 Projects → Susan's Nanny Board → liams-day-app`

Select **everything inside** it — `Cmd + A` — and drag it onto the GitHub upload area. Subfolders and their structure come across intact.

You should see these upload:

```
.gitignore          netlify.toml        package.json
dev-server.js       seed.js             seed.json
shot.mjs            shot-edit.mjs
public/index.html   public/edit.html
netlify/functions/_store.js    _starter.js
netlify/functions/get-day.js   save-day.js
test/run.js         test/board.mjs      test/edit.mjs
shots/*.png
```

**A5.** Commit message: `Liam's Day — first build`. Click **Commit changes**.

---

## Part B — Connect Netlify (~10 min)

**B1.** Go to **app.netlify.com** and sign in with the account from the prototype drop.

**B2.** **Add new site → Import an existing project → GitHub.** Authorise Netlify if it asks. Pick **liams-day**.

**B3.** Netlify reads `netlify.toml` and should fill these in by itself. Check they say:

| Field | Value |
|---|---|
| Build command | *(empty)* |
| Publish directory | `public` |
| Functions directory | `netlify/functions` |

If the build command box has anything in it, clear it. There is no build step — that's deliberate.

**B4.** Click **Deploy**. It takes about a minute.

**B5.** It'll be live at something like `random-name-12345.netlify.app`. **The board will load, but saving won't work yet.** That's expected — the PIN isn't set. Part C fixes it.

---

## Part C — Set the PIN (~2 min) — required

Until you do this, **nothing can be saved**. The save function is written to refuse everything when no PIN is configured, so a misconfigured site is locked rather than wide open.

**C1.** **Site configuration → Environment variables → Add a variable.**

- **Key:** `EDIT_PIN`
- **Value:** four digits of your choosing
- **Scopes:** leave as all

**C2.** **Deploys → Trigger deploy → Deploy site.** Environment variables only reach the functions on a fresh deploy.

Write the PIN down. There is no reset flow — if it's lost, you change the variable and redeploy.

---

## Part C2 — Make the site public (~1 min) — required, and easy to miss

**Netlify creates new projects as Private.** A private project can only be opened by someone signed into your Netlify account — so Melody would hit a login wall, which breaks the entire premise. This is not the same thing as the GitHub repo's public/private setting; they're unrelated.

**Site configuration → Access & security → Visitor access → Project visibility → Edit visibility**

- **Production visibility → Public** ← this is the one that matters
- **Deploy Preview visibility → leave Private.** Previews are throwaway builds; there's no reason to expose them.

**How you'd notice if you skipped it:** opening the board on a phone or another device prompts for a Netlify login with your email. On your own laptop it looks fine, because you're already signed in — which is exactly why it's easy to miss.

**Confirm it worked:** open the board in a private/incognito window. No login prompt, board loads. Better still, open it on a device that has never signed into any of your accounts. That's the closest you can get to being Melody.

---

## Part D — Name it (~1 min)

**Site configuration → General → Change site name → `liams-day`.**

You get:

- **Melody's board:** `https://liams-day.netlify.app`
- **Susan's planner:** `https://liams-day.netlify.app/edit.html`

---

## Part E — Storage

Nothing to do. Netlify Blobs is available to the site automatically.

There's no seeding step either — the app ships with a starter list of foods, notes and chores (with Chinese), so Susan has something to tap the first time she opens it. Her first save writes her own library into storage and takes over from there. Emergency contacts start empty on purpose; she adds her own.

---

# Phase 4 — Testing on real devices (~20 min)

Do these in order. **Test 3 is the one that matters** — it's the failure that made Susan return her last device, and it's the one thing the prototype couldn't demonstrate.

### 1. Plan something (laptop)
Open `/edit.html`. Enter the PIN. Build a plan — tap a few foods into Breakfast in a deliberately odd order, add a note, add a chore. Hit **Save**. You should see *"Saved — Melody's tablet will show this."*

### 2. Read it back (phone)
Open the board URL on your phone. Everything you just entered should be there, **in the order you tapped it**.

### 3. 🔴 The sync test
Leave the board open on your phone. Put the phone down — don't touch it.
On the laptop, change something and save.
**Within 60 seconds the phone should update on its own.**

If this fails, stop and tell me. Nothing else matters until it works.

### 4. Pin it to the home screen (phone)
Share → Add to Home Screen. It should open like an app, no browser chrome. This is the same gesture Susan will use on the Fire tablet, so it's worth doing once yourself before you explain it to her.

### 5. Chinese
Tap **中文**. Every line should show Chinese with English underneath, and no empty boxes (□□□). Your iPhone has Chinese fonts built in, so this is only a partial check — **the Fire tablet is the real test** and only Susan can run it.

### 6. Offline
Put the phone in airplane mode and reload the board. You should see the last saved plan with a *"Showing the last saved plan — no connection right now"* line, not an error page.

### 7. Wrong PIN
On `/edit.html` in a private browsing window, try a wrong PIN. It should refuse and stay locked.

### 8. Mid-day edit
Change today's plan and confirm it reaches the board. Susan needs to be able to fix things from work.

---

# Handover to Susan

Once phase 4 passes:

1. Send her the **board link** and the **planner link + PIN** — the PIN privately, not in the same message as the link.
2. Tell her to add her own **emergency contacts** via the ⚙ link.
3. **The one disclosure:** the board has no login by design, so it sits at an unlisted but publicly reachable address. Anyone with the link could see it, including the phone numbers. She should know that before her real numbers go in — it's her call, not a problem to solve for her.
4. Walk her through pinning it to Liam's Fire tablet: open the link in Silk, menu, **Add to Home screen**.
5. Mention that anything she types herself starts out English-only, since there's no Chinese for it yet.

---

## If something goes wrong

| Symptom | Where to look |
|---|---|
| **Asked to log into Netlify when opening the board** | Project visibility is still Private — see Part C2. This is the one that would silently break it for Melody. |
| Saving says the PIN was rejected | `EDIT_PIN` not set, or set but not redeployed since (Part C) |
| Board loads but is empty | Normal on a brand-new site — nothing's been planned yet |
| "Could not save" | Netlify **Logs → Functions** for `save-day` |
| Board never updates on its own | Check `get-day` in the function logs; the poll runs once a minute |
| Chinese shows as boxes | The device is missing Chinese fonts — a Fire tablet problem, not a code one |

**To change anything later:** edit the file on github.com, commit, and Netlify redeploys in about a minute. Same loop as the Trip Splitter.
