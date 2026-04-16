# Family Hub — Project Context for Claude Code

## What This Is
A self-hosted family dashboard web app running as a Proxmox LXC. The goal is a single URL shared with the whole family that acts as a **family operating system** — covering the shared household tasks, information, and communication that no single Apple/Google app handles well.

## Tech Stack
- **Runtime:** Node.js 20
- **Framework:** Express.js
- **Database:** SQLite (via `better-sqlite3`)
- **Auth:** bcrypt + JWT (stored in localStorage)
- **Frontend:** Vanilla JS SPA — no build step, no bundler, no framework
- **Real-time:** WebSocket (`ws` package) for live updates on shopping lists and message board
- **File uploads:** Multer (photos, documents)
- **Email:** Nodemailer (weekly digest)
- **Deployment:** systemd service inside a Debian/Ubuntu LXC on Proxmox
- **External access:** Cloudflare Tunnel (user sets this up manually — do not bake into installer)

### Why this stack
Owner already runs a maker hub (Node/Express/SQLite/WebSocket/Vanilla JS SPA) on Proxmox with this exact pattern. Consistency is intentional. No build step means no Node version headaches on the LXC. Single binary (SQLite) means zero database maintenance.

---

## File Structure
```
/opt/family-hub/
├── server.js              # Express entry point, WebSocket setup
├── package.json
├── .env                   # PORT, JWT_SECRET, CLAUDE_API_KEY, SMTP config
├── CLAUDE.md              # This file
├── db/
│   └── schema.sql         # All table definitions
├── routes/
│   ├── auth.js
│   ├── calendar.js
│   ├── photos.js
│   ├── board.js
│   ├── links.js
│   ├── shopping.js
│   ├── documents.js
│   ├── meals.js
│   ├── chores.js
│   ├── expenses.js
│   ├── watchlist.js
│   ├── recipes.js
│   ├── reminders.js
│   ├── ai.js              # Claude API proxy endpoints
│   └── webhooks.js        # N8N webhook endpoints
├── middleware/
│   ├── auth.js            # JWT verification middleware
│   └── upload.js          # Multer config
├── services/
│   ├── digest.js          # Weekly email digest scheduler
│   ├── reminders.js       # Birthday/event reminder cron
│   └── backup.js          # Nightly SQLite + photo backup (NFS-ready stub)
├── public/
│   ├── index.html         # SPA shell
│   ├── manifest.json      # PWA manifest
│   ├── sw.js              # Service worker (offline shopping list)
│   ├── css/
│   │   └── app.css
│   └── js/
│       ├── app.js         # Router, auth state, WebSocket client
│       ├── calendar.js    # FullCalendar integration
│       ├── photos.js
│       ├── board.js
│       ├── links.js
│       ├── shopping.js
│       ├── documents.js
│       ├── meals.js
│       ├── chores.js
│       ├── expenses.js
│       ├── watchlist.js
│       ├── recipes.js
│       ├── reminders.js
│       └── ai.js
└── data/
    ├── photos/            # Uploaded photo files
    └── documents/         # Uploaded document files
```

---

## Database Schema (SQLite)

### Users & Auth
```sql
users (id, name, email, password_hash, role, color, avatar_url, created_at)
-- role: 'admin' | 'member' | 'child'
-- color: hex color for calendar events, chore assignments
-- First registered user is auto-promoted to admin
```

### Calendar
```sql
events (id, title, start_datetime, end_datetime, all_day, color, user_id, description, recurring, recur_rule, created_at)
```

### Photos
```sql
albums (id, name, user_id, cover_photo_id, created_at)
photos (id, album_id, user_id, filename, original_name, caption, taken_at, created_at)
```

### Message Board
```sql
posts (id, user_id, title, body, pinned, created_at, updated_at)
reactions (id, post_id, user_id, emoji, created_at)
```

### Links Board
```sql
links (id, user_id, title, url, description, category, favicon_url, created_at)
```

### Shopping Lists
```sql
lists (id, name, created_by, created_at)
list_items (id, list_id, text, checked, checked_by, added_by, created_at, updated_at)
-- WebSocket broadcasts item check/uncheck to all connected clients in real time
```

### Document Vault
```sql
documents (id, user_id, title, filename, original_name, category, summary, visible_to, created_at)
-- category: wifi, insurance, medical, vehicle, appliances, emergency, financial, other
-- visible_to: 'all' | 'adults' — adults = role != 'child'
-- summary: AI-generated plain-English summary (optional, populated via /api/ai/summarize-doc)
```

### Meal Planner
```sql
recipes (id, user_id, title, ingredients_json, instructions, servings, tags, source_url, created_at)
meal_plan (id, date, meal_type, recipe_id, custom_meal, user_id, created_at)
-- meal_type: breakfast | lunch | dinner | snack
```

### Chores
```sql
chores (id, title, assigned_to, frequency, due_date, completed_at, completed_by, created_by, created_at)
-- frequency: once | daily | weekly | biweekly | monthly
```

