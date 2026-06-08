import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, FileText, MessageSquare, Loader2, Check, Upload, X, File, Settings, Key, ChevronDown, Trash2 } from 'lucide-react';
import { ai as aiApi, quizzes as quizzesApi, modules as modulesApi, users as usersApi } from '../services/api';
import './CreateQuiz.css';

const SOURCE_TYPES = [
  { id: 'file', icon: Upload, label: 'Upload File' },
  { id: 'text', icon: FileText, label: 'Paste Text' },
  { id: 'topic', icon: MessageSquare, label: 'Topic' },
];

const GENERATING_STEPS = [
  'Brewing your content...',
  'Simmering key concepts...',
  'Cooking up questions...',
  'Seasoning answer choices...',
  'Plating explanations...',
  'Serving your quiz...',
];

const AI_PROVIDERS = [
  { id: 'mistral', name: 'Mistral AI', desc: 'Default — fast & efficient' },
  { id: 'gemini', name: 'Google Gemini', desc: 'Multimodal AI by Google' },
  { id: 'openai-compatible', name: 'OpenAI-Compatible', desc: 'OpenRouter, Groq, OpenAI, Together, etc.' },
];

// Presets for the openai-compatible provider. Picking one prefills baseURL.
// Pick "Custom" to enter any URL (self-hosted vLLM, corporate proxy, etc.).
const OPENAI_COMPATIBLE_PRESETS = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    modelHint: 'e.g. openai/gpt-4o-mini, anthropic/claude-3.5-sonnet, meta-llama/llama-3.3-70b-instruct',
    docsUrl: 'https://openrouter.ai/models',
  },
  {
    id: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    modelHint: 'e.g. llama-3.3-70b-versatile, mixtral-8x7b-32768',
    docsUrl: 'https://console.groq.com/docs/models',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    modelHint: 'e.g. gpt-4o-mini, gpt-4o, gpt-4-turbo',
    docsUrl: 'https://platform.openai.com/docs/models',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    modelHint: 'e.g. deepseek-chat, deepseek-reasoner',
    docsUrl: 'https://api-docs.deepseek.com/',
  },
  {
    id: 'together',
    name: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    modelHint: 'e.g. meta-llama/Llama-3.3-70B-Instruct-Turbo',
    docsUrl: 'https://docs.together.ai/docs/inference-models',
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    modelHint: 'e.g. llama-3.3-70b, llama3.1-70b',
    docsUrl: 'https://inference-docs.cerebras.ai/introduction',
  },
  {
    id: 'custom',
    name: 'Custom',
    baseUrl: '',
    modelHint: 'Enter the model id your endpoint expects',
    docsUrl: '',
  },
];

