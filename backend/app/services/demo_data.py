"""Clearly labelled demo data for local demonstrations.

Everything created here is fictional and marked: titles start with "Sample:",
documents carry is_demo=true (the UI shows a "Demo" badge), the organizer is
"HackMate demo data", email addresses use the reserved example.com domain, and
demo listings have no registration links. Never present these as real events.
"""

from __future__ import annotations

import secrets
from datetime import timedelta
from typing import Any

from pymongo.database import Database

from app.core.security import hash_password
from app.services.opportunities.catalog import new_document
from app.services.profiles import generate_handle, new_profile_document
from app.services.taxonomy import skill_keys, tag_keys
from app.utils import utcnow

DEMO_ORGANIZER = "HackMate demo data"

PEOPLE: list[dict[str, Any]] = [
    {"name": "Maya Chen", "headline": "Frontend developer who sweats the details", "skills": ["React", "TypeScript", "Figma", "Tailwind CSS"],
     "interests": ["Climate", "EdTech"], "preferred_roles": ["frontend", "design"], "experience_level": "intermediate",
     "availability": "part_time", "collaboration_mode": "remote", "visibility": "public"},
    {"name": "Arjun Rao", "headline": "Backend and infrastructure, mostly Python", "skills": ["Python", "FastAPI", "PostgreSQL", "Docker"],
     "interests": ["HealthTech", "Open Source"], "preferred_roles": ["backend", "devops"], "experience_level": "advanced",
     "availability": "weekends", "collaboration_mode": "hybrid", "visibility": "members"},
    {"name": "Sofia Martinez", "headline": "ML researcher focused on speech and NLP", "skills": ["Python", "PyTorch", "NLP", "Pandas"],
     "interests": ["Health", "NLP"], "preferred_roles": ["ml", "research"], "experience_level": "advanced",
     "availability": "part_time", "collaboration_mode": "remote", "visibility": "public"},
    {"name": "Kwame Mensah", "headline": "Mobile developer building for low-bandwidth users", "skills": ["Flutter", "Dart", "Firebase"],
     "interests": ["FinTech", "Social Impact"], "preferred_roles": ["mobile"], "experience_level": "intermediate",
     "availability": "weekends", "collaboration_mode": "in_person", "visibility": "members"},
    {"name": "Lena Fischer", "headline": "Product designer and accessibility advocate", "skills": ["Figma", "User research", "Prototyping"],
     "interests": ["Accessibility", "EdTech"], "preferred_roles": ["design", "product"], "experience_level": "intermediate",
     "availability": "limited", "collaboration_mode": "remote", "visibility": "members"},
    {"name": "Omar Haddad", "headline": "Cloud and security engineer", "skills": ["Kubernetes", "AWS", "Cybersecurity", "Go"],
     "interests": ["Open Source", "Privacy"], "preferred_roles": ["devops", "security"], "experience_level": "expert",
     "availability": "part_time", "collaboration_mode": "remote", "visibility": "members"},
    {"name": "Priya Nair", "headline": "Data analyst learning data engineering", "skills": ["SQL", "Tableau", "Statistics", "R"],
     "interests": ["Climate", "Public Health"], "preferred_roles": ["data", "research"], "experience_level": "beginner",
     "availability": "full_time", "collaboration_mode": "hybrid", "visibility": "members"},
    {"name": "Diego Alvarez", "headline": "Hardware tinkerer: sensors, robots, IoT", "skills": ["Arduino", "C++", "IoT", "Raspberry Pi"],
     "interests": ["Robotics", "Sustainability"], "preferred_roles": ["hardware"], "experience_level": "intermediate",
     "availability": "weekends", "collaboration_mode": "in_person", "visibility": "members"},
    {"name": "Hana Kim", "headline": "Full-stack developer exploring smart contracts", "skills": ["Solidity", "React", "Node.js"],
     "interests": ["FinTech", "Web3"], "preferred_roles": ["blockchain", "fullstack"], "experience_level": "intermediate",
     "availability": "part_time", "collaboration_mode": "remote", "visibility": "members"},
    {"name": "Sam Taylor", "headline": "", "skills": ["HTML", "CSS"], "interests": [], "preferred_roles": [],
     "experience_level": None, "availability": None, "collaboration_mode": None, "visibility": "members"},
]

