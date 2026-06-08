import { query, transaction } from '../../database/db.js';
import { addXP, updateStreak } from '../users/user.service.js';
import { cached, invalidate } from '../../utils/cache.js';

/**
 * Create a quiz with questions.
 */
export async function createQuiz(userId, quizData, questions) {
  return transaction(async (client) => {
    // Insert quiz
    const quizResult = await client.query(
      `INSERT INTO quizzes (title, description, created_by, is_public, allow_practice, passing_score, 
        time_limit_per_question, time_limit_total, source_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        quizData.title,
        quizData.description || null,
        userId,
        quizData.isPublic || false,
        quizData.allowPractice !== false,
        quizData.passingScore || 70,
        quizData.timeLimitPerQuestion || 0,
        quizData.timeLimitTotal || 0,
        quizData.sourceType || null,
      ]
    );

    const quiz = quizResult.rows[0];

    // Insert questions
    if (questions?.length > 0) {
      // 7-column INSERT: quiz_id, question_type, question_text, options,
      // correct_answer, explanation, sort_order. Build placeholder rows
      // ($1..$7), ($8..$14), etc. once.
      const placeholderRows = questions.map((_, i) =>
        `($${i * 7 + 1}, $${i * 7 + 2}, $${i * 7 + 3}, $${i * 7 + 4}, $${i * 7 + 5}, $${i * 7 + 6}, $${i * 7 + 7})`
      ).join(', ');

      const params = questions.flatMap((q, i) => [
        quiz.id,
        q.type,
        q.question,
        JSON.stringify(q.options || []),
        q.correctAnswer,
        q.explanation || null,
        i,
      ]);

      await client.query(
        `INSERT INTO questions (quiz_id, question_type, question_text, options, correct_answer, explanation, sort_order)
         VALUES ${placeholderRows}`,
        params
      );
    }

    return quiz;
  });
}

/**
 * Get quiz by ID with questions.
 */
export async function getQuizById(quizId) {
  return cached(`quiz:${quizId}`, async () => {
    const quizResult = await query('SELECT * FROM quizzes WHERE id = $1', [quizId]);
    const quiz = quizResult.rows[0];
    if (!quiz) return null;

    const questionsResult = await query(
      'SELECT * FROM questions WHERE quiz_id = $1 ORDER BY sort_order',
      [quizId]
    );

    return { ...quiz, questions: questionsResult.rows };
  }, 30000);
}

/**
 * Get quiz for taking (hide correct answers).
 *
 * IMPORTANT: getQuizById returns a CACHED object. We must NOT mutate it.
 * If we did `quiz.questions = quiz.questions.map(...)` here, every later
 * call to getQuizById within the cache TTL (including submitAttempt's
 * grading lookup) would see the stripped questions — and would compute
 * an "isCorrect" of false for every answer because correct_answer would
 * be undefined. Build a fresh object instead.
 */
export async function getQuizForTaking(quizId) {
  const cached = await getQuizById(quizId);
  if (!cached) return null;

  return {
    ...cached,
    questions: cached.questions.map(q => ({
      id: q.id,
      question_type: q.question_type,
      question_text: q.question_text,
      options: q.options,
      sort_order: q.sort_order,
      // correct_answer and explanation are intentionally hidden
    })),
  };
}

/**
 * List quizzes with pagination.
 */
export async function listQuizzes({ userId, isPublic, page = 1, limit = 20 }) {
  const conditions = [];
  const params = [];
  let paramIndex = 1;

  if (userId) {
    conditions.push(`q.created_by = $${paramIndex++}`);
    params.push(userId);
  }
  if (isPublic !== undefined) {
    conditions.push(`q.is_public = $${paramIndex++}`);
    params.push(isPublic);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * limit;

  params.push(limit, offset);

  const [dataResult, countResult] = await Promise.all([
    query(
      `SELECT q.*, u.display_name as creator_name,
        (SELECT COUNT(*) FROM questions WHERE quiz_id = q.id) as question_count
       FROM quizzes q
       JOIN users u ON u.id = q.created_by
       ${where}
       ORDER BY q.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    ),
    query(`SELECT COUNT(*) FROM quizzes q ${where}`, params.slice(0, -2)),
  ]);

  return {
    quizzes: dataResult.rows,
    meta: {
      page,
      perPage: limit,
      total: parseInt(countResult.rows[0].count, 10),
    },
  };
}

/**
 * Submit a quiz attempt, calculate score, award XP.
 */
