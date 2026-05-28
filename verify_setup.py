#!/usr/bin/env python
import sys
sys.path.insert(0, '.')
from backend.config import settings
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from backend.models import User, Contact, Attendance, Decision

engine = create_engine(settings.DATABASE_URL)
Session = sessionmaker(bind=engine)
db = Session()

ministers = db.query(User).filter(User.role == 'minister').all()
hubs = db.query(User).filter(User.role == 'hub_leader').all()
vols = db.query(User).filter(User.role == 'volunteer').all()
contacts = db.query(Contact).count()
attendance = db.query(Attendance).count()
decisions = db.query(Decision).count()

print('\n' + '='*60)
print('✓ SETUP COMPLETE - DATABASE SEEDED')
print('='*60 + '\n')

print('MINISTERS:')
for u in ministers:
    email = u.email or u.phone
    print(f'  {email:45} {u.name}')

print('\nHUB LEADERS:')
for u in hubs:
    email = u.email or u.phone
    print(f'  {email:45} {u.name}')

print(f'\nDATA SUMMARY:')
print(f'  Ministers:      {len(ministers)}')
print(f'  Hub Leaders:    {len(hubs)}')
print(f'  Volunteers:     {len(vols)}')
print(f'  Contacts:       {contacts}')
print(f'  Attendance:     {attendance}')
print(f'  Decisions:      {decisions}')
print('\n' + '='*60)

db.close()
