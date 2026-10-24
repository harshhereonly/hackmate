# Matching
Rule-based and deterministic (no AI model). Scores are 0-100 and each component is shown to the user.
Project to candidate: missing skills covered 30, complementary skill domains 20, role fit 15, shared interests 10, experience 10, availability 10, collaboration mode 5.
User to teammate: complementary domains 30, shared interests 25, role fit 15, availability 12, experience 10, mode 8.
User to opportunity: skills 40, interests 30, timing 20, mode 10.
Skill synonyms and domains live in `backend/app/services/taxonomy.py`. Profiles with little data get a "limited information" caution; a profile with no skills, interests or roles gets unscored "recently active" results with an explanation instead of invented scores.