export async function submitAttempt(userId, quizId, answers, timeTaken) {
  // Fetch quiz with correct answers
  const quiz = await getQuizById(quizId);
  if (!quiz) throw new Error('Quiz not found');

  // Score the attempt
  let correctCount = 0;
  const gradedAnswers = quiz.questions.map(q => {
    const userAnswer = answers.find(a => a.questionId === q.id);
    const selected = (userAnswer?.selectedAnswer || '').trim();
    const correct = (q.correct_answer || '').trim();
    const options = Array.isArray(q.options) ? q.options : [];

    // Smart comparison: handle both letter-based ("B") and full-text correctAnswer
    let isCorrect = false;
    if (selected && correct) {
      // Direct text match
      if (selected.toLowerCase() === correct.toLowerCase()) {
        isCorrect = true;
      }
      // If correctAnswer is a letter (A/B/C/D), match against corresponding option
      else if (/^[A-Da-d]$/.test(correct)) {
        const idx = correct.toUpperCase().charCodeAt(0) - 65; // A=0, B=1, C=2, D=3
        if (options[idx] && selected.toLowerCase() === String(options[idx]).toLowerCase().trim()) {
          isCorrect = true;
        }
      }
      // If user selected a letter, check against the option text
      else if (/^[A-Da-d]$/.test(selected)) {
        const idx = selected.toUpperCase().charCodeAt(0) - 65;
        if (options[idx] && correct.toLowerCase() === String(options[idx]).toLowerCase().trim()) {
          isCorrect = true;
        }
      }
    }
    if (isCorrect) correctCount++;

    return {
      questionId: q.id,
      selectedAnswer: userAnswer?.selectedAnswer || null,
      correctAnswer: q.correct_answer,
      explanation: q.explanation || null,
      isCorrect,
    };
  });

  const score = quiz.questions.length > 0
    ? Math.round((correctCount / quiz.questions.length) * 100 * 100) / 100
    : 0;

  // XP formula: base 10 per correct + bonus for speed + bonus for perfect
  let xpEarned = correctCount * 10;
  if (score === 100) xpEarned += 50;                           // Perfect bonus
  if (score >= quiz.passing_score) xpEarned += 25;             // Pass bonus
  if (timeTaken > 0 && timeTaken < quiz.questions.length * 15) xpEarned += 15; // Speed bonus

  const certificateIssued = score >= quiz.passing_score;

  return transaction(async (client) => {
    // Defense against double-submit. The client guards via a useRef, but
    // a determined replay (network retry, manual replay, two-tab race)
    // could still POST twice. Inside the transaction, check for an
    // attempt by the same user on the same quiz in the last 3 seconds —
    // if found, reject with a clear error code so the client can
    // surface a friendly message instead of silently double-counting.
    const recent = await client.query(
      `SELECT id FROM attempts
       WHERE user_id = $1 AND quiz_id = $2
         AND completed_at > NOW() - INTERVAL '3 seconds'
       LIMIT 1`,
      [userId, quizId]
    );
    if (recent.rowCount > 0) {
      const err = new Error('Duplicate submission detected');
      err.code = 'DUPLICATE_ATTEMPT';
      throw err;
    }

    // Insert attempt
    const attemptResult = await client.query(
      `INSERT INTO attempts (quiz_id, user_id, score, answers, time_taken, xp_earned, certificate_issued)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [quizId, userId, score, JSON.stringify(gradedAnswers), timeTaken, xpEarned, certificateIssued]
    );

    // Update quiz attempt count
    await client.query(
      'UPDATE quizzes SET attempt_count = attempt_count + 1 WHERE id = $1',
      [quizId]
    );

    // Update leaderboard (upsert best score)
    const userResult = await client.query('SELECT display_name FROM users WHERE id = $1', [userId]);
    await client.query(
      `INSERT INTO leaderboard_entries (quiz_id, user_id, display_name, best_score, best_time, attempts_count, achieved_at)
       VALUES ($1, $2, $3, $4, $5, 1, NOW())
       ON CONFLICT (quiz_id, user_id) DO UPDATE SET
         best_score = GREATEST(leaderboard_entries.best_score, EXCLUDED.best_score),
         best_time = CASE WHEN EXCLUDED.best_score > leaderboard_entries.best_score
                         THEN EXCLUDED.best_time ELSE leaderboard_entries.best_time END,
         attempts_count = leaderboard_entries.attempts_count + 1,
         achieved_at = CASE WHEN EXCLUDED.best_score > leaderboard_entries.best_score
                           THEN NOW() ELSE leaderboard_entries.achieved_at END`,
      [quizId, userId, userResult.rows[0]?.display_name || 'Unknown', score, timeTaken]
    );

    return attemptResult.rows[0];
  }).then(async (attempt) => {
    // Invalidate the cached quiz so the bumped attempt_count is reflected
    // on the next load, instead of stale-by-30s.
    invalidate(`quiz:${quizId}`);

    // Award XP (outside transaction for simplicity)
    const userStats = await addXP(userId, xpEarned);
    await updateStreak(userId);

    return {
      attempt,
      score,
      xpEarned,
      correctCount,
      totalQuestions: quiz.questions.length,
      certificateIssued,
      newLevel: userStats?.level,
      gradedAnswers,
    };
  });
}

/**
 * Get leaderboard for a quiz.
 *
 * Pulls display_name from the LIVE users table (with fallback to the
 * stored entry if the user has been deleted). This way, when a user
 * renames their account, the leaderboard reflects the new name on
 * the next read instead of showing a stale snapshot from when the
 * row was originally inserted.
 */
export async function getLeaderboard(quizId, limit = 20) {
  const result = await query(
    `SELECT
        le.user_id,
        COALESCE(u.display_name, le.display_name) AS display_name,
        le.best_score,
        le.best_time,
        le.attempts_count,
        le.achieved_at
     FROM leaderboard_entries le
     LEFT JOIN users u ON u.id = le.user_id
     WHERE le.quiz_id = $1
     ORDER BY le.best_score DESC, le.best_time ASC
     LIMIT $2`,
    [quizId, limit]
  );
  return result.rows;
}

/**
 * Get user's attempt history.
 */
export async function getUserAttempts(userId, page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const result = await query(
    `SELECT a.*, q.title as quiz_title
     FROM attempts a
     JOIN quizzes q ON q.id = a.quiz_id
     WHERE a.user_id = $1
     ORDER BY a.completed_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  return result.rows;
}

/**
 * Check answers without saving (practice mode).
 */
export async function checkAnswers(quizId, answers) {
  const quiz = await getQuizById(quizId);
  if (!quiz) throw new Error('Quiz not found');

  return quiz.questions
    .filter(q => answers.some(a => a.questionId === q.id))
    .map(q => {
      const userAnswer = answers.find(a => a.questionId === q.id);
      const selected = (userAnswer?.selectedAnswer || '').trim();
      const correct = (q.correct_answer || '').trim();
      const options = Array.isArray(q.options) ? q.options : [];

      let isCorrect = false;
      if (selected && correct) {
        if (selected.toLowerCase() === correct.toLowerCase()) isCorrect = true;
        else if (/^[A-Da-d]$/.test(correct)) {
          const idx = correct.toUpperCase().charCodeAt(0) - 65;
          if (options[idx] && selected.toLowerCase() === String(options[idx]).toLowerCase().trim()) isCorrect = true;
        } else if (/^[A-Da-d]$/.test(selected)) {
          const idx = selected.toUpperCase().charCodeAt(0) - 65;
          if (options[idx] && correct.toLowerCase() === String(options[idx]).toLowerCase().trim()) isCorrect = true;
        }
      }

      return {
        questionId: q.id,
        isCorrect,
        correctAnswer: q.correct_answer,
        explanation: q.explanation || null,
      };
    });
}

/**
 * Get a single attempt by ID (for results page refresh).
 */
export async function getAttemptById(attemptId, userId) {
  const result = await query(
    `SELECT a.*, q.title as quiz_title, q.passing_score,
            (SELECT COUNT(*) FROM questions WHERE quiz_id = a.quiz_id) as total_questions
     FROM attempts a
     JOIN quizzes q ON q.id = a.quiz_id
     WHERE a.id = $1 AND a.user_id = $2`,
    [attemptId, userId]
  );
  return result.rows[0] || null;
}

/**
 * Delete a quiz (owner only).
 */
export async function deleteQuiz(quizId, userId) {
  const result = await query(
    'DELETE FROM quizzes WHERE id = $1 AND created_by = $2 RETURNING id',
    [quizId, userId]
  );
  if (result.rowCount > 0) invalidate(`quiz:${quizId}`);
  return result.rowCount > 0;
}

/**
 * Update a quiz (owner only).
 */
export async function updateQuiz(quizId, userId, updates) {
  const fields = [];
  const values = [];
  let idx = 1;

  if (updates.title !== undefined) {
    fields.push(`title = $${idx++}`);
    values.push(updates.title);
  }
  if (updates.isPublic !== undefined) {
    fields.push(`is_public = $${idx++}`);
    values.push(updates.isPublic);
  }
  if (updates.allowPractice !== undefined) {
    fields.push(`allow_practice = $${idx++}`);
    values.push(updates.allowPractice);
  }

  if (fields.length === 0) return null;

  values.push(quizId, userId);
  const result = await query(
    `UPDATE quizzes SET ${fields.join(', ')}, updated_at = NOW()
     WHERE id = $${idx++} AND created_by = $${idx}
     RETURNING *`,
    values
  );
  if (result.rows[0]) invalidate(`quiz:${quizId}`);
  return result.rows[0] || null;
}
