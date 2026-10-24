"""Skill normalization and the skill -> domain taxonomy used for search and matching.

`skill_key` canonicalizes common spellings ("ReactJS", "react.js" -> "react") so
filters and matching compare like with like. Domains let the matcher reason
about complementary expertise (a team with three frontend developers still
"lacks" backend and design) instead of only counting identical skills.
"""

from __future__ import annotations

from typing import Iterable

from app.utils import clean_text

SKILL_SYNONYMS: dict[str, str] = {
    "js": "javascript", "es6": "javascript", "ts": "typescript",
    "reactjs": "react", "react.js": "react", "react js": "react",
    "react-native": "react native", "rn": "react native",
    "node": "node.js", "nodejs": "node.js", "node js": "node.js",
    "vuejs": "vue", "vue.js": "vue", "nextjs": "next.js", "next": "next.js",
    "angularjs": "angular", "sveltekit": "svelte",
    "expressjs": "express", "express.js": "express",
    "py": "python", "python3": "python", "golang": "go",
    "c sharp": "c#", "csharp": "c#", "cpp": "c++", "dotnet": ".net", ".net core": ".net",
    "postgres": "postgresql", "mongo": "mongodb", "k8s": "kubernetes",
    "gcp": "google cloud", "amazon web services": "aws",
    "tailwind": "tailwind css", "tailwindcss": "tailwind css",
    "ml": "machine learning", "ai": "artificial intelligence", "dl": "deep learning",
    "nlp": "natural language processing", "cv": "computer vision",
    "llms": "llm", "large language models": "llm", "genai": "generative ai",
    "tf": "tensorflow", "sklearn": "scikit-learn", "scikit learn": "scikit-learn",
    "ui": "ui design", "ux": "ux design", "ui/ux": "ui/ux design", "ux/ui": "ui/ux design",
    "pm": "product management", "web 3": "web3", "smart contract": "smart contracts",
    "ci-cd": "ci/cd", "cicd": "ci/cd",
}

# General-purpose languages are mapped to at most their most specific domain
# (Python to none), so a lone "TypeScript" or "Python" never counts as covering
# backend, ML or data work on its own.
_DOMAIN_SKILLS: dict[str, set[str]] = {
    "frontend": {
        "react", "vue", "angular", "svelte", "next.js", "html", "css", "javascript", "typescript",
        "tailwind css", "redux", "web design", "webgl", "three.js", "accessibility",
    },
    "backend": {
        "node.js", "express", "django", "flask", "fastapi", "spring", "java", "go", "rust", "ruby",
        "ruby on rails", "php", "laravel", "graphql", "rest api", "postgresql", "mysql", "mongodb",
        "redis", "c#", ".net", "microservices", "firebase", "supabase",
    },
    "mobile": {"react native", "flutter", "dart", "swift", "kotlin", "android", "ios", "swiftui"},
    "ml": {
        "machine learning", "deep learning", "tensorflow", "pytorch", "scikit-learn", "keras",
        "natural language processing", "computer vision", "artificial intelligence", "llm",
        "hugging face", "generative ai", "reinforcement learning", "opencv", "langchain",
    },
    "data": {
        "data science", "data analysis", "pandas", "numpy", "sql", "statistics", "r", "tableau",
        "power bi", "data visualization", "data engineering", "spark", "excel", "jupyter",
    },
    "design": {
        "ui design", "ux design", "ui/ux design", "figma", "user research", "prototyping",
        "graphic design", "adobe xd", "illustration", "product design", "design systems", "sketch",
    },
    "devops": {
        "docker", "kubernetes", "aws", "google cloud", "azure", "ci/cd", "terraform", "linux",
        "devops", "cloud computing", "nginx", "github actions", "serverless",
    },
    "security": {
        "cybersecurity", "penetration testing", "cryptography", "network security", "security",
        "ethical hacking", "reverse engineering",
    },
    "blockchain": {"solidity", "web3", "ethereum", "smart contracts", "blockchain", "hardhat"},
    "hardware": {
        "arduino", "raspberry pi", "iot", "embedded systems", "c", "c++", "robotics", "pcb design",
        "electronics", "fpga", "verilog", "ros",
    },
    "research": {
        "research", "academic writing", "latex", "literature review", "matlab", "statistics",
        "experimental design", "scientific computing",
    },
    "product": {
        "product management", "project management", "agile", "scrum", "marketing", "business",
        "pitching", "public speaking", "communication", "entrepreneurship", "technical writing",
    },
}

SKILL_DOMAINS: dict[str, set[str]] = {}
for _domain, _skills in _DOMAIN_SKILLS.items():
    for _skill in _skills:
        SKILL_DOMAINS.setdefault(_skill, set()).add(_domain)

# Which skill domains each preferred role covers.
ROLE_DOMAINS: dict[str, set[str]] = {
    "frontend": {"frontend"},
    "backend": {"backend"},
    "fullstack": {"frontend", "backend"},
    "mobile": {"mobile"},
    "ml": {"ml"},
    "data": {"data"},
    "design": {"design"},
    "devops": {"devops"},
    "security": {"security"},
    "blockchain": {"blockchain"},
    "hardware": {"hardware"},
    "research": {"research"},
    "product": {"product"},
}

ROLE_LABELS: dict[str, str] = {
    "frontend": "Frontend developer",
    "backend": "Backend developer",
    "fullstack": "Full-stack developer",
    "mobile": "Mobile developer",
    "ml": "ML/AI engineer",
    "data": "Data scientist",
    "design": "UI/UX designer",
    "devops": "DevOps/cloud engineer",
    "security": "Security engineer",
    "blockchain": "Blockchain developer",
    "hardware": "Hardware/IoT engineer",
    "research": "Researcher",
    "product": "Product/project lead",
}

DOMAIN_LABELS: dict[str, str] = {
    "frontend": "frontend", "backend": "backend", "mobile": "mobile", "ml": "machine learning",
    "data": "data", "design": "design", "devops": "DevOps/cloud", "security": "security",
    "blockchain": "blockchain", "hardware": "hardware/IoT", "research": "research", "product": "product",
}


def skill_key(value: str) -> str:
    key = clean_text(value, collapse=True).lower()
    return SKILL_SYNONYMS.get(key, key)


def skill_keys(values: Iterable[str] | None) -> list[str]:
    seen: set[str] = set()
    keys: list[str] = []
    for value in values or []:
        key = skill_key(value)
        if key and key not in seen:
            seen.add(key)
            keys.append(key)
    return keys


def tag_keys(values: Iterable[str] | None) -> list[str]:
    """Lowercased keys for free-form tags such as interests (no synonym mapping)."""
    seen: set[str] = set()
    keys: list[str] = []
    for value in values or []:
        key = clean_text(value, collapse=True).lower()
        if key and key not in seen:
            seen.add(key)
            keys.append(key)
    return keys


def domains_for_skills(keys: Iterable[str]) -> set[str]:
    domains: set[str] = set()
    for key in keys:
        domains |= SKILL_DOMAINS.get(key, set())
    return domains


def domains_for_roles(roles: Iterable[str]) -> set[str]:
    domains: set[str] = set()
    for role in roles:
        domains |= ROLE_DOMAINS.get(role, set())
    return domains
