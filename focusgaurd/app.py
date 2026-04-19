from flask import (
    Flask, render_template, request, redirect,
    session, flash, jsonify, send_from_directory
)
import sqlite3
import hashlib
import subprocess
import os
from datetime import datetime, date, timedelta
from functools import wraps
import random

# Serve templates and static files from the same directory as app.py
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__, template_folder=os.path.join(BASE_DIR, "templates"), static_folder=os.path.join(BASE_DIR, "static"), static_url_path='/static')
app.secret_key = "focusguard_change_in_production_2024"

# ── Badge definitions ──────────────────────────────────────────────────────────
BADGES = {
    "first_session":  {"name": "First Step",       "icon": "🎯", "desc": "Complete your first focus session"},
    "five_sessions":  {"name": "Getting Started",  "icon": "⚡", "desc": "Complete 5 focus sessions"},
    "twenty_five":    {"name": "Focus Master",     "icon": "🏆", "desc": "Complete 25 focus sessions"},
    "fifty_sessions": {"name": "Scholar",          "icon": "📚", "desc": "Complete 50 sessions"},
    "streak_3":       {"name": "3-Day Streak",     "icon": "🔥", "desc": "Study 3 days in a row"},
    "streak_7":       {"name": "Week Warrior",     "icon": "⭐", "desc": "Study 7 days in a row"},
    "streak_14":      {"name": "Iron Will",        "icon": "💎", "desc": "Study 14 days in a row"},
    "points_100":     {"name": "Century Club",     "icon": "🎖",  "desc": "Earn 100 focus points"},
    "points_500":     {"name": "High Achiever",    "icon": "🚀", "desc": "Earn 500 focus points"},
    "notes_10":       {"name": "Note Taker",       "icon": "📝", "desc": "Create 10 study notes"},
}

# ── DB helpers ─────────────────────────────────────────────────────────────────
def get_db():
    db = sqlite3.connect("database.db")
    db.row_factory = sqlite3.Row
    return db

