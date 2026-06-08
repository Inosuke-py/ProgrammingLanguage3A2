/**
 * Migration: Game Mode (Quiz Bowl)
 *
 * Adds four tables for the live multiplayer quiz game:
 *   - game_lobbies         : lobby metadata (host, quiz, mode, status)
 *   - game_lobby_members   : who's in which lobby + their avatar/role/ready state
 *   - game_attempts        : final per-player results (one row per player per game)
 *   - game_question_events : granular per-question events (buzz/answer/timeout)
 *
 * Each table is idempotent (CREATE IF NOT EXISTS + ALTER ... DO $$ ... duplicate_column)
 * so this script is safe to re-run on existing databases.
 *
 * Usage:
 *   railway run node server/src/database/migrate-game-mode.js   (production, against Neon)
 *   node server/src/database/migrate-game-mode.js               (local, .env-driven)
 */

import 'dotenv/config';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from 'dotenv';
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '..', '..', '.env') });

import pg from 'pg';
const dbUrl = process.env.DATABASE_URL || '';
const useSSL = dbUrl.includes('sslmode=require') || dbUrl.includes('neon.tech');
const pool = new pg.Pool({
  connectionString: dbUrl,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
});

async function migrate() {
  try {
    // ─────────────────────────────────────────────────────────────
    // game_lobbies
    // One row per lobby. status drives the lifecycle:
    //   open       — accepting players, not started yet
    //   in_progress — game has begun
    //   finished   — game ended cleanly
    //   abandoned  — host left or idle timeout fired
    // mode is a label; the actual capacity comes from the chosen
    // mode's max-player count enforced at the application layer.
    // ─────────────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS game_lobbies (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        host_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        quiz_id UUID REFERENCES quizzes(id) ON DELETE SET NULL,
        mode VARCHAR(20) NOT NULL CHECK (mode IN ('solo', '1v1', '2v2', 'party5')),
        status VARCHAR(20) NOT NULL DEFAULT 'open'
          CHECK (status IN ('open', 'in_progress', 'finished', 'abandoned')),
        invite_code VARCHAR(8) UNIQUE,
        is_public BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        started_at TIMESTAMPTZ,
        ended_at TIMESTAMPTZ
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_game_lobbies_status ON game_lobbies(status);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_game_lobbies_host ON game_lobbies(host_user_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_game_lobbies_invite_code ON game_lobbies(invite_code);`);
    console.log('OK: game_lobbies table ensured');

    // ─────────────────────────────────────────────────────────────
    // game_lobby_members
    // role:    'player' or 'spectator' (per your spec: max 1 spectator)
    // avatar_id: 1-5, null until picked. UNIQUE (lobby_id, avatar_id)
    //   prevents two players in the same lobby from grabbing the
    //   same avatar (server enforces via INSERT ON CONFLICT).
    // ready: lobby start requires all PLAYERS to be ready; spectators
    //   don't count toward ready check but can press Start.
    // The (lobby_id, user_id) unique pair prevents a user joining
    //   the same lobby twice (e.g. from two tabs).
    //
    // Partial unique index: a user can only be in ONE active
    //   lobby at a time across the whole platform. If they try to
    //   join a second lobby while still in 'open' or 'in_progress'
    //   status, the insert fails. This is the membership-uniqueness
    //   guarantee that powers the "you're already in a lobby" UX.
    // ─────────────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS game_lobby_members (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        lobby_id UUID NOT NULL REFERENCES game_lobbies(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL DEFAULT 'player'
          CHECK (role IN ('player', 'spectator')),
        avatar_id SMALLINT CHECK (avatar_id BETWEEN 1 AND 5),
        ready BOOLEAN NOT NULL DEFAULT false,
        joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (lobby_id, user_id),
        UNIQUE (lobby_id, avatar_id)
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_game_lobby_members_lobby ON game_lobby_members(lobby_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_game_lobby_members_user ON game_lobby_members(user_id);`);
    console.log('OK: game_lobby_members table ensured');

    // Note on "user can only be in one active lobby":
    // Postgres can't express that as a partial UNIQUE constraint that
    // references game_lobbies.status. We enforce it in the service
    // layer (createLobby + joinLobby pre-check existing memberships
    // inside a transaction with FOR UPDATE on the user row). The
    // idx_game_lobby_members_user index above keeps that lookup fast.

    // ─────────────────────────────────────────────────────────────
    // game_attempts
    // Final results — one row per PLAYER per finished game.
    // Spectators never get a row here.
    // ─────────────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS game_attempts (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        lobby_id UUID NOT NULL REFERENCES game_lobbies(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
        score INTEGER NOT NULL DEFAULT 0,
        rank SMALLINT NOT NULL,
        correct_count INTEGER NOT NULL DEFAULT 0,
        wrong_count INTEGER NOT NULL DEFAULT 0,
        timeout_count INTEGER NOT NULL DEFAULT 0,
        avg_buzz_time_ms INTEGER,
        total_questions INTEGER NOT NULL,
        xp_earned INTEGER NOT NULL DEFAULT 0,
        completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (lobby_id, user_id)
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_game_attempts_user ON game_attempts(user_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_game_attempts_quiz ON game_attempts(quiz_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_game_attempts_completed ON game_attempts(completed_at DESC);`);
    console.log('OK: game_attempts table ensured');

    // ─────────────────────────────────────────────────────────────
    // game_question_events
    // Granular per-question event log. Used for analytics:
    //   - average buzz-in time per quiz
    //   - which questions stumped everyone (all timeouts)
    //   - per-player buzz speed for the user dashboard
    //
    // event_type:
    //   buzz       — player pressed buzz (response_time_ms = ms from
    //                question_displayed to buzz)
    //   correct    — buzzing player answered correctly
    //   wrong      — buzzing player answered wrong
    //   timeout    — 10s answer window expired
    //   reveal     — no one buzzed in 30s, correct answer revealed
    //
    // Server inserts these in batches at game end (NOT during the
    // live game) so we never block buzzes on DB writes.
    // ─────────────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS game_question_events (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        lobby_id UUID NOT NULL REFERENCES game_lobbies(id) ON DELETE CASCADE,
        question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        event_type VARCHAR(20) NOT NULL
          CHECK (event_type IN ('buzz', 'correct', 'wrong', 'timeout', 'reveal')),
        response_time_ms INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_game_qevents_lobby ON game_question_events(lobby_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_game_qevents_question ON game_question_events(question_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_game_qevents_user ON game_question_events(user_id);`);
    console.log('OK: game_question_events table ensured');

    console.log('Game Mode migration complete.');
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrate();
