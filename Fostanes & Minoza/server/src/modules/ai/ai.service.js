import { GoogleGenerativeAI } from '@google/generative-ai';
import { Mistral } from '@mistralai/mistralai';
import { env } from '../../config/env.js';

/**
 * Multi-provider AI service.
 * Supports: mistral (default), gemini, and user-provided API keys.
 */

// =============================================
// PROVIDER: MISTRAL (Default)
// =============================================
async function generateWithMistral(prompt, apiKey, model) {
  const client = new Mistral({ apiKey: apiKey || env.mistralApiKey });
  const modelId = model || env.mistralModel;

  const response = await client.chat.complete({
    model: modelId,
    messages: [{ role: 'user', content: prompt }],
    responseFormat: { type: 'json_object' },
    temperature: 0.7,
    maxTokens: 8192,
  });

  const text = response.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty response from Mistral');
  return JSON.parse(text);
}

// =============================================
// PROVIDER: GEMINI
// =============================================
async function generateWithGemini(prompt, apiKey, model) {
  const genAI = new GoogleGenerativeAI(apiKey || env.geminiApiKey);
  const genModel = genAI.getGenerativeModel({
    model: model || env.geminiModel,
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.7,
      maxOutputTokens: 8192,
    },
  });

  const result = await genModel.generateContent(prompt);
  const text = result.response.text();
  return JSON.parse(text);
}

// =============================================
// PROVIDER: OPENAI-COMPATIBLE (OpenRouter, Groq, Together, OpenAI, DeepSeek,
//                              Cerebras, self-hosted vLLM, etc.)
// =============================================
//
// All of these speak the OpenAI Chat Completions protocol over HTTP. The
// only thing that differs is the baseUrl. We use fetch directly — no SDK
// — so the caller can point at any compliant endpoint.
//
// JSON-mode support: we send `response_format: { type: 'json_object' }`,
// which is honored by OpenAI itself, OpenRouter, Groq, Together, DeepSeek,
// and most others. Providers that don't support it will simply return
// regular text — and our prompt explicitly asks for JSON, so we'll still
// get parseable output the vast majority of the time. As a final guard we
// strip ```json fences and try JSON.parse.
async function generateWithOpenAICompatible(prompt, apiKey, model, baseUrl) {
  if (!apiKey) {
    throw new Error('OpenAI-compatible providers require an API key. Save one in your AI settings.');
  }
  if (!baseUrl) {
    throw new Error('OpenAI-compatible providers require a base URL.');
  }
  if (!model) {
    throw new Error('OpenAI-compatible providers require a model id (e.g. "openai/gpt-4o-mini" for OpenRouter).');
  }

  // Trim trailing slash and any /chat/completions the user may have pasted.
  const root = baseUrl.replace(/\/+$/, '').replace(/\/chat\/completions$/i, '');
  const url = `${root}/chat/completions`;

  // OpenRouter requires HTTP-Referer + X-Title for analytics; harmless on
  // others, so we always send them.
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
    'HTTP-Referer': 'https://lexara.up.railway.app',
    'X-Title': 'Lexara',
  };

  const body = {
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 8192,
    response_format: { type: 'json_object' },
  };

  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      // 60s — quiz generation can be slow on smaller hosted models.
      signal: AbortSignal.timeout?.(60_000),
    });
  } catch (err) {
    throw new Error(`Network error calling ${url}: ${err.message}`);
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`HTTP ${resp.status} from ${url}: ${text.slice(0, 240)}`);
  }

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Provider returned no message content');
  }

  // Some providers wrap JSON in ```json fences even with response_format
  // set — strip them defensively before parsing.
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '');

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Provider returned non-JSON output (first 200 chars): ${cleaned.slice(0, 200)}`);
  }
}

// =============================================
// PROVIDER ROUTER
// =============================================
const providers = {
  mistral: generateWithMistral,
  gemini: generateWithGemini,
  'openai-compatible': generateWithOpenAICompatible,
};

async function callProvider(prompt, providerConfig = {}) {
  const provider = providerConfig.provider || env.defaultAiProvider;
  const apiKey = providerConfig.apiKey || null;
  const model = providerConfig.model || null;
  const baseUrl = providerConfig.baseUrl || null;

  const fn = providers[provider];
  if (!fn) throw new Error(`Unsupported AI provider: ${provider}`);

  console.log(`[AI] Using provider: ${provider} | model: ${model || 'default'}`);
  // Only the openai-compatible provider takes a baseUrl; others ignore it.
  if (provider === 'openai-compatible') {
    return fn(prompt, apiKey, model, baseUrl);
  }
  return fn(prompt, apiKey, model);
}

// =============================================
// QUIZ GENERATION
// =============================================

/**
 * Generate quiz questions from content.
 * @param {string} content - Source text
 * @param {object} config - Quiz config
 * @param {object} providerConfig - { provider, apiKey, model }
 */
export async function generateQuizFromContent(content, config = {}, providerConfig = {}) {
  const {
    questionCount = 10,
    difficulty = 'medium',
    questionTypes = ['mcq', 'truefalse'],
    language = 'English',
  } = config;

  const prompt = buildPrompt(content, { questionCount, difficulty, questionTypes, language });

  try {
    const parsed = await callProvider(prompt, providerConfig);
    const questions = validateAndNormalize(parsed, questionTypes);
    const title = parsed.title || 'Generated Quiz';
    return { title, questions };
  } catch (err) {
    console.error('[AI] Quiz generation failed:', err.message);
    throw new Error(`Quiz generation failed (${providerConfig.provider || env.defaultAiProvider}): ${err.message}`);
  }
}

/**
 * Generate quiz from a topic string.
 */
export async function generateQuizFromTopic(topic, config = {}, providerConfig = {}) {
  const content = `Topic: ${topic}\n\nGenerate comprehensive quiz questions about this topic based on general knowledge.`;
  return generateQuizFromContent(content, config, providerConfig);
}

/**
 * Build the AI prompt for quiz generation.
 */
function buildPrompt(content, { questionCount, difficulty, questionTypes, language }) {
  const typeInstructions = questionTypes.map(t => {
    switch (t) {
      case 'mcq': return 'Multiple choice questions with exactly 4 options (A, B, C, D)';
      case 'truefalse': return 'True/False questions';
      case 'fillinblank': return 'Fill in the blank questions (answer is a single word or short phrase)';
      default: return '';
    }
  }).filter(Boolean).join('\n- ');

  return `You are an expert quiz generator for an educational platform called Lexara.

