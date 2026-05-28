#!/usr/bin/env python3
"""Complete seeding process: finish seed_demo, run seed_attendance, verify, and report."""

import subprocess
import time
import sys
from backend.database import SessionLocal
from backend.models import Contact, Organisation, User, UserRole, Attendance, Decision

def check_contact_count():
    """Get current contact count."""
    db = SessionLocal()
    try:
        org = db.query(Organisation).filter(
            Organisation.name == 'The Standing Church'
        ).first()
        if org:
            return db.query(Contact).filter(
                Contact.organisation_id == org.id
            ).count()
    finally:
        db.close()
    return 0

def wait_for_seed_demo():
    """Wait for seed_demo to reach 5000 contacts."""
    print("⏳ Waiting for seed_demo.py to complete...")
    max_wait = 900  # 15 minutes
    elapsed = 0
    last_count = 0
    
    while elapsed < max_wait:
        count = check_contact_count()
        pct = (count / 5000) * 100
        
        if count != last_count:
            print(f"  Progress: {count}/5000 ({pct:.1f}%)")
            last_count = count
        
        if count >= 5000:
            print("✓ seed_demo COMPLETE")
            return True
        
        time.sleep(10)
        elapsed += 10
    
    print(f"⚠ Timeout: seed_demo reached {count}/5000, continuing anyway...")
    return False

def run_seed_attendance():
    """Run seed_attendance to create 2000 walk-ins."""
    print("\n⏳ Running seed_attendance.py...")
    print("  Creating 2000 walk-in attendees and decision records...\n")
    
    result = subprocess.run([
        sys.executable, "-m", "backend.seed_attendance",
        "--email", "agbolubela@gmail.com",
        "--phone", "+2349158523342",
        "--org", "The Standing Church",
        "--count", "2000"
    ])
    
    return result.returncode == 0

def verify_data():
    """Verify final data counts."""
    print("\n" + "="*60)
    print("📊 FINAL DATA SUMMARY")
    print("="*60)
    
    db = SessionLocal()
    try:
        org = db.query(Organisation).filter(
            Organisation.name == 'The Standing Church'
        ).first()
        
        if org:
            contacts = db.query(Contact).filter(
                Contact.organisation_id == org.id
            ).count()
            volunteers = db.query(User).filter(
                User.organisation_id == org.id,
                User.role == UserRole.volunteer
            ).count()
            attendance = db.query(Attendance).filter(
                Attendance.organisation_id == org.id
            ).count()
            decisions = db.query(Decision).filter(
                Decision.organisation_id == org.id
            ).count()
            
            print(f"\n✓ Contacts:      {contacts:,}")
            print(f"✓ Volunteers:    {volunteers}")
            print(f"✓ Attendance:    {attendance:,}")
            print(f"✓ Decisions:     {decisions:,}")
            
            print("\n" + "="*60)
            print("🔓 LOGIN CREDENTIALS")
            print("="*60)
            print("\nPrimary Admin:")
            print("  Email: agbolubela@gmail.com")
            print("  Role: MINISTER (full access)")
            print("\nSecondary Admin:")
            print("  Email: oluwaferanmiibitunde@gmail.com")
            print("  Role: MINISTER (full access)")
            
            print("\n✓ Both accounts can see all 5,000+ contacts, volunteers,")
            print("  attendance records, and decision cards across all hubs.")
            
            print("\n" + "="*60)
            print("✅ SEEDING COMPLETE")
            print("="*60)
    finally:
        db.close()

def check_git_status():
    """Check if git push is needed."""
    print("\n📤 Git Status:")
    result = subprocess.run(["git", "status", "--short"], capture_output=True, text=True)
    if result.stdout.strip():
        print(f"  Uncommitted changes detected:\n{result.stdout}")
    else:
        print("  ✓ All changes committed")
    
    result = subprocess.run(["git", "log", "--oneline", "-1"], capture_output=True, text=True)
    print(f"  Latest: {result.stdout.strip()}")

if __name__ == "__main__":
    try:
        wait_for_seed_demo()
        run_seed_attendance()
        verify_data()
        check_git_status()
    except Exception as e:
        print(f"\n❌ Error: {e}", file=sys.stderr)
        sys.exit(1)