### Expenses
```sql
expense_categories (id, name, color)
expenses (id, user_id, amount, description, category_id, date, receipt_filename, created_at)
budgets (id, category_id, monthly_limit, created_at)
```

### Watchlist
```sql
watchlist (id, user_id, title, type, year, description, poster_url, added_by, watched, watched_at, created_at)
-- type: movie | show
```

### Reminders
```sql
reminders (id, user_id, title, reminder_type, date, recur_yearly, days_before, notified_at, created_at)
-- reminder_type: birthday | anniversary | bill | registration | subscription | custom
```

### Pantry / Low Stock
```sql
pantry_items (id, name, threshold, current_stock, unit, auto_add_to_list, list_id, updated_by, updated_at)
```

---

## Auth Flow
- `POST /api/auth/register` — open if zero users exist, otherwise requires admin invite token
- `POST /api/auth/login` — returns JWT
- `POST /api/auth/invite` — admin generates invite link (single-use token, expires 48h)
- JWT middleware on all `/api/*` routes except `/api/auth/*`
- Role checks: `admin` can manage users; `child` role is blocked from expenses, document vault adult-only items
- Frontend stores JWT in localStorage, sends as `Authorization: Bearer <token>`

---

## Features Detail

### Shared Calendar
- FullCalendar.js loaded via CDN (no build step)
- Month/week/day/list views
- Events color-coded by user
- Anyone can create events; only creator or admin can edit/delete
- All-day and timed events, optional recurrence

### Photo Sharing
- Upload via drag-drop or file picker
- Organized into albums
- Family-wide gallery grid with lazy loading
- Lightbox viewer
- Photos stored at `/opt/family-hub/data/photos/`
- Max upload size: 20MB per photo

### Message Board
- Post with title + body
- Admin can pin posts (pinned float to top)
- Reactions: 👍 ❤️ 😂 😮 😢 — stored per-user, toggled
- New posts pushed to all connected clients via WebSocket

### Links Board
- Save URL with title, description, category tag
- Auto-fetch favicon on save
- Card grid layout, click opens in new tab
- Anyone can add; only author or admin can delete

### Shopping Lists
- Multiple named lists (Groceries, Costco, Hardware, etc.)
- Real-time sync via WebSocket — check an item and it clears for everyone instantly
- Offline support via service worker (cached for grocery store dead zones)
- AI can suggest forgotten items based on purchase history

### Document Vault
- Upload PDF, JPG, PNG
- Categories with icons: WiFi 📶, Insurance 🏥, Medical 💊, Vehicle 🚗, Appliances 🔧, Emergency 🚨, Financial 💰, Other
- Adult-only toggle hides from `child` role accounts
- AI summarizer endpoint: on upload, optionally call Claude API to extract key info and write plain-English summary
- **NFS/Paperless integration: NOT wired yet.** The service stub in `services/backup.js` has a TODO comment for the consume-folder path. When ready, bind-mount the NFS share and update the path — no code changes needed beyond that.

### Meal Planner
- Weekly grid view (Mon–Sun, breakfast/lunch/dinner)
- Assign a saved recipe or type a custom meal
- AI meal plan generator: input dietary restrictions, servings, what's in the fridge → Claude API returns a full week plan
- Auto-generate shopping list from meal plan (extracts ingredients from assigned recipes)
- Recipe box: title, ingredients (JSON array), instructions, servings, tags, optional source URL

### Chore Tracker
- Assign chores to family members with due dates
- Recurring chores auto-regenerate on completion
- Mark complete, see who completed what
- Dashboard shows overdue + due-this-week
- Push notification on assignment (Web Push)

### Expense Tracking
- Log expenses with category, amount, description, date
- Optional receipt photo upload
- AI receipt scanner: photo a receipt → Claude API extracts line items and total, pre-fills expense form
- Monthly budget per category with progress bar
- Simple monthly summary view

### Watchlist
- Add movies/shows with title, year, type, poster URL, description
- Mark as watched
- No external API required (manual entry), but leave stub for TMDB API integration

### Smart Reminders
- Birthday, anniversary, bill due, car registration, subscriptions
- Set days-before notice (default: 7 days and 1 day)
- Weekly digest includes upcoming reminders
- Cron job checks daily and sends push/email notifications

### Pantry Tracker
- Track household staples with current stock level
- When marked empty/low, optionally auto-add to a specified shopping list
- Family members can tap "We're out" on any item

---

## AI Features (Claude API)

All AI calls go through the backend (`/api/ai/*`) — the API key never touches the frontend.

### Endpoints
- `POST /api/ai/meal-plan` — Generate week meal plan. Body: `{ restrictions, servings, fridge_contents, nights }`
- `POST /api/ai/scan-receipt` — Analyze receipt image. Body: `{ image_base64, media_type }`
- `POST /api/ai/summarize-doc` — Summarize uploaded document. Body: `{ document_id }`
- `POST /api/ai/shopping-suggest` — Suggest missing items. Body: `{ list_id }`

