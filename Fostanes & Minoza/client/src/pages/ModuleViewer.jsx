import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Document, Page, pdfjs } from 'react-pdf';
import {
  ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Sparkles, Share2,
  ArrowLeft, Loader2, BookOpen, Copy, Search, BookMarked,
  Highlighter, X, Play, Palette, Check, BookText, FileText
} from 'lucide-react';
import { modules as modulesApi } from '../services/api';
import useBareCanvas from '../components/shared/useBareCanvas';
import { MODULE_THEMES, readModuleTheme, writeModuleTheme } from '../components/shared/moduleThemes';
import ReaderView from '../components/shared/ReaderView';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import './ModuleViewer.css';
import '../components/shared/pdfWorker';

function getYouTubeId(url) {
  const match = url?.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

function getVimeoId(url) {
  const match = url?.match(/vimeo\.com\/(\d+)/);
  return match ? match[1] : null;
}

function getDirectVideoUrl(url) {
  if (/\.(mp4|webm|ogg)(\?|$)/i.test(url)) return url;
  // Google Drive video link
  const driveMatch = url?.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (driveMatch) return `https://drive.google.com/file/d/${driveMatch[1]}/preview`;
  return null;
}

export default function ModuleViewer() {
  const { id } = useParams();
  const navigate = useNavigate();
  // Reader needs an undistracting page — opt out of the global background texture.
  useBareCanvas();
  const bookRef = useRef(null);

  const [moduleData, setModuleData] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [currentSpread, setCurrentSpread] = useState(0);
  const [scale, setScale] = useState(1.0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [viewport, setViewport] = useState({
    w: typeof window === 'undefined' ? 1024 : window.innerWidth,
    h: typeof window === 'undefined' ? 768 : window.innerHeight,
  });
  const [flipping, setFlipping] = useState(null);

  // Interactive features
  const [selectionPopup, setSelectionPopup] = useState(null);
  const [highlights, setHighlights] = useState([]);
  const [definition, setDefinition] = useState(null);
  const [toast, setToast] = useState(null);
  const [youtubeModal, setYoutubeModal] = useState(null); // { type, src, title }

  // ===== READING THEME =====
  // Per-module visual treatment of the chrome (frame, toolbar, arrows,
  // page-turn animation). Persisted in localStorage so the user's choice
  // survives reloads. Setting to 'none' clears the storage entry.
  const [theme, setTheme] = useState(() => readModuleTheme(id));
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  useEffect(() => {
    writeModuleTheme(id, theme);
  }, [id, theme]);

  // ===== READER MODE (PDF vs Reader text view) =====
  // Per-module preference, persisted in localStorage. Only meaningful
  // if the module actually has extracted reader content (`hasReader`).
  const viewModeStorageKey = `lexara-module-view-${id}`;
  const [viewMode, setViewMode] = useState(() => {
    try {
      const v = localStorage.getItem(`lexara-module-view-${id}`);
      return v === 'reader' ? 'reader' : 'pdf';
    } catch {
      return 'pdf';
    }
  });
  useEffect(() => {
    try {
      if (viewMode === 'pdf') {
        localStorage.removeItem(viewModeStorageKey);
      } else {
        localStorage.setItem(viewModeStorageKey, viewMode);
      }
    } catch {}
  }, [viewMode, viewModeStorageKey]);

  const [readerData, setReaderData] = useState(null);
  const [readerLoading, setReaderLoading] = useState(false);
  const [hasReader, setHasReader] = useState(false);

  // Proactively fetch reader content on mount so we know whether to
  // render the toggle. Cheap JSON fetch — runs once per module load.
  useEffect(() => {
    let cancelled = false;
    setReaderLoading(true);
    modulesApi
      .getReader(id)
      .then((res) => {
        if (cancelled) return;
        const payload = res?.data || {};
        if (payload.has_reader && payload.reader_content) {
          setHasReader(true);
          setReaderData(payload.reader_content);
        } else {
          setHasReader(false);
          setReaderData(null);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setHasReader(false);
        setReaderData(null);
      })
      .finally(() => {
        if (!cancelled) setReaderLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // If reader content disappears (e.g. fetch failed) but the user had
  // reader mode saved, fall back to PDF mode silently.
  useEffect(() => {
    if (!hasReader && viewMode === 'reader' && !readerLoading) {
      setViewMode('pdf');
    }
  }, [hasReader, viewMode, readerLoading]);

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth < 768);
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const res = await modulesApi.get(id);
        setModuleData(res.data.module);
        setPdfUrl(modulesApi.getFileUrl(id));
        const saved = localStorage.getItem(`lexara-highlights-${id}`);
        if (saved) setHighlights(JSON.parse(saved));
      } catch (err) { setError(err.message || 'Failed to load module.'); }
      finally { setLoading(false); }
    }
    load();
  }, [id]);

  useEffect(() => {
    localStorage.setItem(`lexara-highlights-${id}`, JSON.stringify(highlights));
  }, [highlights, id]);

  function onDocumentLoadSuccess(pdf) {
    setNumPages(pdf.numPages);
    modulesApi.update(id, { pageCount: pdf.numPages }).catch(() => {});
  }

  // ===== APPLY VISUAL HIGHLIGHTS after page renders =====
  function applyHighlights() {
    if (!bookRef.current || highlights.length === 0) return;
    const textSpans = bookRef.current.querySelectorAll('.react-pdf__Page__textContent span');
    textSpans.forEach(span => {
      // Reset: if span was previously modified, restore original
      if (span.dataset.original) {
        span.textContent = span.dataset.original;
        delete span.dataset.original;
      }

      const text = span.textContent;
      if (!text || !text.trim()) return;

      let hasMatch = false;
      for (const h of highlights) {
        const hText = h.text.trim();
        if (hText && text.toLowerCase().includes(hText.toLowerCase())) {
          hasMatch = true;
          break;
        }
      }

      if (hasMatch) {
        span.dataset.original = text;
        // Build DOM safely — split text and wrap matches in <mark>
        const frag = document.createDocumentFragment();
        let remaining = text;
        for (const h of highlights) {
          const hText = h.text.trim();
          if (!hText) continue;
          const idx = remaining.toLowerCase().indexOf(hText.toLowerCase());
          if (idx >= 0) {
            if (idx > 0) frag.appendChild(document.createTextNode(remaining.slice(0, idx)));
            const mark = document.createElement('mark');
            mark.className = 'highlighted-text';
            mark.textContent = remaining.slice(idx, idx + hText.length);
            frag.appendChild(mark);
            remaining = remaining.slice(idx + hText.length);
          }
        }
        if (remaining) frag.appendChild(document.createTextNode(remaining));
        span.textContent = '';
        span.appendChild(frag);
      }
    });
  }

  // Re-apply highlights when spread or highlights change
  useEffect(() => {
    const timer = setTimeout(applyHighlights, 500);
    return () => clearTimeout(timer);
  }, [currentSpread, highlights]);

  // ===== INTERCEPT VIDEO LINKS =====
  useEffect(() => {
    function handleClick(e) {
      const link = e.target.closest('a[href]');
      if (!link) return;
      const href = link.getAttribute('href') || link.href;

      const ytId = getYouTubeId(href);
      if (ytId) {
        e.preventDefault();
        e.stopImmediatePropagation();
        window.open(`https://www.youtube.com/watch?v=${ytId}`, '_blank');
        return;
      }

      const vimeoId = getVimeoId(href);
      if (vimeoId) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setYoutubeModal({ type: 'vimeo', src: `https://player.vimeo.com/video/${vimeoId}?autoplay=1`, title: href });
        return;
      }

      const directUrl = getDirectVideoUrl(href);
      if (directUrl) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const isIframe = directUrl.includes('drive.google.com');
        setYoutubeModal({ type: isIframe ? 'iframe' : 'direct', src: directUrl, title: href });
      }
    }
    // Use document-level capture to intercept before pdfjs handlers
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, []);

  const isReader = viewMode === 'reader' && hasReader;
  const readerPageCount = readerData?.pages?.length || 0;

  const pagesPerSpread = isReader ? 1 : (isMobile ? 1 : 2);
  const totalUnits = isReader ? readerPageCount : numPages;
  const totalSpreads = Math.max(1, Math.ceil(totalUnits / pagesPerSpread));
  const leftPage = currentSpread * pagesPerSpread + 1;
  const rightPage = isReader ? null : (isMobile ? null : currentSpread * pagesPerSpread + 2);
  const canGoBack = currentSpread > 0;
  const canGoForward = currentSpread < totalSpreads - 1;

  // ===== RESPONSIVE PAGE SIZING ===========================================
  // Compute the maximum width and height each PDF page can occupy. We cap by
  // BOTH dimensions so landscape PDFs (16:9 slides) don't blow past the
  // viewport horizontally and portrait PDFs still fill height. react-pdf
  // honours the smaller constraint while preserving the PDF's natural ratio.
  //
  //   • width budget: half the viewport (minus arrow chrome + book frame)
  //                   for two-page spreads, or the full content width for
  //                   single-page (mobile / reader).
  //   • height budget: the viewer body height, minus the toolbar + page-dot
  //                    rail. Multiplied by `scale` so zoom still works.
  const computePageDimensions = () => {
    const ARROWS_AND_GAP = 140;       // 2× book-arrow ~48px + gaps
    const FRAME_PADDING = 40;         // book-spread border, page padding, etc.
    const TOOLBAR_AND_DOTS = 120;     // 48 toolbar + 56 page dots + slack
    const SPINE_WIDTH = isMobile ? 0 : 6;

    const usableW = Math.max(280, viewport.w - ARROWS_AND_GAP - FRAME_PADDING - SPINE_WIDTH);
    const usableH = Math.max(280, viewport.h - TOOLBAR_AND_DOTS);

    const widthPerPage = isMobile
      ? Math.min(usableW, 500)        // single page on mobile
      : Math.floor(usableW / 2);      // two pages share the spread
    return {
      width: Math.floor(widthPerPage * scale),
      height: Math.floor(usableH * scale),
    };
  };
  const pageDims = computePageDimensions();

  // Clamp currentSpread when totals shrink (e.g. switching from PDF to
  // a reader content with fewer pages, or vice versa).
  useEffect(() => {
    if (totalSpreads > 0 && currentSpread > totalSpreads - 1) {
      setCurrentSpread(Math.max(0, totalSpreads - 1));
    }
  }, [totalSpreads, currentSpread]);

  const flipPage = useCallback((direction) => {
    if (direction === 'next' && canGoForward) {
      setFlipping('right');
      setTimeout(() => { setCurrentSpread(prev => prev + 1); setFlipping(null); }, 250);
    } else if (direction === 'prev' && canGoBack) {
      setFlipping('left');
      setTimeout(() => { setCurrentSpread(prev => prev - 1); setFlipping(null); }, 250);
    }
  }, [canGoBack, canGoForward]);

  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); flipPage('next'); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); flipPage('prev'); }
      if (e.key === 'Escape') { setSelectionPopup(null); setDefinition(null); setYoutubeModal(null); }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [flipPage]);

  // ===== TEXT SELECTION =====
  useEffect(() => {
    function handleMouseUp(e) {
      setTimeout(() => {
        const selection = window.getSelection();
        const text = selection?.toString()?.trim();
        if (text && text.length > 0 && bookRef.current?.contains(selection?.anchorNode)) {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          setSelectionPopup({ text, x: rect.left + rect.width / 2, y: rect.top - 10 });
        } else if (!e.target.closest('.selection-popup') && !e.target.closest('.definition-panel')) {
          setSelectionPopup(null);
        }
      }, 50);
    }
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, []);

  function handleCopy() {
    navigator.clipboard.writeText(selectionPopup.text);
    showToast('Copied to clipboard! 📋');
    setSelectionPopup(null);
    window.getSelection()?.removeAllRanges();
  }

  function handleSearchGoogle() {
    window.open(`https://www.google.com/search?q=${encodeURIComponent(selectionPopup.text)}`, '_blank');
    setSelectionPopup(null);
  }

  function handleHighlight() {
    setHighlights(prev => [...prev, {
      id: Date.now(),
      text: selectionPopup.text,
      page: leftPage,
      createdAt: new Date().toISOString(),
    }]);
    showToast('Text highlighted! 🖍️');
    setSelectionPopup(null);
    window.getSelection()?.removeAllRanges();
    // Apply immediately
    setTimeout(applyHighlights, 200);
  }

  function removeHighlight(hId) {
    setHighlights(prev => prev.filter(h => h.id !== hId));
    showToast('Highlight removed');
    setTimeout(applyHighlights, 200);
  }

  async function handleDefine() {
    const word = selectionPopup.text.split(/\s+/)[0];
    setDefinition({ word: selectionPopup.text, meaning: null, loading: true });
    setSelectionPopup(null);
    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
      if (res.ok) {
        const data = await res.json();
        const entry = data[0];
        const meanings = entry.meanings.map(m => ({
          partOfSpeech: m.partOfSpeech,
          definition: m.definitions[0]?.definition,
          example: m.definitions[0]?.example,
        }));
        setDefinition({ word: entry.word, phonetic: entry.phonetic, meanings, loading: false });
      } else {
        setDefinition({ word, meanings: [{ partOfSpeech: '', definition: 'No definition found.' }], loading: false });
      }
    } catch {
      setDefinition({ word, meanings: [{ partOfSpeech: '', definition: 'Could not look up definition.' }], loading: false });
    }
  }

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }

  function handleShare() {
    const url = `${window.location.origin}/modules/${id}`;
    navigator.clipboard.writeText(url).then(() => showToast('Link copied! 🔗')).catch(() => {});
  }

  const pageDisplay = isReader
    ? `${leftPage} / ${readerPageCount || '—'}`
    : isMobile
      ? `${leftPage} / ${numPages}`
      : rightPage && rightPage <= numPages
        ? `${leftPage}–${rightPage} / ${numPages}`
        : `${leftPage} / ${numPages}`;

  if (loading) return (
    <div className="viewer-loading">
      <Loader2 size={32} className="spin" />
      <p>Loading module...</p>
    </div>
  );

  if (error) return (
    <div className="viewer-error">
      <p>{error}</p>
      <button className="btn btn--ghost" onClick={() => navigate('/modules')}>Back to Modules</button>
    </div>
  );

  return (
    <div className="viewer-page" data-module-theme={theme}>
      {/* Toolbar */}
      <div className="viewer-toolbar">
        <div className="viewer-toolbar__left">
          <button className="icon-btn" onClick={() => navigate(`/modules/${id}`)} title="Back">
            <ArrowLeft size={18} />
          </button>
          <div className="viewer-toolbar__title">
            <h2>{moduleData?.title}</h2>
            <span>{moduleData?.file_name}</span>
          </div>
        </div>

        <div className="viewer-toolbar__center">
          <span className="viewer-toolbar__page"><BookOpen size={14} /> {pageDisplay}</span>
        </div>

        <div className="viewer-toolbar__right">
          <button className="icon-btn" onClick={() => setScale(s => Math.max(0.4, s - 0.1))}><ZoomOut size={16} /></button>
          <span className="viewer-toolbar__zoom">{Math.round(scale * 100)}%</span>
          <button className="icon-btn" onClick={() => setScale(s => Math.min(2, s + 0.1))}><ZoomIn size={16} /></button>

          {highlights.length > 0 && (
            <span className="viewer-toolbar__highlights" title={`${highlights.length} highlights`}>
              <Highlighter size={14} /> {highlights.length}
            </span>
          )}

          {hasReader && (
            <button
              className={`icon-btn ${viewMode === 'reader' ? 'icon-btn--active' : ''}`}
              onClick={() => setViewMode((m) => (m === 'pdf' ? 'reader' : 'pdf'))}
              title={viewMode === 'pdf' ? 'Switch to Reader view' : 'Switch to PDF view'}
              aria-pressed={viewMode === 'reader'}
            >
              {viewMode === 'pdf' ? <BookText size={16} /> : <FileText size={16} />}
            </button>
          )}

          <button
            className={`icon-btn ${theme !== 'none' ? 'icon-btn--active' : ''}`}
            onClick={() => setThemePickerOpen((v) => !v)}
            title="Reading theme"
            aria-expanded={themePickerOpen}
          >
            <Palette size={16} />
          </button>

          <button className="btn btn--ghost btn--sm hide-sm" onClick={handleShare}>
            <Share2 size={14} /> Share
          </button>
          <button className="btn btn--primary btn--sm" onClick={() => navigate(`/create?moduleId=${id}`)}>
            <Sparkles size={14} /> <span className="hide-sm">Generate Quiz</span>
          </button>
        </div>
      </div>

      {/* ===== THEME PICKER ===== */}
      {themePickerOpen && (
        <div className="theme-picker" role="menu">
          <div className="theme-picker__header">
            <span className="theme-picker__title">Reading Theme</span>
            <span className="theme-picker__hint">Visual only — your PDF stays untouched.</span>
          </div>
          <div className="theme-picker__grid">
            {MODULE_THEMES.map((t) => (
              <button
                key={t.id}
                role="menuitem"
                className={`theme-card theme-card--${t.id} ${theme === t.id ? 'theme-card--active' : ''}`}
                onClick={() => { setTheme(t.id); setThemePickerOpen(false); }}
              >
                <span className="theme-card__swatch" aria-hidden="true">
                  {/* Tiny preview slab. Real visual treatment lives in CSS via
                      [data-module-theme] selectors on the viewer root. */}
                </span>
                <span className="theme-card__name">
                  {t.label}
                  {theme === t.id && <Check size={12} className="theme-card__check" />}
                </span>
                <span className="theme-card__desc">{t.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Book body */}
      <div className="viewer-body">
        <button className={`book-arrow book-arrow--left ${!canGoBack ? 'book-arrow--disabled' : ''}`}
          onClick={() => flipPage('prev')} disabled={!canGoBack}>
          <ChevronLeft size={28} />
        </button>

        {isReader ? (
          <ReaderView
            pages={readerData?.pages || []}
            currentPage={leftPage}
            loading={readerLoading}
          />
        ) : (
        <div className={`book ${flipping ? `book--flip-${flipping}` : ''}`} ref={bookRef}>
          {pdfUrl && (
            <Document file={pdfUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={(err) => setError(`PDF load error: ${err.message}`)}
              loading={<div className="viewer-page-loading"><Loader2 size={24} className="spin" /></div>}
            >
              <div className="book-spread">
                <div className={`book-page book-page--left ${isMobile ? 'book-page--single' : ''}`}>
                  {leftPage <= numPages ? (
                    <Page pageNumber={leftPage} scale={scale}
                      width={pageDims.width}
                      height={pageDims.height}
                      renderTextLayer={true} renderAnnotationLayer={true}
                      onRenderSuccess={() => setTimeout(applyHighlights, 100)}
                      loading={<div className="viewer-page-loading"><Loader2 size={20} className="spin" /></div>}
                    />
                  ) : <div className="book-page__empty" />}
                  <div className="book-page__number">{leftPage}</div>
                </div>

                {!isMobile && <div className="book-spine" />}

                {!isMobile && (
                  <div className="book-page book-page--right">
                    {rightPage && rightPage <= numPages ? (
                      <Page pageNumber={rightPage} scale={scale}
                        width={pageDims.width}
                        height={pageDims.height}
                        renderTextLayer={true} renderAnnotationLayer={true}
                        onRenderSuccess={() => setTimeout(applyHighlights, 100)}
                        loading={<div className="viewer-page-loading"><Loader2 size={20} className="spin" /></div>}
                      />
                    ) : (
                      <div className="book-page__empty"><p>End of module</p></div>
                    )}
                    {rightPage && rightPage <= numPages && (
                      <div className="book-page__number">{rightPage}</div>
                    )}
                  </div>
                )}
              </div>
            </Document>
          )}
        </div>
        )}

        <button className={`book-arrow book-arrow--right ${!canGoForward ? 'book-arrow--disabled' : ''}`}
          onClick={() => flipPage('next')} disabled={!canGoForward}>
          <ChevronRight size={28} />
        </button>
      </div>

      {/* Page dots — show whenever there are spreads to navigate. In
          PDF mode this comes from the loaded PDF (numPages); in reader
          mode it comes from the reader's parsed page count. Either
          way we cap at 30 dots to keep the UI manageable; longer
          documents fall back to the textual indicator in the toolbar. */}
      {totalSpreads > 1 && totalSpreads <= 30 && (
        <div className="book-pagination">
          {Array.from({ length: totalSpreads }, (_, i) => (
            <button key={i} className={`book-dot ${currentSpread === i ? 'book-dot--active' : ''}`}
              onClick={() => setCurrentSpread(i)} />
          ))}
        </div>
      )}

      {/* ===== SELECTION POPUP ===== */}
      {selectionPopup && (
        <div className="selection-popup" style={{ left: selectionPopup.x, top: selectionPopup.y }}>
          <button className="selection-popup__btn" onClick={handleCopy}><Copy size={14} /> Copy</button>
          <button className="selection-popup__btn" onClick={handleDefine}><BookMarked size={14} /> Define</button>
          <button className="selection-popup__btn" onClick={handleSearchGoogle}><Search size={14} /> Search</button>
          <button className="selection-popup__btn selection-popup__btn--highlight" onClick={handleHighlight}>
            <Highlighter size={14} /> Highlight
          </button>
        </div>
      )}

      {/* ===== DEFINITION PANEL ===== */}
      {definition && (
        <div className="definition-panel">
          <div className="definition-panel__header">
            <h3>{definition.word}</h3>
            {definition.phonetic && <span className="definition-panel__phonetic">{definition.phonetic}</span>}
            <button className="definition-panel__close" onClick={() => setDefinition(null)}><X size={16} /></button>
          </div>
          {definition.loading ? (
            <div className="definition-panel__loading"><Loader2 size={16} className="spin" /> Looking up...</div>
          ) : (
            <div className="definition-panel__body">
              {definition.meanings?.map((m, i) => (
                <div key={i} className="definition-panel__meaning">
                  {m.partOfSpeech && <span className="definition-panel__pos">{m.partOfSpeech}</span>}
                  <p>{m.definition}</p>
                  {m.example && <p className="definition-panel__example">"{m.example}"</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== VIDEO MODAL ===== */}
      {youtubeModal && (
        <div className="youtube-overlay" onClick={() => setYoutubeModal(null)}>
          <div className="youtube-modal" onClick={e => e.stopPropagation()}>
            <button className="youtube-modal__close" onClick={() => setYoutubeModal(null)}>
              <X size={20} />
            </button>
            <div className="youtube-modal__player">
              {youtubeModal.type === 'direct' ? (
                <video src={youtubeModal.src} controls autoPlay style={{ width: '100%', height: '100%' }} />
              ) : (
                <iframe
                  src={youtubeModal.src}
                  title="Video Player"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  onError={() => window.open(youtubeModal.title, '_blank')}
                />
              )}
            </div>
            <a href={youtubeModal.title} target="_blank" rel="noopener" className="youtube-modal__fallback">
              Open on YouTube ↗
            </a>
          </div>
        </div>
      )}

      {/* ===== TOAST ===== */}
      {toast && <div className="viewer-toast">{toast}</div>}
    </div>
  );
}
