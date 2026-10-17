// Sign-up is open to anyone, so every user-owned collection has a ceiling. These
// are far above any real use and exist so one account cannot fill the database.
export const MAX_PLANS_PER_PROFILE = 20;
export const MAX_DAYS_PER_PLAN = 14;
export const MAX_EXERCISES_PER_DAY = 30;
export const MAX_CUSTOM_EXERCISES_PER_PROFILE = 100;
// A synced workout is one document; these bound its size.
export const MAX_SESSION_EXERCISES = 30;
export const MAX_SETS_PER_EXERCISE = 40;
