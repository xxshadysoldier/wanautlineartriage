# Linear Feedback Form

A static feedback form hosted on GitHub Pages that creates issues directly in your Linear workspace's triage queue.

---

## Architecture

```
GitHub Pages (index.html)
        │  fetch /labels & POST /issue
        ▼
Cloudflare Worker (worker.js)   ← holds your API key securely
        │  GraphQL
        ▼
Linear API
```

---

## Step 1 — Get your Linear credentials

### API Key
1. Go to **Linear → Settings → API → Personal API keys**
2. Create a new key and copy it

### Team ID
1. In Linear, go to **Settings → Workspace → Teams**
2. Click on your team — the URL will contain your team ID: `linear.app/your-org/settings/teams/TEAM_ID_HERE`
3. Alternatively: open the Linear API playground at `https://api.linear.app/graphql` and run:
   ```graphql
   query { teams { nodes { id name } } }
   ```

---

## Step 2 — Deploy the Cloudflare Worker

1. Sign up for a free account at [cloudflare.com](https://cloudflare.com)
2. Go to **Workers & Pages → Create → Worker**
3. Paste the contents of `worker.js` into the editor
4. Click **Deploy**
5. Go to the Worker's **Settings → Variables** and add:

   | Variable | Value |
   |---|---|
   | `LINEAR_API_KEY` | Your Linear API key |
   | `LINEAR_TEAM_ID` | Your Linear team ID |
   | `ALLOWED_ORIGIN` | `https://YOUR_GITHUB_USERNAME.github.io` |

6. Note the Worker URL — it looks like `https://your-worker.workers.dev`

---

## Step 3 — Configure the form

Open `index.html` and replace the placeholder Worker URL near the bottom of the `<script>` tag:

```js
const WORKER_URL = 'https://YOUR_WORKER_SUBDOMAIN.workers.dev';
```

---

## Step 4 — Deploy to GitHub Pages

1. Create a new GitHub repository (can be private)
2. Push `index.html` to the repo
3. Go to **Settings → Pages → Source** and set it to your main branch, root folder
4. GitHub will give you a URL like `https://YOUR_USERNAME.github.io/REPO_NAME`

---

## Step 5 — Embed in Notion

Notion supports embedding external pages with `/embed`:

1. In a Notion page, type `/embed`
2. Paste your GitHub Pages URL
3. Resize the embed to taste (recommended: full-width, ~700–800px tall)

> **Tip:** Notion's embed iframe sets `allow-same-origin` which is compatible with this form's CORS setup.

---

## How triage works

The Worker automatically finds the correct state for your team using this priority:

1. A state named exactly **"Triage"**
2. Any state with Linear's **`triage` type**
3. Any state with Linear's **`backlog` type**
4. The first state it finds

If your team has a custom triage workflow, make sure to name the target state "Triage" in Linear.

---

## Customisation

| What | Where |
|---|---|
| Form title & subtitle | `index.html` — `.header` section |
| Colour scheme | `index.html` — CSS `:root` variables |
| Add a "type" dropdown (Bug / Feature / etc.) | Add a new `<select>` field; pass the value as `labelIds` or a custom `priority` field in the Worker |
| Require a specific label | Add validation logic in the `submit-btn` click handler |
| Assign to a specific user | Add `assigneeId` to the `input` object in `handleCreateIssue` |

---

## Files

| File | Purpose |
|---|---|
| `index.html` | The feedback form (deploy to GitHub Pages) |
| `worker.js` | Cloudflare Worker API proxy (deploy to Cloudflare) |
| `README.md` | This guide |