### Model
Use `claude-sonnet-4-20250514` for all AI calls.

### API Key
Stored in `.env` as `CLAUDE_API_KEY`. If not set, AI endpoints return `503` with message `"AI features not configured"` — app works fully without it.

---

## PWA & Push Notifications

### PWA
- `manifest.json` with family hub name, icons, `display: standalone`
- Service worker (`sw.js`) caches: app shell, CSS/JS, shopping list API response
- Install prompt shown on first visit

### Web Push
- VAPID keys generated at install time, stored in `.env`
- `push_subscriptions` table stores per-user subscriptions
- Push sent on: chore assignment, reminder due, new pinned post, low pantry item

---

## Weekly Digest Email

Sent every Sunday at 8am (cron via `node-cron`).

Contents:
- Week ahead: all calendar events for next 7 days
- Chores due this week and who owns them
- Meal plan for the week
- Upcoming reminders (birthdays, bills, etc.)
- Any pinned message board posts
- Household snapshot: expense summary, pantry items running low

Config in `.env`:
```
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
DIGEST_FROM=familyhub@yourdomain.com
DIGEST_TO=comma,separated,emails
```

If SMTP not configured, digest job logs to console and skips sending.

---

## N8N Webhook Integration

Owner runs N8N on the same Proxmox cluster.

### Inbound (N8N → Family Hub)
`POST /api/webhooks/inbound` with `X-Webhook-Secret` header (stored in `.env` as `WEBHOOK_SECRET`)

Supported actions in body:
```json
{ "action": "add_shopping_item", "list_name": "Groceries", "item": "Milk" }
{ "action": "add_expense", "amount": 45.00, "description": "Gas", "category": "Vehicle" }
{ "action": "create_event", "title": "...", "start": "...", "end": "..." }
```

### Outbound (Family Hub → N8N)
Fire-and-forget `POST` to `N8N_WEBHOOK_URL` (in `.env`) on events:
- New expense logged
- Shopping list item checked off
- Document uploaded
- Chore completed

---

## Synology NAS Backup (Stub — NFS not wired)

`services/backup.js` runs nightly at 2am.

Currently: copies SQLite DB and `/data/photos/` + `/data/documents/` to a local backup path.

**TODO when NFS is ready:**
1. Bind-mount NFS share in the LXC (`/mnt/nas`)
2. Update `BACKUP_PATH` in `.env` to `/mnt/nas/family-hub-backup`
3. For Paperless consume: set `PAPERLESS_CONSUME_PATH=/mnt/nas/paperless/consume` in `.env` — the document upload route checks for this and copies new uploads there automatically

No other code changes needed. The hooks are already in place.

---

## Environment Variables (.env)

```env
PORT=3085
JWT_SECRET=change_this_to_random_string
NODE_ENV=production

# AI Features (optional — app works without this)
CLAUDE_API_KEY=

# Email / Weekly Digest (optional)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
DIGEST_FROM=
DIGEST_TO=

# Web Push VAPID (generated by installer)
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_EMAIL=mailto:admin@familyhub.local

# N8N Integration (optional)
WEBHOOK_SECRET=
N8N_WEBHOOK_URL=

# Backup
BACKUP_PATH=/opt/family-hub/backups
PAPERLESS_CONSUME_PATH=   # Leave blank until NFS is mounted
```

---

## Installer Script

The project should ship with `install.sh` that:
1. Updates apt and installs Node.js 20 via NodeSource
2. Creates `/opt/family-hub/` and copies project files
3. Runs `npm install`
4. Generates JWT_SECRET (openssl rand) and VAPID keys
5. Prompts for PORT (default 3085) and optional CLAUDE_API_KEY
6. Initializes SQLite DB from `db/schema.sql`
7. Creates `data/photos/` and `data/documents/` directories
8. Writes systemd unit file to `/etc/systemd/system/family-hub.service`
9. Enables and starts the service
10. Prints the access URL

---

## Development Notes

- No build step. Edit files, restart service: `systemctl restart family-hub`
- Logs: `journalctl -u family-hub -f`
- DB location: `/opt/family-hub/family-hub.db`
- To reset DB: stop service, delete `.db` file, restart (schema auto-applied on boot)
- SQLite WAL mode enabled for concurrent reads during photo uploads
- All API routes return JSON. Frontend handles all rendering.
- WebSocket path: `ws://host:port/ws` — auth via `?token=<jwt>` on connect

## Owner Context
- Proxmox 4-node cluster
- Existing LXCs: maker hub (Node/Express), Paperless-ngx, N8N, Cloudflare Tunnel
- Synology NAS on same network — NFS already configured for Paperless LXC (replicate same mount pattern when NFS is added to this LXC)
- Wants to retain Bambu Handy app for printers (irrelevant here, noted for general context)
- Prefers building from scratch over pre-built solutions, but pragmatically uses established libraries (FullCalendar, Multer, bcrypt, ws)