def init_db():
    db = get_db()
    db.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            username        TEXT    UNIQUE NOT NULL,
            password        TEXT    NOT NULL,
            points          INTEGER DEFAULT 0,
            streak          INTEGER DEFAULT 0,
            last_study_date TEXT,
            theme           TEXT    DEFAULT 'dark',
            ringtone        TEXT    DEFAULT 'bell',
            created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS sessions (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id             INTEGER NOT NULL,
            focus_minutes       INTEGER NOT NULL,
            completed           INTEGER DEFAULT 0,
            distractions_blocked INTEGER DEFAULT 0,
            completed_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS notes (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER NOT NULL,
            title      TEXT    NOT NULL,
            content    TEXT    DEFAULT '',
            color      TEXT    DEFAULT '#4493f8',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS planner (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER NOT NULL,
            subject     TEXT    NOT NULL,
            exam_date   TEXT    NOT NULL,
            daily_hours REAL    DEFAULT 2.0,
            color       TEXT    DEFAULT '#4493f8',
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS timetable (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id   INTEGER NOT NULL,
            day       TEXT NOT NULL,
            subject   TEXT NOT NULL,
            time_slot TEXT NOT NULL,
            color     TEXT DEFAULT '#4493f8',
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS badges (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id   INTEGER NOT NULL,
            badge_key TEXT    NOT NULL,
            earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, badge_key),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS reminders (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id       INTEGER UNIQUE NOT NULL,
            reminder_time TEXT    NOT NULL,
            message       TEXT    DEFAULT 'Time to study!',
            enabled       INTEGER DEFAULT 1,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
    """)
    db.commit()

init_db()

def hash_pw(pw):
    return hashlib.sha256(pw.encode()).hexdigest()

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if "user_id" not in session:
            return redirect("/login")
        return f(*args, **kwargs)
    return decorated

def get_user():
    if "user_id" not in session:
        return None
    return get_db().execute("SELECT * FROM users WHERE id=?", (session["user_id"],)).fetchone()

def update_streak(user_id):
    db = get_db()
    user = db.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    today = date.today().isoformat()
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    last = user["last_study_date"]
    if last == today:
        return user["streak"]
    new_streak = (user["streak"] + 1) if last == yesterday else 1
    db.execute("UPDATE users SET streak=?, last_study_date=? WHERE id=?", (new_streak, today, user_id))
    db.commit()
    return new_streak

def check_badges(user_id):
    db = get_db()
    user = db.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    total_s = db.execute("SELECT COUNT(*) as c FROM sessions WHERE user_id=? AND completed=1", (user_id,)).fetchone()["c"]
    total_n = db.execute("SELECT COUNT(*) as c FROM notes WHERE user_id=?", (user_id,)).fetchone()["c"]
    earned  = {r["badge_key"] for r in db.execute("SELECT badge_key FROM badges WHERE user_id=?", (user_id,)).fetchall()}

    CONDITIONS = {
        "first_session":  total_s >= 1,
        "five_sessions":  total_s >= 5,
        "twenty_five":    total_s >= 25,
        "fifty_sessions": total_s >= 50,
        "streak_3":       user["streak"] >= 3,
        "streak_7":       user["streak"] >= 7,
        "streak_14":      user["streak"] >= 14,
        "points_100":     user["points"] >= 100,
        "points_500":     user["points"] >= 500,
        "notes_10":       total_n >= 10,
    }

    new_badges = []
    for key, met in CONDITIONS.items():
        if met and key not in earned:
            db.execute("INSERT OR IGNORE INTO badges (user_id, badge_key) VALUES (?,?)", (user_id, key))
            new_badges.append({**BADGES[key], "key": key})
    db.commit()
    return new_badges

# ── Auth ───────────────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return render_template("index.html", user=get_user())

@app.route("/login", methods=["GET", "POST"])
def login():
    if "user_id" in session:
        return redirect("/dashboard")
    if request.method == "POST":
        u = request.form.get("username", "").strip()
        p = request.form.get("password", "")
        user = get_db().execute(
            "SELECT * FROM users WHERE username=? AND password=?", (u, hash_pw(p))
        ).fetchone()
        if user:
            session["user_id"] = user["id"]
            session["username"] = user["username"]
            flash(f"Welcome back, {u}!", "success")
            return redirect("/dashboard")
        flash("Invalid username or password.", "error")
    return render_template("login.html")

@app.route("/register", methods=["GET", "POST"])
def register():
    if "user_id" in session:
        return redirect("/dashboard")
    if request.method == "POST":
        u = request.form.get("username", "").strip()
        p = request.form.get("password", "")
        if not u or not p:
            flash("All fields are required.", "error")
        elif len(p) < 6:
            flash("Password must be at least 6 characters.", "error")
        else:
            try:
                db = get_db()
                db.execute("INSERT INTO users (username,password) VALUES (?,?)", (u, hash_pw(p)))
                db.commit()
                flash("Account created! Sign in now.", "success")
                return redirect("/login")
            except sqlite3.IntegrityError:
                flash("Username already taken.", "error")
    return render_template("register.html")

@app.route("/logout")
def logout():
    session.clear()
    flash("Logged out. See you next time!", "success")
    return redirect("/")

# ── Dashboard ──────────────────────────────────────────────────────────────────
@app.route("/dashboard")
@login_required
def dashboard():
    db = get_db()
    uid = session["user_id"]
    user = get_user()

    total_sessions = db.execute("SELECT COUNT(*) as c FROM sessions WHERE user_id=? AND completed=1", (uid,)).fetchone()["c"]
    total_minutes  = db.execute("SELECT COALESCE(SUM(focus_minutes),0) as m FROM sessions WHERE user_id=? AND completed=1", (uid,)).fetchone()["m"]
    total_notes    = db.execute("SELECT COUNT(*) as c FROM notes WHERE user_id=?", (uid,)).fetchone()["c"]

    earned_keys = {r["badge_key"] for r in db.execute("SELECT badge_key FROM badges WHERE user_id=?", (uid,)).fetchall()}
    all_badges = [{**info, "key": k, "earned": k in earned_keys} for k, info in BADGES.items()]

    return render_template("dashboard.html",
        user=user,
        total_sessions=total_sessions,
        total_minutes=total_minutes,
        total_hours=round(total_minutes / 60, 1),
        total_notes=total_notes,
        all_badges=all_badges,
    )

@app.route("/api/analytics")
@login_required
def analytics():
    db = get_db()
    uid = session["user_id"]
    rows = []
    for i in range(6, -1, -1):
        d = (date.today() - timedelta(days=i)).isoformat()
        r = db.execute(
            "SELECT COALESCE(SUM(focus_minutes),0) as m, COUNT(*) as c "
            "FROM sessions WHERE user_id=? AND completed=1 AND DATE(completed_at)=?",
            (uid, d)
        ).fetchone()
        rows.append({"date": d, "minutes": r["m"], "sessions": r["c"],
                     "label": (date.today() - timedelta(days=i)).strftime("%a")})
    return jsonify(rows)

# ── Timer ──────────────────────────────────────────────────────────────────────
@app.route("/timer")
@login_required
def timer():
    db = get_db()
    reminder = db.execute("SELECT * FROM reminders WHERE user_id=?", (session["user_id"],)).fetchone()
    return render_template("timer.html", user=get_user(), reminder=reminder)

@app.route("/api/session/complete", methods=["POST"])
@login_required
def session_complete():
    data = request.get_json()
    focus_min    = int(data.get("focus_minutes", 25))
    distractions = int(data.get("distractions", 0))
    uid = session["user_id"]

    db = get_db()
    db.execute(
        "INSERT INTO sessions (user_id, focus_minutes, completed, distractions_blocked) VALUES (?,?,1,?)",
        (uid, focus_min, distractions)
    )
    points_earned = 10 + focus_min
    db.execute("UPDATE users SET points=points+? WHERE id=?", (points_earned, uid))
    db.commit()

    streak     = update_streak(uid)
    new_badges = check_badges(uid)
    user       = get_user()

    return jsonify({
        "success":       True,
        "points_earned": points_earned,
        "total_points":  user["points"],
        "streak":        streak,
        "new_badges":    new_badges,
    })

@app.route("/api/reminder", methods=["POST"])
@login_required
def save_reminder():
    data = request.get_json()
    uid  = session["user_id"]
    t    = data.get("time", "")
    msg  = data.get("message", "Time to study!")
    ena  = int(data.get("enabled", True))
    db   = get_db()
    db.execute(
        "INSERT INTO reminders (user_id, reminder_time, message, enabled) VALUES (?,?,?,?) "
        "ON CONFLICT(user_id) DO UPDATE SET reminder_time=excluded.reminder_time, "
        "message=excluded.message, enabled=excluded.enabled",
        (uid, t, msg, ena)
    )
    db.commit()
    return jsonify({"success": True})

@app.route("/api/ringtone", methods=["POST"])
@login_required
def save_ringtone():
    rt = request.get_json().get("ringtone", "bell")
    db = get_db()
    db.execute("UPDATE users SET ringtone=? WHERE id=?", (rt, session["user_id"]))
    db.commit()
    return jsonify({"success": True})

# ── Notes ──────────────────────────────────────────────────────────────────────
@app.route("/notes")
@login_required
def notes():
    db = get_db()
    user_notes = db.execute(
        "SELECT * FROM notes WHERE user_id=? ORDER BY updated_at DESC",
        (session["user_id"],)
    ).fetchall()
    return render_template("notes.html", user=get_user(), notes=user_notes)

@app.route("/notes/create", methods=["POST"])
@login_required
def create_note():
    d     = request.get_json()
    title = (d.get("title") or "Untitled").strip()
    cont  = d.get("content", "")
    color = d.get("color", "#4493f8")
    uid   = session["user_id"]
    db    = get_db()
    cur   = db.execute(
        "INSERT INTO notes (user_id, title, content, color) VALUES (?,?,?,?)",
        (uid, title, cont, color)
    )
    db.commit()
    note = dict(db.execute("SELECT * FROM notes WHERE id=?", (cur.lastrowid,)).fetchone())
    check_badges(uid)
    return jsonify({"success": True, "note": note})

@app.route("/notes/edit/<int:nid>", methods=["POST"])
@login_required
def edit_note(nid):
    d    = request.get_json()
    db   = get_db()
    note = db.execute("SELECT * FROM notes WHERE id=? AND user_id=?", (nid, session["user_id"])).fetchone()
    if not note:
        return jsonify({"success": False}), 404
    db.execute(
        "UPDATE notes SET title=?, content=?, color=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
        (d.get("title", note["title"]), d.get("content", note["content"]),
         d.get("color", note["color"]), nid)
    )
    db.commit()
    return jsonify({"success": True})

@app.route("/notes/delete/<int:nid>", methods=["POST"])
@login_required
def delete_note(nid):
    db = get_db()
    db.execute("DELETE FROM notes WHERE id=? AND user_id=?", (nid, session["user_id"]))
    db.commit()
    return jsonify({"success": True})

# ── Planner ────────────────────────────────────────────────────────────────────
@app.route("/planner")
@login_required
def planner():
    db    = get_db()
    uid   = session["user_id"]
    plans = db.execute("SELECT * FROM planner WHERE user_id=? ORDER BY exam_date ASC", (uid,)).fetchall()
    tt    = db.execute("SELECT * FROM timetable WHERE user_id=? ORDER BY id ASC", (uid,)).fetchall()
    today = date.today()

    plans_out = []
    for p in plans:
        exam     = datetime.strptime(p["exam_date"], "%Y-%m-%d").date()
        days_left = max(0, (exam - today).days)
        plans_out.append({**dict(p), "days_left": days_left})

    # Build week schedule per plan (today → exam, up to 14 days shown)
    schedules = {}
    for p in plans_out:
        exam     = datetime.strptime(p["exam_date"], "%Y-%m-%d").date()
        end_date = min(exam, today + timedelta(days=13))
        days = []
        d = today
        while d <= end_date:
            days.append({"date": d.isoformat(), "label": d.strftime("%a %d"), "weekday": d.strftime("%A")})
            d += timedelta(days=1)
        schedules[p["id"]] = days

    return render_template("planner.html",
        user=get_user(), plans=plans_out, timetable=tt, schedules=schedules,
        now=today.isoformat()
    )

@app.route("/planner/add", methods=["POST"])
@login_required
def add_plan():
    subject     = request.form.get("subject", "").strip()
    exam_date   = request.form.get("exam_date", "")
    daily_hours = float(request.form.get("daily_hours", 2.0))
    color       = request.form.get("color", "#4493f8")
    if not subject or not exam_date:
        flash("Subject and exam date are required.", "error")
        return redirect("/planner")
    db = get_db()
    db.execute(
        "INSERT INTO planner (user_id, subject, exam_date, daily_hours, color) VALUES (?,?,?,?,?)",
        (session["user_id"], subject, exam_date, daily_hours, color)
    )
    db.commit()
    flash(f"Added {subject} to your study plan.", "success")
    return redirect("/planner")

@app.route("/planner/delete/<int:pid>", methods=["POST"])
@login_required
def delete_plan(pid):
    db = get_db()
    db.execute("DELETE FROM planner WHERE id=? AND user_id=?", (pid, session["user_id"]))
    db.commit()
    return jsonify({"success": True})

@app.route("/planner/generate", methods=["POST"])
@login_required
def generate_timetable():
    uid   = session["user_id"]
    db    = get_db()
    plans = db.execute("SELECT * FROM planner WHERE user_id=? ORDER BY exam_date ASC", (uid,)).fetchall()
    if not plans:
        flash("Add subjects to your planner first.", "error")
        return redirect("/planner")

    days       = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]
    time_slots = ["08:00–10:00","10:00–12:00","14:00–16:00","16:00–18:00","19:00–21:00"]
    today      = date.today()

    # Weight subjects by urgency
    pool = []
    for p in plans:
        exam      = datetime.strptime(p["exam_date"], "%Y-%m-%d").date()
        days_left = max(1, (exam - today).days)
        weight    = max(1, min(5, round(14 / days_left)))
        pool.extend([{"subject": p["subject"], "color": p["color"]}] * weight)

    random.shuffle(pool)

    db.execute("DELETE FROM timetable WHERE user_id=?", (uid,))
    idx = 0
    for day in days:
        for slot in time_slots[:2]:       # 2 slots per day = 14 slots/week
            if idx < len(pool):
                e = pool[idx]
                db.execute(
                    "INSERT INTO timetable (user_id, day, subject, time_slot, color) VALUES (?,?,?,?,?)",
                    (uid, day, e["subject"], slot, e["color"])
                )
                idx += 1
    db.commit()
    flash("Weekly timetable generated!", "success")
    return redirect("/planner")

# ── Misc ───────────────────────────────────────────────────────────────────────
@app.route("/block")
@login_required
def block_sites():
    try:
        subprocess.Popen(["python", "blocker.py"])
    except Exception:
        pass
    flash("Social media blocked for 30 minutes. Stay focused!", "success")
    return redirect("/timer")

@app.route("/api/theme", methods=["POST"])
@login_required
def toggle_theme():
    theme = request.get_json().get("theme", "dark")
    db    = get_db()
    db.execute("UPDATE users SET theme=? WHERE id=?", (theme, session["user_id"]))
    db.commit()
    session["theme"] = theme
    return jsonify({"success": True, "theme": theme})

if __name__ == "__main__":
    app.run(debug=True)