PROJECTS: list[dict[str, Any]] = [
    {"owner": "Maya Chen", "members": ["Priya Nair"], "title": "Sample: Campus Carbon Tracker",
     "summary": "Estimate and visualise the carbon footprint of student events.",
     "description": "A demo project. We are building a small web app that helps student clubs estimate the emissions "
                    "of their events and suggests lower-impact alternatives. The frontend prototype exists; we need an "
                    "API and someone who enjoys data visualisation.",
     "required_skills": ["React", "FastAPI", "Data visualization", "Figma"], "roles_needed": ["backend", "data"],
     "preferred_experience": "any", "max_team_size": 4, "status": "recruiting", "category": "hackathon",
     "collaboration_mode": "remote"},
    {"owner": "Arjun Rao", "members": [], "title": "Sample: Clinic Queue SMS Bot",
     "summary": "Let patients join a clinic queue by SMS and get notified when it's their turn.",
     "description": "A demo project for a social-impact hackathon. The bot needs simple language understanding for "
                    "replies in several languages, plus an admin view for clinic staff.",
     "required_skills": ["Python", "FastAPI", "NLP"], "roles_needed": ["ml", "frontend"],
     "preferred_experience": "intermediate", "max_team_size": 3, "status": "recruiting", "category": "social_impact",
     "collaboration_mode": "hybrid"},
    {"owner": "Lena Fischer", "members": ["Omar Haddad"], "title": "Sample: Open-Source Accessibility Linter",
     "summary": "A CLI and editor plugin that flags common accessibility mistakes in web projects.",
     "description": "A demo open-source project. Rules are written in TypeScript; we want contributors for the rule "
                    "engine, documentation and UX research with screen-reader users.",
     "required_skills": ["TypeScript", "Node.js", "Accessibility", "UX design"], "roles_needed": ["frontend", "backend"],
     "preferred_experience": "any", "max_team_size": 5, "status": "recruiting", "category": "open_source",
     "collaboration_mode": "remote"},
    {"owner": "Sofia Martinez", "members": ["Arjun Rao"], "title": "Sample: Low-Resource Speech Dataset",
     "summary": "Collect and benchmark a small speech dataset for an under-served language.",
     "description": "A demo research project. We are designing the annotation protocol and baseline models.",
     "required_skills": ["Python", "PyTorch", "NLP", "Statistics"], "roles_needed": ["research", "data"],
     "preferred_experience": "intermediate", "max_team_size": 4, "status": "active", "category": "research",
     "collaboration_mode": "remote"},
    {"owner": "Diego Alvarez", "members": [], "title": "Sample: Smart Plant Watering Kit",
     "summary": "A low-cost soil-moisture kit with a companion mobile app.",
     "description": "A demo side project. Hardware prototype works; the companion app and cloud sync are missing.",
     "required_skills": ["Arduino", "C++", "Flutter", "Firebase"], "roles_needed": ["mobile"],
     "preferred_experience": "any", "max_team_size": 3, "status": "recruiting", "category": "side_project",
     "collaboration_mode": "in_person"},
    {"owner": "Hana Kim", "members": ["Kwame Mensah"], "title": "Sample: Micro-savings Wallet Prototype",
     "summary": "A prototype wallet for group savings circles.",
     "description": "A demo startup-style project that has been completed as a hackathon prototype.",
     "required_skills": ["Solidity", "React", "Security"], "roles_needed": ["security", "design"],
     "preferred_experience": "intermediate", "max_team_size": 4, "status": "completed", "category": "startup",
     "collaboration_mode": "remote"},
]


def _opportunities(now) -> list[dict[str, Any]]:
    day = timedelta(days=1)
    return [
        {"type": "hackathon", "title": "Sample: Climate Data Weekend",
         "summary": "Demo listing: a 48-hour online hackathon around open climate datasets.",
         "skills": ["Python", "Data visualization", "React"], "tags": ["Climate", "Open data"], "mode": "online",
         "starts_at": now + 21 * day, "ends_at": now + 23 * day, "deadline": now + 14 * day},
        {"type": "hackathon", "title": "Sample: HealthTech Build Sprint",
         "summary": "Demo listing: a hybrid build sprint for tools that support community clinics.",
         "skills": ["React", "FastAPI", "NLP"], "tags": ["Health", "Social Impact"], "mode": "hybrid",
         "location": "Sample City", "starts_at": now - day, "ends_at": now + day},
        {"type": "hackathon", "title": "Sample: Campus Hardware Jam",
         "summary": "Demo listing: an in-person weekend of sensors, robots and IoT.",
         "skills": ["Arduino", "IoT", "C++"], "tags": ["Robotics", "Sustainability"], "mode": "in_person",
         "location": "Sample Institute of Technology", "starts_at": now + 45 * day, "ends_at": now + 46 * day},
        {"type": "hackathon", "title": "Sample: Accessibility Hack Night",
         "summary": "Demo listing: a past event, kept to demonstrate the 'past' filter.",
         "skills": ["Accessibility", "Figma"], "tags": ["Accessibility"], "mode": "online",
         "starts_at": now - 40 * day, "ends_at": now - 40 * day + timedelta(hours=6)},
        {"type": "project", "title": "Sample: Mentored Open-Source Sprint",
         "summary": "Demo listing: a month-long mentored sprint for first-time open-source contributors.",
         "skills": ["Git", "Python", "Documentation"], "tags": ["Open Source"], "mode": "online",
         "deadline": now + 30 * day},
        {"type": "project", "title": "Sample: Student Developer Fellowship",
         "summary": "Demo listing: a part-time fellowship pairing students with maintainers.",
         "skills": ["JavaScript", "TypeScript"], "tags": ["Open Source", "EdTech"], "mode": "online",
         "deadline": now + 60 * day},
        {"type": "research", "title": "Sample: Reading Group on Graph Neural Networks",
         "summary": "Demo listing: a fortnightly online reading group for students new to GNN research.",
         "skills": ["Python", "PyTorch"], "tags": ["Machine Learning", "Research"], "mode": "online"},
    ]