Generate exactly ${questionCount} quiz questions based on the following content.

RULES:
- Difficulty level: ${difficulty}
- Language: ${language}
- Question types to include: 
  - ${typeInstructions}
- Mix question types roughly evenly across the specified types
- Each question must have a clear, unambiguous correct answer
- Explanations should teach WHY the answer is correct (2-3 sentences)
- For MCQ: all 4 options must be plausible, not obviously wrong
- For True/False: mix true and false answers roughly 50/50
- For Fill in the Blank: the answer should be specific, not vague

CONTENT TO QUIZ ON:
---
${content.substring(0, 30000)}
---

Respond with a JSON object in this exact format:
{
  "title": "Auto-generated title summarizing the quiz topic",
  "questions": [
    {
      "type": "mcq",
      "question": "What is...?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": "Option A",
      "explanation": "The correct answer is Option A because..."
    },
    {
      "type": "truefalse",
      "question": "Statement to evaluate as true or false.",
      "options": ["True", "False"],
      "correctAnswer": "True",
      "explanation": "This is true because..."
    },
    {
      "type": "fillinblank",
      "question": "The process of _____ converts light energy into chemical energy.",
      "options": [],
      "correctAnswer": "photosynthesis",
      "explanation": "Photosynthesis is the process..."
    }
  ]
}`;
}

/**
 * Validate and normalize AI output.
 */
function validateAndNormalize(parsed, allowedTypes = ['mcq', 'truefalse', 'fillinblank']) {
  const data = parsed.questions || parsed;
  if (!Array.isArray(data)) {
    throw new Error('AI response is not a valid question array');
  }

  return data.map((q, i) => ({
    type: allowedTypes.includes(q.type) ? q.type : 'mcq',
    question: String(q.question || '').trim(),
    options: Array.isArray(q.options) ? q.options.map(String) : [],
    correctAnswer: String(q.correctAnswer || '').trim(),
    explanation: String(q.explanation || '').trim(),
    sortOrder: i,
  })).filter(q => q.question.length > 0 && q.correctAnswer.length > 0);
}

// =============================================
// SMART CONTENT ANALYSIS
// =============================================

/**
 * Analyze content to determine if it's already a quiz or learning material.
 * Returns { type: 'quiz' | 'material', summary: string }
 */
export async function analyzeContent(content, providerConfig = {}) {
  const prompt = `Analyze the following text and determine if it is:
