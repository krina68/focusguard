# FocusGuard 🎯

A student productivity web app combining a Pomodoro timer, site blocker, note station, smart planner, and analytics — all in one focused workspace.

---

## Features

- **Pomodoro Timer** — Preset (25/5, 50/10, 90/15) and custom focus/break durations. SVG ring countdown, session dots, and a distraction counter. Auto-blocks social media when a session starts.
- **Site Blocker** — Blocks Instagram, TikTok, YouTube, Twitter, Reddit, and more via `/etc/hosts` for 30 minutes. Requires admin/sudo privileges.
- **Note Station** — Color-coded study notes with instant create, edit, and delete — no page reloads. Search and filter by color.
- **Study Planner** — Add subjects with exam dates and daily hours. Auto-generates a weighted weekly timetable based on urgency.
- **Analytics Dashboard** — 7-day study bar chart, total sessions, total hours, focus points, and streak tracking.
- **Achievement Badges** — Earn badges for session milestones, streaks, points, and note-taking.
- **Focus Music** — Built-in ambient sounds (rain, ocean, white noise, lo-fi, forest) with volume control.
- **Daily Reminder** — Set a daily study reminder with a custom time and message.
- **Theme Toggle** — Dark and light mode, persisted per user.

---

## Tech Stack

| Layer     | Technology                          |
|-----------|-------------------------------------|
| Backend   | Python 3, Flask                     |
| Database  | SQLite 3                            |
| Frontend  | Jinja2 templates, Vanilla JS        |
| Charts    | Chart.js 4                          |
| Fonts     | Plus Jakarta Sans, DM Mono (Google) |

---

## Project Structure

```
focusguard/
├── app.py            # Flask app — routes, DB logic, badge engine
├── blocker.py        # /etc/hosts site blocker (run as admin)
├── database.db       # SQLite database (auto-created on first run)
├── static/
│   └── style.css     # All styles — design tokens, layout, components
└── templates/
    ├── base.html     # Shared layout — sidebar, nav, theme toggle
    ├── index.html    # Landing page
    ├── login.html    # Sign in
    ├── register.html # Create account
    ├── dashboard.html# Stats, chart, badges, quick actions
    ├── timer.html    # Pomodoro timer UI
    ├── notes.html    # Note station
    └── planner.html  # Study planner + timetable
```

---

## Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/yourname/focusguard.git
cd focusguard
```

### 2. Install dependencies

```bash
pip install flask
```

### 3. Run the app

```bash
python app.py
```

Visit `http://127.0.0.1:5000` in your browser.

The SQLite database (`database.db`) is created automatically on first run.

---

## Site Blocker

The site blocker (`blocker.py`) edits your system's `hosts` file to redirect social media domains to `127.0.0.1` for 30 minutes.

**It requires administrator or sudo privileges to work.**

On Windows, run your terminal as Administrator. On macOS/Linux:

```bash
sudo python blocker.py
```

It auto-unblocks after 30 minutes. The app triggers it via the **Block Sites** button on the dashboard.

---

## Badge System

| Badge          | Condition                        |
|----------------|----------------------------------|
| First Step     | Complete 1 focus session         |
| Getting Started| Complete 5 sessions              |
| Focus Master   | Complete 25 sessions             |
| Scholar        | Complete 50 sessions             |
| 3-Day Streak   | Study 3 days in a row            |
| Week Warrior   | Study 7 days in a row            |
| Iron Will      | Study 14 days in a row           |
| Century Club   | Earn 100 focus points            |
| High Achiever  | Earn 500 focus points            |
| Note Taker     | Create 10 study notes            |

---

## Points

Each completed session awards `10 + focus_minutes` points. Points unlock badges and are displayed in the sidebar and dashboard.

---

## Configuration

The Flask secret key is set in `app.py`. Change it before deploying:

```python
app.secret_key = "your_secure_random_secret_here"
```

For production, use a proper WSGI server (e.g. Gunicorn) and consider migrating from SQLite to PostgreSQL.

---

## License

MIT — free to use, modify, and distribute.