def has_demo_data(db: Database) -> bool:
    return db.profiles.find_one({"is_demo": True}, {"_id": 1}) is not None


def clear_demo_data(db: Database) -> None:
    demo_users = db.profiles.distinct("user_id", {"is_demo": True})
    demo_projects = db.projects.distinct("_id", {"is_demo": True})
    db.team_memberships.delete_many({"$or": [{"project_id": {"$in": demo_projects}}, {"user_id": {"$in": demo_users}}]})
    db.join_requests.delete_many({"$or": [{"project_id": {"$in": demo_projects}}, {"user_id": {"$in": demo_users}}]})
    db.projects.delete_many({"is_demo": True})
    db.opportunities.delete_many({"is_demo": True})
    db.sessions.delete_many({"user_id": {"$in": demo_users}})
    db.profiles.delete_many({"is_demo": True})
    db.users.delete_many({"_id": {"$in": demo_users}})


def seed_demo_data(db: Database, password: str | None = None) -> dict[str, int]:
    """Create the demo dataset. Without `password`, demo accounts get an unusable random one."""
    now = utcnow()
    people: dict[str, Any] = {}
    for person in PEOPLE:
        email = person["name"].lower().replace(" ", ".") + ".demo@example.com"
        user_id = db.users.insert_one({
            "email": email,
            "password_hash": hash_password(password or secrets.token_urlsafe(32)),
            "role": "user", "status": "active", "email_verified": True,
            "created_at": now, "updated_at": now, "last_login_at": None,
        }).inserted_id
        profile = new_profile_document(user_id, person["name"], generate_handle(db, person["name"]))
        profile.update({key: value for key, value in person.items() if key != "name"})
        profile.update({
            "institution": "Sample Institute of Technology" if len(people) % 2 else "Demo University",
            "bio": "This is a demo profile created by the HackMate seed script. It is not a real person.",
            "skills_key": skill_keys(person["skills"]),
            "interests_key": tag_keys(person["interests"]),
            "is_demo": True,
        })
        db.profiles.insert_one(profile)
        people[person["name"]] = user_id

    for spec in PROJECTS:
        owner = people[spec["owner"]]
        fields = {k: v for k, v in spec.items() if k not in ("owner", "members")}
        project_id = db.projects.insert_one({
            **fields, "skills_key": skill_keys(fields["required_skills"]), "owner_id": owner,
            "member_count": 1 + len(spec["members"]), "repo_url": None, "opportunity_id": None,
            "is_removed": False, "removed_reason": None, "is_demo": True, "created_at": now, "updated_at": now,
        }).inserted_id
        db.team_memberships.insert_one({"project_id": project_id, "user_id": owner, "role": "owner",
                                        "functional_role": None, "joined_at": now})
        for name in spec["members"]:
            db.team_memberships.insert_one({"project_id": project_id, "user_id": people[name], "role": "member",
                                            "functional_role": None, "joined_at": now})

    count = 0
    for data in _opportunities(now):
        base = {"description": "", "organizer": DEMO_ORGANIZER, "url": None, "location": "", "starts_at": None,
                "ends_at": None, "deadline": None, "accepts_applications": False}
        db.opportunities.insert_one(new_document({**base, **data}, source_kind="demo", created_by=None, is_demo=True))
        count += 1

    # One member-posted research collaboration that accepts applications.
    research = new_document({
        "type": "research", "title": "Sample: Seeking Annotators for a Speech Data Study",
        "summary": "Demo post: looking for two collaborators to help design an annotation guide and run a pilot.",
        "description": "This is demo content created by the seed script.", "organizer": "Sofia Martinez (demo)",
        "url": None, "skills": ["Linguistics", "Python", "Statistics"], "tags": ["NLP", "Research"],
        "mode": "online", "location": "", "starts_at": None, "ends_at": None, "deadline": now + timedelta(days=20),
        "accepts_applications": True,
    }, source_kind="community", created_by=people["Sofia Martinez"], is_demo=True)
    db.opportunities.insert_one(research)
    count += 1
    return {"users": len(people), "projects": len(PROJECTS), "opportunities": count}
