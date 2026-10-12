import asyncio
from datetime import datetime, timedelta, timezone
from app.database.connection import engine
from sqlalchemy import text

async def seed_notifications():
    async with engine.begin() as conn:
        print("Fetching main users...")
        users_res = await conn.execute(
            text("SELECT id, email, role FROM users WHERE email IN ('admin@gmail.com', 'test@gmail.com', 'user@gmail.com')")
        )
        users = users_res.fetchall()

        admin = next((u for u in users if u.role == 'ADMIN'), None)
        tester = next((u for u in users if u.role == 'TESTER'), None)
        user = next((u for u in users if u.role == 'USER'), None)

        if not admin or not tester or not user:
            print("Users not found")
            return

        print("Clearing old notifications...")
        await conn.execute(text("DELETE FROM notifications;"))

        # Fetch some issues
        issues_res = await conn.execute(text("SELECT id, issue_key, title FROM issues LIMIT 5;"))
        issues = issues_res.fetchall()

        now = datetime.now(timezone.utc)

        notifs = []
        if issues:
            # Notifications for Tester
            notifs.append({
                "uid": tester.id,
                "type": "ISSUE_ASSIGNED",
                "title": f"New Bug Assigned: {issues[0].issue_key}",
                "msg": f"You were assigned to verify '{issues[0].title}'.",
                "etype": "ISSUE", "eid": issues[0].id, "ekey": issues[0].issue_key,
                "is_read": False, "now": now - timedelta(minutes=15)
            })
            if len(issues) > 1:
                notifs.append({
                    "uid": tester.id,
                    "type": "ISSUE_STATUS_CHANGED",
                    "title": f"Status Update: {issues[1].issue_key}",
                    "msg": f"Issue '{issues[1].title}' was moved to IN_TESTING.",
                    "etype": "ISSUE", "eid": issues[1].id, "ekey": issues[1].issue_key,
                    "is_read": False, "now": now - timedelta(hours=2)
                })

            # Sprint notification for Tester
            notifs.append({
                "uid": tester.id,
                "type": "SPRINT_STARTED",
                "title": "Sprint 2 is now In-Progress",
                "msg": "Sprint 2: Payments UI has officially started. Begin test executions.",
                "etype": "SPRINT", "eid": None, "ekey": "Sprint 2",
                "is_read": False, "now": now - timedelta(hours=4)
            })

            # Notifications for Admin
            notifs.append({
                "uid": admin.id,
                "type": "ISSUE_REPORTED",
                "title": f"New Defect Reported: {issues[0].issue_key}",
                "msg": f"User reported '{issues[0].title}' with Urgent priority.",
                "etype": "ISSUE", "eid": issues[0].id, "ekey": issues[0].issue_key,
                "is_read": False, "now": now - timedelta(minutes=30)
            })
            if len(issues) > 2:
                notifs.append({
                    "uid": admin.id,
                    "type": "ISSUE_RESOLVED",
                    "title": f"Defect Resolved: {issues[2].issue_key}",
                    "msg": f"Tester verified and resolved '{issues[2].title}'.",
                    "etype": "ISSUE", "eid": issues[2].id, "ekey": issues[2].issue_key,
                    "is_read": True, "now": now - timedelta(days=1)
                })

            # Notifications for Regular User
            notifs.append({
                "uid": user.id,
                "type": "ISSUE_COMMENTED",
                "title": f"New Comment on {issues[0].issue_key}",
                "msg": "Admin added feedback: 'We have reproduced the issue and are patching it.'",
                "etype": "ISSUE", "eid": issues[0].id, "ekey": issues[0].issue_key,
                "is_read": False, "now": now - timedelta(minutes=45)
            })

        for n in notifs:
            await conn.execute(
                text("""
                    INSERT INTO notifications (user_id, notification_type, title, message, entity_type, entity_id, entity_key, is_read, created_at)
                    VALUES (:uid, :type, :title, :msg, :etype, :eid, :ekey, :is_read, :now)
                """),
                n
            )

        print(f"Successfully seeded {len(notifs)} rich notifications!")

if __name__ == "__main__":
    asyncio.run(seed_notifications())