1. An existing quiz/exam/test with questions and answers already present
2. Learning material (textbook, notes, article, module) that could be used to generate quiz questions

Respond with JSON in this exact format:
{
  "type": "quiz" or "material",
  "summary": "Brief 1-sentence description of the content",
  "questionCount": number (if type is "quiz", how many questions detected; if "material", 0)
}

CONTENT:
---
${content.substring(0, 5000)}
---`;

  try {
    const result = await callProvider(prompt, providerConfig);
    return {
      type: result.type === 'quiz' ? 'quiz' : 'material',
      summary: result.summary || '',
      questionCount: result.questionCount || 0,
    };
  } catch (err) {
    console.error('[AI] Content analysis failed:', err.message);
    // Default to material if analysis fails
    return { type: 'material', summary: 'Could not analyze content', questionCount: 0 };
  }
}

/**
 * Extract existing quiz questions directly from content (no generation needed).
 * Used when content already contains quiz questions.
 */
export async function extractQuizFromContent(content, providerConfig = {}) {
  const prompt = `You are a quiz extraction expert for Lexara platform.

The following content ALREADY contains quiz questions, answers, and possibly explanations.
Your job is to EXTRACT them exactly as they are — do NOT create new questions.

CRITICAL RULES:
- Extract every question found in the content
- For options: include the FULL TEXT of each option, NOT just the letter (e.g. "To define boundaries of what's included and excluded" NOT "A")
- For correctAnswer: use the FULL TEXT of the correct option, NOT just the letter (e.g. "To define boundaries of what's included and excluded" NOT "B")
- If it's a true/false, set type to "truefalse" and options to ["True", "False"]
- If it has multiple choices, set type to "mcq"  
- If no choices are provided, set type to "fillinblank"
- Add a brief explanation if one exists, otherwise leave empty

CONTENT:
---
${content.substring(0, 30000)}
---

Respond with JSON:
{
  "title": "Extracted title or subject of the quiz",
  "questions": [
    {
      "type": "mcq",
      "question": "The exact question text",
      "options": ["Full text of option A", "Full text of option B", "Full text of option C", "Full text of option D"],
      "correctAnswer": "Full text of the correct option (must exactly match one of the options above)",
      "explanation": "Explanation if available"
    }
  ]
}`;

  try {
    const parsed = await callProvider(prompt, providerConfig);
    const questions = validateAndNormalize(parsed);
    const title = parsed.title || 'Extracted Quiz';
    return { title, questions };
  } catch (err) {
    console.error('[AI] Quiz extraction failed:', err.message);
    throw new Error(`Quiz extraction failed: ${err.message}`);
  }
}

export default { generateQuizFromContent, generateQuizFromTopic, analyzeContent, extractQuizFromContent };

// =============================================
// KEY VALIDATION — used by /users/me/ai-keys/:provider
// =============================================

/**
 * Test whether a given (provider, apiKey, model, baseUrl) tuple is valid.
 * Makes a tiny generation request and inspects the response.
 *
 * Returns { ok: true } on success or { ok: false, error: string } on failure.
 * NEVER throws — callers can react to a clean boolean instead of a try/catch.
 */
export async function testProviderKey(provider, apiKey, model, baseUrl) {
  if (!providers[provider]) {
    return { ok: false, error: `Unsupported provider: ${provider}` };
  }
  if (!apiKey || apiKey.length < 8) {
    return { ok: false, error: 'API key is missing or too short' };
  }
  if (provider === 'openai-compatible') {
    if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) {
      return { ok: false, error: 'Base URL is missing or not a valid HTTP(S) URL' };
    }
    if (!model) {
      return { ok: false, error: 'Model id is required for openai-compatible providers' };
    }
  }

  // The smallest possible JSON-mode prompt.
  const ping = `Respond with valid JSON: {"ok": true}`;

  try {
    const result = provider === 'openai-compatible'
      ? await providers[provider](ping, apiKey, model || null, baseUrl)
      : await providers[provider](ping, apiKey, model || null);
    if (!result || typeof result !== 'object') {
      return { ok: false, error: 'Provider returned an unexpected response shape' };
    }
    return { ok: true };
  } catch (err) {
    // Strip any potentially-sensitive parts of the message before returning.
    const msg = String(err?.message || 'Unknown error')
      .replace(apiKey, '<redacted>')
      .slice(0, 240);
    return { ok: false, error: msg };
  }
}

