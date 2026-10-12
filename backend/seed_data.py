import asyncio
import random
from datetime import datetime, timedelta, timezone
from app.database.connection import engine
from sqlalchemy import text

async def seed_data():
    async with engine.begin() as conn:
        print("Fetching main users...")
        users_res = await conn.execute(text("SELECT id, email, role FROM users WHERE email IN ('admin@gmail.com', 'test@gmail.com', 'user@gmail.com')"))
        users = users_res.fetchall()
        
        admin_id = next((u.id for u in users if u.role == 'ADMIN'), None)
        tester_id = next((u.id for u in users if u.role == 'TESTER'), None)
        user_id = next((u.id for u in users if u.role == 'USER'), None)
        
        if not admin_id or not tester_id or not user_id:
            print("Could not find all 3 required users. Ensure they exist.")
            return

        print("Creating Project...")
        now = datetime.now(timezone.utc)
        await conn.execute(
            text("INSERT INTO projects (name, project_key, description, created_at, updated_at) VALUES (:name, :pkey, :desc, :now, :now)"),
            {"name": "Nexus Pay App", "pkey": "NEX", "desc": "Next-Gen Mobile Wallet Application", "now": now}
        )
        proj_res = await conn.execute(text("SELECT id FROM projects WHERE name = 'Nexus Pay App'"))
        project_id = proj_res.scalar()

        print("Creating Sprints...")
        s1_start = now - timedelta(days=14)
        s1_end = now - timedelta(days=2)
        s2_start = now - timedelta(days=1)
        s2_end = now + timedelta(days=13)
        s3_start = now + timedelta(days=15)
        s3_end = now + timedelta(days=29)

        await conn.execute(
            text("""INSERT INTO sprints (name, goal, start_date, end_date, project_id, status, assigned_tester_id, estimated_team_members, working_days, hours_per_day, created_at, updated_at, completed_at)
                    VALUES (:n, :g, :sd, :ed, :pid, :st, :tid, :etm, :wd, :hpd, :now, :now, :ca)""")
            ,[
                {"n": "Sprint 1: MVP Core", "g": "Establish core auth and DB", "sd": s1_start, "ed": s1_end, "pid": project_id, "st": "COMPLETED", "tid": tester_id, "etm": 3, "wd": 10, "hpd": 8, "now": now, "ca": s1_end},
                {"n": "Sprint 2: Payments UI", "g": "Implement biometric auth and UI", "sd": s2_start, "ed": s2_end, "pid": project_id, "st": "IN_PROGRESS", "tid": tester_id, "etm": 3, "wd": 10, "hpd": 8, "now": now, "ca": None},
                {"n": "Sprint 3: API Gateways", "g": "Integrate third-party bank APIs", "sd": s3_start, "ed": s3_end, "pid": project_id, "st": "PLANNED", "tid": tester_id, "etm": 3, "wd": 10, "hpd": 8, "now": now, "ca": None}
            ]
        )
        sprints_res = await conn.execute(text("SELECT id, name FROM sprints ORDER BY start_date ASC"))
        sprints = sprints_res.fetchall()
        sp1_id, sp2_id, sp3_id = sprints[0].id, sprints[1].id, sprints[2].id

        print("Creating Issues...")
        issues_data = [
            ("NEX-1", "Setup PostgreSQL Database", "Initialize AWS RDS", "ENHANCEMENT", "CRITICAL", "URGENT", "CLOSED", sp1_id, admin_id, admin_id, s1_start + timedelta(days=2)),
            ("NEX-2", "Create User Login API", "FastAPI endpoint for JWT auth", "FEATURE_REQUEST", "MAJOR", "HIGH", "CLOSED", sp1_id, admin_id, tester_id, s1_start + timedelta(days=5)),
            ("NEX-3", "Fix Token Expiration Bug", "Token expires too early", "BUG", "MAJOR", "HIGH", "CLOSED", sp1_id, tester_id, tester_id, s1_start + timedelta(days=9)),
            ("NEX-4", "Setup CI/CD Pipeline", "Github actions config", "TECHNICAL_DEBT", "MINOR", "MEDIUM", "CLOSED", sp1_id, admin_id, admin_id, s1_start + timedelta(days=10)),
            
            ("NEX-5", "Biometric Login UI", "FaceID / TouchID screen", "FEATURE_REQUEST", "MAJOR", "HIGH", "RESOLVED", sp2_id, admin_id, tester_id, now - timedelta(hours=2)),
            ("NEX-6", "Payment History Dashboard", "Show list of past transactions", "FEATURE_REQUEST", "MINOR", "MEDIUM", "IN_TESTING", sp2_id, user_id, tester_id, None),
            ("NEX-7", "App crash on Android 14", "Null pointer when opening camera", "BUG", "CRITICAL", "URGENT", "IN_DEVELOPMENT", sp2_id, tester_id, tester_id, None),
            ("NEX-8", "Dark Mode UI glitches", "Text unreadable on settings page", "BUG", "MINOR", "LOW", "IN_DEVELOPMENT", sp2_id, user_id, tester_id, None),
            ("NEX-9", "Refactor payment state management", "Migrate to Redux Toolkit", "TECHNICAL_DEBT", "MAJOR", "MEDIUM", "ASSIGNED", sp2_id, admin_id, tester_id, None),
            
            ("NEX-10", "Stripe API Integration", "Connect backend to Stripe", "FEATURE_REQUEST", "CRITICAL", "URGENT", "ASSIGNED", sp3_id, admin_id, tester_id, None),
            ("NEX-11", "User Profile Upload", "Allow S3 image upload", "FEATURE_REQUEST", "MINOR", "LOW", "ASSIGNED", sp3_id, user_id, tester_id, None),
            ("NEX-12", "Send email receipts", "Postmark integration", "ENHANCEMENT", "MAJOR", "MEDIUM", "REPORTED", sp3_id, admin_id, None, None),
            
            ("NEX-13", "Multi-language support (es, fr)", "Add i18n", "ENHANCEMENT", "MINOR", "LOW", "REPORTED", None, user_id, None, None),
            ("NEX-14", "Customer Support Chatbot", "Integrate AI bot", "FEATURE_REQUEST", "MINOR", "LOW", "REPORTED", None, admin_id, None, None),
        ]

        for key, title, desc, typ, sev, prio, stat, sp_id, rep_id, ass_id, res_at in issues_data:
            await conn.execute(
                text("""INSERT INTO issues (project_id, issue_key, title, description, issue_type, severity, priority, status, sprint_id, reporter_id, assignee_id, estimated_effort, created_at, updated_at, resolved_at) 
                        VALUES (:pid, :key, :title, :desc, :typ, :sev, :prio, :stat, :spid, :repid, :assid, :ee, :now, :now, :resat)"""),
                {"pid": project_id, "key": key, "title": title, "desc": desc, "typ": typ, "sev": sev, "prio": prio, "stat": stat, "spid": sp_id, "repid": rep_id, "assid": ass_id, "ee": random.randint(1, 8), "now": now - timedelta(days=random.randint(1,5)), "resat": res_at}
            )

        print("Database perfectly seeded with company-style professional data!")

if __name__ == "__main__":
    asyncio.run(seed_data())
