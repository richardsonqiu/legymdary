import { relations } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type { AdapterAccountType } from "next-auth/adapters";

/* ------------------------------------------------------------------ */
/* Auth.js tables (users, OAuth accounts, sessions)                    */
/* ------------------------------------------------------------------ */

export const users = sqliteTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull(),
  emailVerified: integer("emailVerified", { mode: "timestamp_ms" }),
  image: text("image"),
  // Set only for email/password accounts; null for OAuth (e.g. Google) users.
  passwordHash: text("password_hash"),
});

export const accounts = sqliteTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ],
);

export const sessions = sqliteTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
});

export const verificationTokens = sqliteTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);

/**
 * Exercise library. Rows with a null userId are the shared built-in library;
 * a non-null userId marks a user's own custom exercise.
 */
export const exercises = sqliteTable(
  "exercises",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    muscleGroup: text("muscle_group").notNull(),
    equipment: text("equipment").notNull(),
    isCustom: integer("is_custom", { mode: "boolean" }).notNull().default(false),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("exercises_user_idx").on(t.userId)],
);

/**
 * A workout session. `date` is the calendar day (YYYY-MM-DD) the workout
 * belongs to; `finishedAt` is null while a session is still in progress.
 */
export const workouts = sqliteTable(
  "workouts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    date: text("date").notNull(),
    notes: text("notes"),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("workouts_user_date_idx").on(t.userId, t.date)],
);

/** An exercise placed inside a workout session, with ordering. */
export const workoutExercises = sqliteTable(
  "workout_exercises",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    workoutId: integer("workout_id")
      .notNull()
      .references(() => workouts.id, { onDelete: "cascade" }),
    exerciseId: integer("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("workout_exercises_workout_idx").on(t.workoutId)],
);

/** A single logged set: reps + weight (kg), optionally a warmup. */
export const sets = sqliteTable(
  "sets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    workoutExerciseId: integer("workout_exercise_id")
      .notNull()
      .references(() => workoutExercises.id, { onDelete: "cascade" }),
    reps: integer("reps").notNull(),
    weight: real("weight").notNull(),
    isWarmup: integer("is_warmup", { mode: "boolean" }).notNull().default(false),
    notes: text("notes"),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("sets_workout_exercise_idx").on(t.workoutExerciseId)],
);

/** Body measurements logged per calendar day (one row per day). */
export const bodyStats = sqliteTable(
  "body_stats",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    weight: real("weight"),
    waist: real("waist"),
    bodyFat: real("body_fat"),
    // "manual" (typed in the app) or "garmin" (imported from a Garmin scale).
    source: text("source").notNull().default("manual"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex("body_stats_user_date_unique").on(t.userId, t.date)],
);

/**
 * A logged meal. `date` is the user's local calendar day (YYYY-MM-DD).
 * Calories/macros are usually AI estimates from a photo, editable by the user.
 * `items` is a JSON array of { name, portion, calories, protein, carbs, fat }.
 * `photo` is a small JPEG thumbnail stored as a data URL (a few dozen KB).
 */
export const meals = sqliteTable(
  "meals",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    mealType: text("meal_type").notNull().default("snack"),
    name: text("name").notNull(),
    calories: real("calories").notNull().default(0),
    protein: real("protein").notNull().default(0),
    carbs: real("carbs").notNull().default(0),
    fat: real("fat").notNull().default(0),
    items: text("items"),
    notes: text("notes"),
    photo: text("photo"),
    aiEstimated: integer("ai_estimated", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("meals_user_date_idx").on(t.userId, t.date)],
);

/**
 * One row per user: the profile needed for energy math plus weight / body-fat
 * goals. Everything is optional so the plan can be filled in gradually.
 */
export const goals = sqliteTable("goals", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  sex: text("sex"), // "male" | "female"
  birthYear: integer("birth_year"),
  heightCm: real("height_cm"),
  activityLevel: text("activity_level"), // key of ACTIVITY_LEVELS
  targetWeight: real("target_weight"),
  targetBodyFat: real("target_body_fat"),
  weeklyRate: real("weekly_rate"), // kg per week, absolute pace
  calorieOverride: real("calorie_override"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** One row per AI call (meal photo analysis) — powers the in-app spend view. */
export const aiUsage = sqliteTable(
  "ai_usage",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    feature: text("feature").notNull().default("meal_photo"),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsd: real("cost_usd").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("ai_usage_user_created_idx").on(t.userId, t.createdAt)],
);

/** A saved routine (e.g. "Push Day") to start workouts from. */
export const templates = sqliteTable(
  "templates",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("templates_user_idx").on(t.userId)],
);