export default function CreateQuiz() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const moduleId = searchParams.get('moduleId');
  const fileInputRef = useRef(null);
  const autoTriggered = useRef(false);
  // Track in-flight generation step intervals so we can cancel them on
  // unmount. Without this, a user navigating away mid-generation leaves
  // a 2-2.5s tick alive and calls setGenStep on an unmounted component.
  const stepIntervalRef = useRef(null);

  // Source
  const [sourceType, setSourceType] = useState('file');
  const [content, setContent] = useState('');
  const [topic, setTopic] = useState('');
  const [file, setFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [title, setTitle] = useState('');

  // Config (only shown for learning material or text/topic)
  const [config, setConfig] = useState({
    questionCount: 10,
    difficulty: 'medium',
    questionTypes: ['mcq', 'truefalse', 'fillinblank'],
    isPublic: false,
    allowPractice: true,
    passingScore: 70,
  });

  // AI Provider settings
  // ────────────────────────────────────────────────────────────
  // The user picks a provider. If they have a SAVED key for that provider
  // (encrypted on the server), we use it automatically — no inline input.
  // If they don't, they can paste a one-off key OR save one for next time.
  // The plaintext key never persists in the browser.
  const [showAiSettings, setShowAiSettings] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState('mistral');
  const [savedKeys, setSavedKeys] = useState({}); // { mistral: { hasKey, last4, model }, gemini: {...} }
  const [savedKeysLoading, setSavedKeysLoading] = useState(true);

  // One-off / save form state
  const [oneOffKey, setOneOffKey] = useState('');
  const [oneOffModel, setOneOffModel] = useState('');
  // For openai-compatible: which preset is selected, and the resolved baseURL.
  // Preset 'custom' lets the user type any URL.
  const [selectedPreset, setSelectedPreset] = useState('openrouter');
  const [oneOffBaseUrl, setOneOffBaseUrl] = useState(OPENAI_COMPATIBLE_PRESETS[0].baseUrl);
  const [savingKey, setSavingKey] = useState(false);
  const [keyMessage, setKeyMessage] = useState(null); // { kind: 'ok'|'error', text }

  // File analysis state
  const [analyzing, setAnalyzing] = useState(false);
  const [fileAnalysis, setFileAnalysis] = useState(null); // { contentType, summary, textContent }
  const [fileMode, setFileMode] = useState(null); // 'extract' | 'generate'

  // Generation state
  const [questions, setQuestions] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [genStep, setGenStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [step, setStep] = useState(1);
  const [moduleLoading, setModuleLoading] = useState(false);

  // Load the user's saved AI keys from the server (encrypted at rest).
  // Plaintext keys are never returned — only `{ hasKey, last4, model }`.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await usersApi.listAIKeys();
        if (alive) setSavedKeys(res.data?.keys || {});
      } catch {
        // Non-fatal — user can still use platform fallback or paste a one-off key.
      } finally {
        if (alive) setSavedKeysLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Unmount cleanup — kill any in-flight generation step interval so it
  // doesn't tick after the component is gone.
  useEffect(() => {
    return () => {
      if (stepIntervalRef.current) {
        clearInterval(stepIntervalRef.current);
        stepIntervalRef.current = null;
      }
    };
  }, []);

  // ===== AUTO-LOAD MODULE PDF =====
  useEffect(() => {
    if (!moduleId || autoTriggered.current) return;
    autoTriggered.current = true;

    async function loadModulePdf() {
      setModuleLoading(true);
      try {
        // Get module info
        const modRes = await modulesApi.get(moduleId);
        const mod = modRes.data.module;
        setTitle(`Quiz: ${mod.title}`);

        // Fetch the actual PDF file
        const fileUrl = modulesApi.getFileUrl(moduleId);
        const response = await fetch(fileUrl, { credentials: 'include' });
        const blob = await response.blob();
        const pdfFile = new window.File([blob], mod.file_name || 'module.pdf', { type: 'application/pdf' });

        setFile(pdfFile);
        setSourceType('file');
        setModuleLoading(false);

        // Auto-trigger analysis
        setAnalyzing(true); setError(null);
        try {
          const res = await aiApi.analyzeFile(pdfFile, getProviderPayload());
          const analysis = res.data;
          setFileAnalysis(analysis);
          if (analysis.contentType === 'quiz') {
            setFileMode('extract');
          } else {
            setFileMode('generate');
            setStep(2); // Skip to config since we already have the file
          }
        } catch (err) {
          setError(err.message || 'Failed to analyze module.');
        } finally { setAnalyzing(false); }
      } catch (err) {
        setError(err.message || 'Failed to load module.');
        setModuleLoading(false);
      }
    }

    loadModulePdf();
  }, [moduleId]);

  function getProviderPayload() {
    // Always send the provider id. Send the inline one-off key/model ONLY
    // if the user typed one and they don't have a saved key for this provider
    // (saved keys take precedence and stay server-side).
    const payload = { provider: selectedProvider };
    const hasSaved = !!savedKeys?.[selectedProvider]?.hasKey;
    if (!hasSaved) {
      if (oneOffKey.trim()) payload.apiKey = oneOffKey.trim();
      if (oneOffModel.trim()) payload.model = oneOffModel.trim();
      // For openai-compatible, the baseURL is required even on one-off use,
      // so the server knows where to POST.
      if (selectedProvider === 'openai-compatible' && oneOffBaseUrl.trim()) {
        payload.baseUrl = oneOffBaseUrl.trim();
      }
    }
    return payload;
  }

  /** Save the typed key to the user's profile (encrypted on the server). */
  async function handleSaveKey() {
    if (!oneOffKey.trim()) return;
    // openai-compatible needs both baseUrl and a model id.
    if (selectedProvider === 'openai-compatible') {
      if (!oneOffBaseUrl.trim()) {
        setKeyMessage({ kind: 'error', text: 'Pick a preset or paste a base URL first.' });
        return;
      }
      if (!oneOffModel.trim()) {
        setKeyMessage({ kind: 'error', text: 'A model id is required (the OpenAI-compatible API needs one).' });
        return;
      }
    }
    setSavingKey(true); setKeyMessage(null);
    try {
      const payload = {
        apiKey: oneOffKey.trim(),
        model: oneOffModel.trim() || undefined,
      };
      if (selectedProvider === 'openai-compatible') {
        payload.baseUrl = oneOffBaseUrl.trim();
      }
      const res = await usersApi.saveAIKey(selectedProvider, payload);
      setSavedKeys((prev) => ({ ...prev, [selectedProvider]: res.data }));
      setOneOffKey(''); setOneOffModel('');
      setKeyMessage({ kind: 'ok', text: 'Key saved and verified.' });
    } catch (err) {
      setKeyMessage({ kind: 'error', text: err.message || 'Could not save key.' });
    } finally {
      setSavingKey(false);
    }
  }

  /** Remove a saved key for the current provider. */
  async function handleRemoveKey() {
    if (!savedKeys?.[selectedProvider]?.hasKey) return;
    setSavingKey(true); setKeyMessage(null);
    try {
      await usersApi.deleteAIKey(selectedProvider);
      setSavedKeys((prev) => ({ ...prev, [selectedProvider]: { hasKey: false } }));
      setKeyMessage({ kind: 'ok', text: 'Saved key removed.' });
    } catch (err) {
      setKeyMessage({ kind: 'error', text: err.message || 'Could not remove key.' });
    } finally {
      setSavingKey(false);
    }
  }

  // Drag and drop
  const handleDrag = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(false);
    const dropped = e.dataTransfer?.files?.[0];
    if (dropped) validateAndSetFile(dropped);
  }, []);

  function validateAndSetFile(f) {
    const allowed = ['application/pdf', 'text/plain', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowed.includes(f.type)) { setError('Only PDF, DOC, DOCX, and TXT files are supported.'); return; }
    if (f.size > 10 * 1024 * 1024) { setError('File must be under 10MB.'); return; }
    setFile(f); setError(null); setFileAnalysis(null); setFileMode(null);
  }

  function removeFile() {
    setFile(null); setFileAnalysis(null); setFileMode(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // ===== SMART FILE ANALYSIS =====
  async function handleAnalyzeFile() {
    if (!file) return;
    setAnalyzing(true); setError(null);
    try {
      const res = await aiApi.analyzeFile(file, getProviderPayload());
      const analysis = res.data;
      setFileAnalysis(analysis);

      if (analysis.contentType === 'quiz') {
        // It's already a quiz — offer to extract directly
        setFileMode('extract');
      } else {
        // It's learning material — needs config
        setFileMode('generate');
      }
    } catch (err) {
      setError(err.message || 'Failed to analyze file.');
    } finally {
      setAnalyzing(false);
    }
  }

  // ===== EXTRACT (quiz PDF — no config needed) =====
  async function handleExtractQuiz() {
    if (!fileAnalysis?.textContent) return;
    setGenerating(true); setGenStep(0); setError(null);
    if (stepIntervalRef.current) clearInterval(stepIntervalRef.current);
    stepIntervalRef.current = setInterval(() => {
      setGenStep(prev => Math.min(prev + 1, GENERATING_STEPS.length - 1));
    }, 2000);

    try {
      const res = await aiApi.extractQuiz(fileAnalysis.textContent, getProviderPayload());
      clearInterval(stepIntervalRef.current);
      stepIntervalRef.current = null;
      setQuestions(res.data.questions);
      if (!title) setTitle(res.data.title || `Quiz from ${file?.name || 'Document'}`);
      setStep(3);
    } catch (err) {
      clearInterval(stepIntervalRef.current);
      stepIntervalRef.current = null;
      setError(err.message || 'Extraction failed.');
    } finally { setGenerating(false); }
  }

  // ===== GENERATE (learning material — with config) =====
  async function handleGenerate() {
    setError(null); setGenerating(true); setGenStep(0);
    if (stepIntervalRef.current) clearInterval(stepIntervalRef.current);
    stepIntervalRef.current = setInterval(() => {
      setGenStep(prev => Math.min(prev + 1, GENERATING_STEPS.length - 1));
    }, 2500);

    try {
      let res;
      const pCfg = getProviderPayload();
      if (sourceType === 'file' && file) {
        res = await aiApi.generateFromFile(file, config, pCfg);
      } else if (sourceType === 'topic') {
        res = await aiApi.generateFromTopic(topic, config, pCfg);
      } else {
        res = await aiApi.generate(content, config, pCfg);
      }

      clearInterval(stepIntervalRef.current);
      stepIntervalRef.current = null;
      setQuestions(res.data.questions);
      if (!title) setTitle(res.data.title || `Quiz on ${topic || file?.name || 'Content'}`);
      setStep(3);
    } catch (err) {
      clearInterval(stepIntervalRef.current);
      stepIntervalRef.current = null;
      setError(err.message || 'Generation failed. Try again.');
    } finally { setGenerating(false); }
  }

  async function handleSave() {
    setSaving(true); setError(null);
    try {
      const res = await quizzesApi.create({
        title, isPublic: config.isPublic, allowPractice: config.allowPractice !== false, passingScore: config.passingScore,
        sourceType: sourceType === 'file' ? 'pdf' : sourceType,
        sourceFileName: file?.name,
        questions: questions.map(q => ({
          type: q.type, question: q.question, options: q.options,
          correctAnswer: q.correctAnswer, explanation: q.explanation,
        })),
      });
      navigate(`/quiz/${res.data.quiz.id}`);
    } catch (err) {
      setError(err.message || 'Failed to save quiz.');
    } finally { setSaving(false); }
  }

  const canProceed =
    sourceType === 'topic' ? topic.length >= 3 :
    sourceType === 'file' ? !!file :
    content.length >= 50;

  const activeProvider = AI_PROVIDERS.find(p => p.id === selectedProvider) || AI_PROVIDERS[0];
  const activeSavedKey = savedKeys?.[selectedProvider];

  return (
    <div className="create-page">
      <div className="container container--narrow">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <span className="label">Create</span>
          <h1 className="create-page__title">Generate a Quiz</h1>
        </motion.div>

        {/* Progress Steps */}
        <div className="progress-steps">
          {['Content', 'Configure', 'Review'].map((s, i) => (
            <div key={s} className={`progress-step ${step > i + 1 ? 'progress-step--done' : ''} ${step === i + 1 ? 'progress-step--active' : ''}`}>
              <div className="progress-step__dot">
                {step > i + 1 ? <Check size={12} /> : i + 1}
              </div>
              <span>{s}</span>
            </div>
          ))}
        </div>

        {/* MODULE-LOAD OVERLAY — shown while we fetch + auto-attach the PDF
            from a /create?moduleId=<id> link, so the user knows what's
            happening instead of staring at an empty Step 1. Reuses the
            generation overlay styling for consistency. */}
        <AnimatePresence>
          {moduleLoading && (
            <motion.div className="gen-overlay"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div className="gen-modal"
                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}>
                <div className="gen-modal__orb" />
                <div className="gen-modal__content">
                  <Loader2 size={28} className="gen-modal__icon spin" />
                  <h3 className="gen-modal__title">Loading Module</h3>
                  <p className="gen-modal__subtitle">Fetching your PDF and preparing the editor…</p>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* GENERATING OVERLAY */}
        <AnimatePresence>
          {generating && (
            <motion.div className="gen-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="gen-modal">
                <div className="gen-modal__orb" />
                <div className="gen-modal__content">
                  <Sparkles size={28} className="gen-modal__icon" />
                  <h3 className="gen-modal__title">Cooking Your Quiz</h3>
                  <div className="gen-modal__steps">
                    {GENERATING_STEPS.map((s, i) => (
                      <motion.div key={s}
                        className={`gen-step ${i < genStep ? 'gen-step--done' : ''} ${i === genStep ? 'gen-step--active' : ''}`}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: i <= genStep ? 1 : 0.3, x: 0 }}
                        transition={{ delay: i * 0.1, duration: 0.3 }}>
                        <div className="gen-step__dot">
                          {i < genStep ? <Check size={10} /> : i === genStep ? <Loader2 size={10} className="spin" /> : null}
                        </div>
                        <span>{s}</span>
                      </motion.div>
                    ))}
                  </div>
                  <div className="gen-modal__bar">
                    <motion.div className="gen-modal__bar-fill"
                      animate={{ width: `${((genStep + 1) / GENERATING_STEPS.length) * 100}%` }}
                      transition={{ duration: 0.5 }} />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ANALYZING OVERLAY */}
        <AnimatePresence>
          {analyzing && (
            <motion.div className="gen-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="gen-modal">
                <div className="gen-modal__orb" />
                <div className="gen-modal__content">
                  <Loader2 size={28} className="gen-modal__icon spin" />
                  <h3 className="gen-modal__title">Reading Your Document</h3>
                  <p className="gen-modal__subtitle">Detecting content type...</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {/* ===== STEP 1: Content Input ===== */}
          {step === 1 && !generating && !analyzing && (
            <motion.div key="step1" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.3 }}>

              <div className="source-tabs">
                {SOURCE_TYPES.map(s => (
                  <button key={s.id}
                    className={`source-tab ${sourceType === s.id ? 'source-tab--active' : ''}`}
                    onClick={() => { setSourceType(s.id); setError(null); setFileAnalysis(null); setFileMode(null); }}>
                    <s.icon size={16} /><span>{s.label}</span>
                  </button>
                ))}
              </div>

              {/* FILE UPLOAD */}
              {sourceType === 'file' && (
                <>
                  {/*
                    Use a <label> wrapping the file input so the tap on
                    the dropzone IS the user gesture that opens the
                    picker. Programmatic .click() on a hidden input is
                    silently blocked by some mobile browsers (notably
                    Android Chrome and iOS Safari), which was preventing
                    file uploads on phones.
                  */}
                  <label
                    className={`dropzone ${dragActive ? 'dropzone--active' : ''} ${file ? 'dropzone--has-file' : ''}`}
                    onDragEnter={handleDrag}
                    onDragOver={handleDrag}
                    onDragLeave={handleDrag}
                    onDrop={handleDrop}
                    htmlFor="dropzone-input"
                  >
                    <input
                      id="dropzone-input"
                      ref={fileInputRef}
                      type="file"
                      className="dropzone__input"
                      accept=".pdf,.doc,.docx,.txt"
                      onChange={e => e.target.files?.[0] && validateAndSetFile(e.target.files[0])}
                      disabled={!!file}
                    />
                    {file ? (
                      <div className="dropzone__file">
                        <File size={24} />
                        <div className="dropzone__file-info">
                          <span className="dropzone__file-name">{file.name}</span>
                          <span className="dropzone__file-size">{(file.size / 1024).toFixed(0)} KB</span>
                        </div>
                        <button
                          type="button"
                          className="dropzone__remove"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeFile(); }}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <div className="dropzone__placeholder">
                        <Upload size={32} strokeWidth={1.2} />
                        <p><strong>Drop your file here</strong> or click to browse</p>
                        <span className="dropzone__hint">PDF, DOC, DOCX, or TXT — max 10MB</span>
                      </div>
                    )}
                  </label>

                  {/* File analysis result */}
                  {fileAnalysis && (
                    <motion.div className="file-analysis card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                      <div className="file-analysis__badge">
                        {fileAnalysis.contentType === 'quiz' ? 'Quiz Detected' : 'Learning Material'}
                      </div>
                      <p className="file-analysis__summary">{fileAnalysis.summary}</p>
                      {fileAnalysis.contentType === 'quiz' && (
                        <p className="file-analysis__count">{fileAnalysis.questionCount} questions found</p>
                      )}

                      <div className="file-analysis__actions">
                        {fileAnalysis.contentType === 'quiz' ? (
                          <>
                            <button className="btn btn--primary" onClick={handleExtractQuiz}>
                              Extract Questions As-Is
                            </button>
                            <button className="btn btn--ghost" onClick={() => { setFileMode('generate'); setStep(2); }}>
                              Generate New Questions Instead
                            </button>
                          </>
                        ) : (
                          <button className="btn btn--primary" onClick={() => setStep(2)}>
                            Next: Configure Quiz
                          </button>
                        )}
                      </div>
                    </motion.div>
                  )}
                </>
              )}

              {/* TEXT */}
              {sourceType === 'text' && (
                <div className="input-group">
                  <label className="input-label">Content</label>
                  <textarea className="input create-textarea" rows={10}
                    placeholder="Paste your study material, notes, or any text content here (min 50 characters)..."
                    value={content} onChange={e => setContent(e.target.value)} id="content-input" />
                  <p className="input-hint">{content.length} characters</p>
                </div>
              )}

              {/* TOPIC */}
              {sourceType === 'topic' && (
                <div className="input-group">
                  <label className="input-label">Topic</label>
                  <input type="text" className="input" placeholder="e.g. Photosynthesis, World War II, Python Basics..."
                    value={topic} onChange={e => setTopic(e.target.value)} id="topic-input" />
                </div>
              )}

              {error && <div className="create-error">{error}</div>}

              <div className="create-actions">
                {sourceType === 'file' ? (
                  !fileAnalysis ? (
                    <button className="btn btn--primary btn--lg" onClick={handleAnalyzeFile} disabled={!file || analyzing}>
                      {analyzing ? <><Loader2 size={18} className="spin" /> Analyzing...</> : 'Upload & Analyze'}
                    </button>
                  ) : null
                ) : (
                  <button className="btn btn--primary btn--lg" onClick={() => setStep(2)} disabled={!canProceed}>
                    Next: Configure
                  </button>
                )}
              </div>
            </motion.div>
          )}

          {/* ===== STEP 2: Configure ===== */}
          {step === 2 && !generating && (
            <motion.div key="step2" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.3 }}>

              <div className="config-grid">
                <div className="input-group">
                  <label className="input-label">Quiz Title</label>
                  <input type="text" className="input" placeholder="Auto-generated if left blank"
                    value={title} onChange={e => setTitle(e.target.value)} id="title-input" />
                </div>

                <div className="input-group">
                  <label className="input-label">Number of Questions</label>
                  <input type="range" min={3} max={30} value={config.questionCount}
                    onChange={e => setConfig({ ...config, questionCount: parseInt(e.target.value) })}
                    className="range-input" id="question-count" />
                  <span className="range-value">{config.questionCount} questions</span>
                </div>

                <div className="input-group">
                  <label className="input-label">Difficulty</label>
                  <div className="pill-group">
                    {['easy', 'medium', 'hard'].map(d => (
                      <button key={d} className={`pill ${config.difficulty === d ? 'pill--active' : ''}`}
                        onClick={() => setConfig({ ...config, difficulty: d })}>{d}</button>
                    ))}
                  </div>
                </div>

                <div className="input-group">
                  <label className="input-label">Question Types</label>
                  <div className="pill-group">
                    {[
                      { id: 'mcq', label: 'Multiple Choice' },
                      { id: 'truefalse', label: 'True/False' },
                      { id: 'fillinblank', label: 'Fill Blank' },
                    ].map(t => (
                      <button key={t.id}
                        className={`pill ${config.questionTypes.includes(t.id) ? 'pill--active' : ''}`}
                        onClick={() => {
                          const types = config.questionTypes.includes(t.id)
                            ? config.questionTypes.filter(x => x !== t.id)
                            : [...config.questionTypes, t.id];
                          if (types.length > 0) setConfig({ ...config, questionTypes: types });
                        }}>{t.label}</button>
                    ))}
                  </div>
                </div>

                <div className="input-group">
                  <label className="input-label">Passing Score: {config.passingScore}%</label>
                  <input type="range" min={30} max={100} step={5} value={config.passingScore}
                    onChange={e => setConfig({ ...config, passingScore: parseInt(e.target.value) })}
                    className="range-input" id="passing-score" />
                </div>

                <div className="input-group">
                  <label className="toggle-label">
                    <input type="checkbox" checked={config.isPublic}
                      onChange={e => setConfig({ ...config, isPublic: e.target.checked })} />
                    <span>Make quiz public (shareable via link)</span>
                  </label>
                  <label className="toggle-label">
                    <input type="checkbox" checked={config.allowPractice !== false}
                      onChange={e => setConfig({ ...config, allowPractice: e.target.checked })} />
                    <span>Allow practice mode (students see answers per question)</span>
                  </label>
                </div>

                {/* AI PROVIDER SETTINGS */}
                <div className="ai-settings">
                  <button className="ai-settings__toggle" onClick={() => setShowAiSettings(!showAiSettings)}>
                    <Settings size={15} />
                    <span>
                      AI Provider: <strong>{activeProvider.name}</strong>
                      {activeSavedKey?.hasKey && (
                        <span className="ai-settings__saved-tag"> · using your saved key</span>
                      )}
                    </span>
                    <ChevronDown size={14} className={showAiSettings ? 'rotate-180' : ''} />
                  </button>

                  <AnimatePresence>
                    {showAiSettings && (
                      <motion.div className="ai-settings__panel"
                        initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}>
                        <div className="ai-settings__inner">
                          <p className="ai-settings__hint">Choose a provider. Save your own API key for unlimited use, or leave blank to use the platform default.</p>

                          <div className="ai-provider-list">
                            {AI_PROVIDERS.map(p => (
                              <button key={p.id}
                                className={`ai-provider-btn ${selectedProvider === p.id ? 'ai-provider-btn--active' : ''}`}
                                onClick={() => {
                                  setSelectedProvider(p.id);
                                  setOneOffKey(''); setOneOffModel(''); setKeyMessage(null);
                                  // Reset baseUrl/preset to the default OpenRouter values
                                  // so the form starts clean each time the user toggles.
                                  if (p.id === 'openai-compatible') {
                                    setSelectedPreset('openrouter');
                                    setOneOffBaseUrl(OPENAI_COMPATIBLE_PRESETS[0].baseUrl);
                                  }
                                }}>
                                <strong>{p.name}</strong><span>{p.desc}</span>
                                {savedKeys?.[p.id]?.hasKey && (
                                  <span className="ai-provider-btn__badge">saved</span>
                                )}
                              </button>
                            ))}
                          </div>

                          {/* Saved-key state vs paste-new state */}
                          {savedKeysLoading ? (
                            <div className="ai-settings__loading">Loading saved keys…</div>
                          ) : activeSavedKey?.hasKey ? (
                            // Already have a saved key — write-only display
                            <div className="ai-saved-key">
                              <div className="ai-saved-key__row">
                                <Key size={14} />
                                <span className="ai-saved-key__label">Saved key for {activeProvider.name}</span>
                                <span className="ai-saved-key__mask">
                                  •••••••••• {activeSavedKey.last4 || '••••'}
                                </span>
                              </div>
                              {activeSavedKey.baseUrl && (
                                <div className="ai-saved-key__model">
                                  Endpoint: <code>{activeSavedKey.baseUrl}</code>
                                </div>
                              )}
                              {activeSavedKey.model && (
                                <div className="ai-saved-key__model">
                                  Model: <code>{activeSavedKey.model}</code>
                                </div>
                              )}
                              <p className="ai-saved-key__note">
                                Your key is stored encrypted and used only for your generations.
                                Paste a new key to replace it.
                              </p>
                              <div className="ai-saved-key__actions">
                                <input type="password" className="input" placeholder="Replace with a new key…"
                                  value={oneOffKey} onChange={e => setOneOffKey(e.target.value)} id="replace-api-key" />
                                <button className="btn btn--primary btn--sm"
                                  onClick={handleSaveKey} disabled={savingKey || !oneOffKey.trim()}>
                                  {savingKey ? <><Loader2 size={14} className="spin" /> Verifying…</> : 'Replace'}
                                </button>
                                <button className="btn btn--ghost btn--sm"
                                  onClick={handleRemoveKey} disabled={savingKey}>
                                  <Trash2 size={14} /> Remove
                                </button>
                              </div>
                              {keyMessage && (
                                <p className={`ai-key-message ai-key-message--${keyMessage.kind}`}>
                                  {keyMessage.text}
                                </p>
                              )}
                            </div>
                          ) : (
                            // No saved key — show paste form with optional save
                            <div className="ai-settings__custom">
                              {/* Preset picker + baseURL — only for openai-compatible. */}
                              {selectedProvider === 'openai-compatible' && (
                                <>
                                  <div className="input-group">
                                    <label className="input-label">
                                      Provider Preset <span className="input-hint">(prefills the base URL)</span>
                                    </label>
                                    <div className="ai-preset-chips">
                                      {OPENAI_COMPATIBLE_PRESETS.map(preset => (
                                        <button
                                          key={preset.id}
                                          type="button"
                                          className={`ai-preset-chip ${selectedPreset === preset.id ? 'ai-preset-chip--active' : ''}`}
                                          onClick={() => {
                                            setSelectedPreset(preset.id);
                                            setOneOffBaseUrl(preset.baseUrl);
                                          }}
                                        >
                                          {preset.name}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                  <div className="input-group">
                                    <label className="input-label">
                                      Base URL <span className="input-hint">(API root, /chat/completions appended automatically)</span>
                                    </label>
                                    <input
                                      type="url"
                                      className="input"
                                      placeholder="https://openrouter.ai/api/v1"
                                      value={oneOffBaseUrl}
                                      onChange={e => setOneOffBaseUrl(e.target.value)}
                                      id="custom-base-url"
                                      autoComplete="off"
                                    />
                                  </div>
                                </>
                              )}
                              <div className="input-group">
                                <label className="input-label">
                                  <Key size={13} /> Your API Key {selectedProvider === 'openai-compatible'
                                    ? <span className="input-hint">(required for this provider)</span>
                                    : <span className="input-hint">(optional — uses platform key if blank)</span>}
                                </label>
                                <input type="password" className="input" placeholder="Paste your API key…"
                                  value={oneOffKey} onChange={e => setOneOffKey(e.target.value)}
                                  id="custom-api-key" autoComplete="off" />
                              </div>
                              <div className="input-group">
                                <label className="input-label">
                                  {selectedProvider === 'openai-compatible' ? 'Model' : 'Custom Model'}
                                  {selectedProvider === 'openai-compatible'
                                    ? <span className="input-hint">(required)</span>
                                    : <span className="input-hint">(optional)</span>}
                                </label>
                                <input type="text" className="input"
                                  placeholder={
                                    selectedProvider === 'mistral' ? 'e.g. mistral-large-latest' :
                                    selectedProvider === 'gemini' ? 'e.g. gemini-1.5-pro' :
                                    (OPENAI_COMPATIBLE_PRESETS.find(p => p.id === selectedPreset)?.modelHint || 'e.g. openai/gpt-4o-mini')
                                  }
                                  value={oneOffModel} onChange={e => setOneOffModel(e.target.value)}
                                  id="custom-model" />
                                {selectedProvider === 'openai-compatible' && (() => {
                                  const preset = OPENAI_COMPATIBLE_PRESETS.find(p => p.id === selectedPreset);
                                  return preset?.docsUrl ? (
                                    <p className="input-hint">
                                      Browse models:{' '}
                                      <a href={preset.docsUrl} target="_blank" rel="noopener noreferrer">
                                        {preset.docsUrl.replace(/^https?:\/\//, '')}
                                      </a>
                                    </p>
                                  ) : null;
                                })()}
                              </div>
                              {oneOffKey.trim() && (
                                <div className="ai-key-save">
                                  <button className="btn btn--outline btn--sm"
                                    onClick={handleSaveKey} disabled={savingKey || oneOffKey.trim().length < 8}>
                                    {savingKey
                                      ? <><Loader2 size={14} className="spin" /> Verifying with {activeProvider.name}…</>
                                      : <>Save key to my profile</>}
                                  </button>
                                  <span className="ai-key-save__hint">
                                    Otherwise it's used once and discarded.
                                  </span>
                                </div>
                              )}
                              {keyMessage && (
                                <p className={`ai-key-message ai-key-message--${keyMessage.kind}`}>
                                  {keyMessage.text}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {error && <div className="create-error">{error}</div>}

              <div className="create-actions">
                <button className="btn btn--ghost btn--lg" onClick={() => setStep(1)}>Back</button>
                <button className="btn btn--primary btn--lg" onClick={handleGenerate} disabled={generating}>
                  <Sparkles size={18} /> Generate Quiz
                </button>
              </div>
            </motion.div>
          )}

          {/* ===== STEP 3: Review ===== */}
          {step === 3 && questions && !generating && (
            <motion.div key="step3" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.3 }}>

              <div className="review-header">
                <h3>{title}</h3>
                <p>{questions.length} questions — {fileMode === 'extract' ? 'extracted from document' : `${config.difficulty} difficulty`}</p>
              </div>

              <div className="question-preview-list">
                {questions.map((q, i) => (
                  <div key={i} className="question-preview card">
                    <div className="question-preview__header">
                      <span className="question-preview__num">Q{i + 1}</span>
                      <span className="badge">{q.type}</span>
                      <button className="btn btn--ghost btn--xs" onClick={() => setQuestions(prev => prev.filter((_, idx) => idx !== i))} title="Delete question">✕</button>
                    </div>
                    <textarea className="question-preview__edit"
                      value={q.question}
                      onChange={(e) => setQuestions(prev => prev.map((item, idx) => idx === i ? { ...item, question: e.target.value } : item))}
                      rows={2} />
                    {q.options?.length > 0 ? (
                      <div className="question-preview__options">
                        {q.options.map((o, oi) => (
                          <div key={oi} className={`question-preview__option ${o === q.correctAnswer ? 'question-preview__option--correct' : ''}`}
                            onClick={() => setQuestions(prev => prev.map((item, idx) => idx === i ? { ...item, correctAnswer: o } : item))}>
                            <input type="text" value={o}
                              onChange={(e) => setQuestions(prev => prev.map((item, idx) => idx === i ? { ...item, options: item.options.map((opt, oIdx) => oIdx === oi ? e.target.value : opt), correctAnswer: item.correctAnswer === o ? e.target.value : item.correctAnswer } : item))}
                              className="question-preview__option-input" />
                            {o === q.correctAnswer && <span className="question-preview__check">✓</span>}
                          </div>
                        ))}
                        <p className="question-preview__hint">Click an option to set it as correct answer</p>
                      </div>
                    ) : (
                      <div className="question-preview__answer">
                        <label className="question-preview__answer-label" htmlFor={`q-answer-${i}`}>Correct answer</label>
                        <input
                          id={`q-answer-${i}`}
                          type="text"
                          className="question-preview__answer-input"
                          value={q.correctAnswer || ''}
                          maxLength={200}
                          placeholder="Enter the answer that fills the blank…"
                          onChange={(e) => setQuestions(prev => prev.map((item, idx) => idx === i ? { ...item, correctAnswer: e.target.value } : item))}
                        />
                        <p className="question-preview__hint">Use <code>_____</code> in the question above to mark where the blank appears.</p>
                      </div>
                    )}
                    {q.explanation && (
                      <textarea className="question-preview__edit question-preview__edit--sm"
                        value={q.explanation}
                        onChange={(e) => setQuestions(prev => prev.map((item, idx) => idx === i ? { ...item, explanation: e.target.value } : item))}
                        rows={2} placeholder="Explanation..." />
                    )}
                  </div>
                ))}
              </div>

              {error && <div className="create-error">{error}</div>}

              <div className="create-actions">
                <button className="btn btn--ghost btn--lg" onClick={() => setStep(fileMode === 'extract' ? 1 : 2)}>Back</button>
                <button className="btn btn--primary btn--lg" onClick={handleSave} disabled={saving || questions.length === 0}>
                  {saving ? <><Loader2 size={18} className="spin" /> Saving...</> : <>Save & Publish</>}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
