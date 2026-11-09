-- Initial schema. Better Auth tables (email + password). Generated from the library's own schema
-- (better-auth 1.7.18, rateLimit.storage = 'database'). Re-generate if the library or its options change.

create table "user" (
  "id" text not null primary key,
  "name" text not null,
  "email" text not null unique,
  "emailVerified" integer not null,
  "image" text,
  "createdAt" date not null,
  "updatedAt" date not null
);

create table "session" (
  "id" text not null primary key,
  "expiresAt" date not null,
  "token" text not null unique,
  "createdAt" date not null,
  "updatedAt" date not null,
  "ipAddress" text,
  "userAgent" text,
  "userId" text not null references "user" ("id") on delete cascade
);

create table "account" (
  "id" text not null primary key,
  "accountId" text not null,
  "providerId" text not null,
  "userId" text not null references "user" ("id") on delete cascade,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" date,
  "refreshTokenExpiresAt" date,
  "scope" text,
  "password" text,
  "createdAt" date not null,
  "updatedAt" date not null
);

create table "verification" (
  "id" text not null primary key,
  "identifier" text not null,
  "value" text not null,
  "expiresAt" date not null,
  "createdAt" date not null,
  "updatedAt" date not null
);

create table "rateLimit" (
  "id" text not null primary key,
  "key" text not null unique,
  "count" integer not null,
  "lastRequest" bigint not null
);

create index "session_userId_idx" on "session" ("userId");
create index "account_userId_idx" on "account" ("userId");
create index "verification_identifier_idx" on "verification" ("identifier");

-- One row per user holding all their data as JSON: { workspaces, tasks } (same shape the app
-- keeps in localStorage). Every query must filter by user_id; see src/lib/server/db.ts.
-- `version` is for optimistic concurrency: every save says which version it was based on, and
-- the server refuses it if another tab or device saved in the meantime.
create table "user_data" (
  "user_id" text not null primary key references "user" ("id") on delete cascade,
  "data" text not null,
  "updated_at" integer not null,
  "version" integer not null default 1
);
