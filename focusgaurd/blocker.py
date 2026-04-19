"""
blocker.py — FocusGuard Site Blocker
Blocks social media sites via /etc/hosts for 30 minutes, then unblocks.
Run as administrator/sudo for this to work.
"""
import time
import platform

HOSTS_PATH = r"C:\Windows\System32\drivers\etc\hosts" if platform.system() == "Windows" else "/etc/hosts"
REDIRECT    = "127.0.0.1"
BLOCK_DURATION = 30 * 60   # 30 minutes in seconds

SITES = [
    "www.instagram.com", "instagram.com",
    "www.snapchat.com",  "snapchat.com",
    "www.tiktok.com",    "tiktok.com",
    "www.youtube.com",   "youtube.com",
    "www.twitter.com",   "twitter.com",
    "www.x.com",         "x.com",
    "www.facebook.com",  "facebook.com",
    "www.reddit.com",    "reddit.com",
]

MARKER_START = "# == FocusGuard Block Start =="
MARKER_END   = "# == FocusGuard Block End =="


def block():
    entries = "\n".join(f"{REDIRECT} {site}" for site in SITES)
    block_section = f"\n{MARKER_START}\n{entries}\n{MARKER_END}\n"
    try:
        with open(HOSTS_PATH, "r") as f:
            content = f.read()
        if MARKER_START not in content:
            with open(HOSTS_PATH, "a") as f:
                f.write(block_section)
        print("[FocusGuard] Sites blocked.")
    except PermissionError:
        print("[FocusGuard] Permission denied. Run as administrator/sudo.")


def unblock():
    try:
        with open(HOSTS_PATH, "r") as f:
            lines = f.readlines()
        new_lines = []
        inside = False
        for line in lines:
            if MARKER_START in line:
                inside = True
                continue
            if MARKER_END in line:
                inside = False
                continue
            if not inside:
                new_lines.append(line)
        with open(HOSTS_PATH, "w") as f:
            f.writelines(new_lines)
        print("[FocusGuard] Sites unblocked.")
    except PermissionError:
        print("[FocusGuard] Permission denied. Run as administrator/sudo.")


if __name__ == "__main__":
    block()
    print(f"[FocusGuard] Blocking for {BLOCK_DURATION // 60} minutes...")
    time.sleep(BLOCK_DURATION)
    unblock()