/** Ordered exercises in a template, with an optional target set count. */
export const templateExercises = sqliteTable(
  "template_exercises",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    templateId: integer("template_id")
      .notNull()
      .references(() => templates.id, { onDelete: "cascade" }),
    exerciseId: integer("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    targetSets: integer("target_sets"),
  },
  (t) => [index("template_exercises_template_idx").on(t.templateId)],
);

/**
 * A user's Garmin Connect Personal API link. The API key is stored encrypted
 * (AES-256-GCM); the short-lived bearer token is cached encrypted too.
 */
export const garminConnections = sqliteTable("garmin_connections", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  apiKeyEnc: text("api_key_enc").notNull(),
  keyHint: text("key_hint").notNull(),
  tokenEnc: text("token_enc"),
  tokenExpiresAt: integer("token_expires_at", { mode: "timestamp_ms" }),
  status: text("status").notNull().default("ok"), // "ok" | "error"
  lastError: text("last_error"),
  lastSyncAt: integer("last_sync_at", { mode: "timestamp_ms" }),
  /** Add part of the day's extra activity burn to the calorie target. */
  adjustForActivity: integer("adjust_for_activity", { mode: "boolean" })
    .notNull()
    .default(false),
  connectedAt: integer("connected_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** One row per user per local calendar day, merged from several Garmin feeds. */
export const garminDaily = sqliteTable(
  "garmin_daily",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    totalKcal: real("total_kcal"),
    activeKcal: real("active_kcal"),
    bmrKcal: real("bmr_kcal"),
    consumedKcal: real("consumed_kcal"),
    steps: integer("steps"),
    intensityMinutes: integer("intensity_minutes"),
    restingHr: integer("resting_hr"),
    stressAvg: integer("stress_avg"),
    bodyBatteryHigh: integer("body_battery_high"),
    bodyBatteryLow: integer("body_battery_low"),
    bodyBatteryCharged: integer("body_battery_charged"),
    bodyBatteryDrained: integer("body_battery_drained"),
    sleepSeconds: integer("sleep_seconds"),
    sleepScore: integer("sleep_score"),
    hrvLastNight: integer("hrv_last_night"),
    hrvWeeklyAvg: integer("hrv_weekly_avg"),
    hrvStatus: text("hrv_status"),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex("garmin_daily_user_date_unique").on(t.userId, t.date)],
);

/** Garmin activities (runs, rides, strength…) as summaries. */
export const garminActivities = sqliteTable(
  "garmin_activities",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    activityId: text("activity_id").notNull(),
    date: text("date").notNull(),
    startTimeLocal: text("start_time_local"),
    name: text("name").notNull(),
    type: text("type"),
    durationSec: real("duration_sec"),
    calories: real("calories"),
    avgHr: real("avg_hr"),
    distanceM: real("distance_m"),
    trainingLoad: real("training_load"),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("garmin_activities_user_activity_unique").on(t.userId, t.activityId),
    index("garmin_activities_user_date_idx").on(t.userId, t.date),
  ],
);

/**
 * Fixed-window rate-limit counters (login, sign-up, AI and Garmin calls).
 * Kept in the database so limits hold across serverless instances.
 */
export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: integer("window_start").notNull(),
  count: integer("count").notNull().default(0),
});

export const workoutsRelations = relations(workouts, ({ many }) => ({
  workoutExercises: many(workoutExercises),
}));

export const workoutExercisesRelations = relations(
  workoutExercises,
  ({ one, many }) => ({
    workout: one(workouts, {
      fields: [workoutExercises.workoutId],
      references: [workouts.id],
    }),
    exercise: one(exercises, {
      fields: [workoutExercises.exerciseId],
      references: [exercises.id],
    }),
    sets: many(sets),
  }),
);

export const setsRelations = relations(sets, ({ one }) => ({
  workoutExercise: one(workoutExercises, {
    fields: [sets.workoutExerciseId],
    references: [workoutExercises.id],
  }),
}));

export const exercisesRelations = relations(exercises, ({ many }) => ({
  workoutExercises: many(workoutExercises),
}));

export type User = typeof users.$inferSelect;
export type Exercise = typeof exercises.$inferSelect;
export type NewExercise = typeof exercises.$inferInsert;
export type Workout = typeof workouts.$inferSelect;
export type WorkoutExercise = typeof workoutExercises.$inferSelect;
export type SetRow = typeof sets.$inferSelect;
export type BodyStat = typeof bodyStats.$inferSelect;
export type Meal = typeof meals.$inferSelect;
export type Goals = typeof goals.$inferSelect;
export type Template = typeof templates.$inferSelect;
export type GarminDaily = typeof garminDaily.$inferSelect;
export type GarminActivity = typeof garminActivities.$inferSelect;
export type GarminConnection = typeof garminConnections.$inferSelect;
