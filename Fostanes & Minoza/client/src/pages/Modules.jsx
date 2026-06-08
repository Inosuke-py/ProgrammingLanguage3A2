import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Upload, BookOpen, Globe, Lock, Loader2, Search, SlidersHorizontal } from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
import { modules as modulesApi } from '../services/api';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import './Modules.css';
import '../components/shared/pdfWorker';

// Thumbnail component — renders page 1 of a PDF
function PdfThumbnail({ moduleId }) {
  const [loaded, setLoaded] = useState(false);
  const url = modulesApi.getFileUrl(moduleId);

  return (
    <div className="module-card__thumb">
      <Document file={url} onLoadSuccess={() => setLoaded(true)}
        loading={<div className="thumb-loading" />} error={<div className="thumb-loading" />}>
        <Page pageNumber={1} width={200}
          renderTextLayer={false} renderAnnotationLayer={false}
          loading={<div className="thumb-loading" />} />
      </Document>
      {!loaded && <div className="thumb-loading" />}
    </div>
  );
}

const SORT_OPTIONS = [
  { id: 'newest', label: 'Newest First' },
  { id: 'oldest', label: 'Oldest First' },
  { id: 'name-az', label: 'Name A–Z' },
  { id: 'name-za', label: 'Name Z–A' },
  { id: 'pages', label: 'Most Pages' },
];

export default function Modules() {
  const navigate = useNavigate();
  const [myModules, setMyModules] = useState([]);
  const [publicModules, setPublicModules] = useState([]);
  const [activeTab, setActiveTab] = useState('mine');
  const [uploading, setUploading] = useState(false);
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [loading, setLoading] = useState(true);

  // Search & filter state
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('newest');

  // Track the upload progress interval so we can cancel it on unmount.
  // Without this, a user navigating away mid-upload leaves a 120ms-ticking
  // interval running that calls setUploadProgress on an unmounted component.
  const uploadTickRef = useRef(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const [mine, pub] = await Promise.allSettled([
          modulesApi.list(),
          modulesApi.listPublic(),
        ]);
        if (!alive) return;
        if (mine.status === 'fulfilled') setMyModules(mine.value.data?.modules || []);
        if (pub.status === 'fulfilled') setPublicModules(pub.value.data?.modules || []);
      } catch (err) { console.error(err); }
      finally { if (alive) setLoading(false); }
    }
    load();
    return () => { alive = false; };
  }, []);

  // Clean up the upload progress interval if the component unmounts mid-upload.
  useEffect(() => {
    return () => {
      if (uploadTickRef.current) {
        clearInterval(uploadTickRef.current);
        uploadTickRef.current = null;
      }
    };
  }, []);

  // Callable refresh after upload completes — the caller awaits this from a
  // click handler on a still-mounted component, so we don't need an alive
  // guard here.
  async function loadModules() {
    try {
      const [mine, pub] = await Promise.allSettled([
        modulesApi.list(),
        modulesApi.listPublic(),
      ]);
      if (mine.status === 'fulfilled') setMyModules(mine.value.data?.modules || []);
      if (pub.status === 'fulfilled') setPublicModules(pub.value.data?.modules || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadFileName(file.name);
    setUploadProgress(0);

    // Smooth fake-progress: ramp 0 → 88% over an estimated duration based on file size.
    // Server-side processing (text + image extraction) happens during the request, so
    // we don't get real progress events. The bar caps at 88% until the response lands,
    // then snaps to 100%.
    const fileSizeMB = file.size / (1024 * 1024);
    const estimatedMs = Math.max(4000, Math.min(20000, fileSizeMB * 1500)); // 4-20s heuristic
    const startedAt = Date.now();
    if (uploadTickRef.current) clearInterval(uploadTickRef.current);
    uploadTickRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const linear = Math.min(0.88, elapsed / estimatedMs * 0.88);
      // ease-out so it slows as it approaches 88%
      const eased = 1 - Math.pow(1 - linear, 2);
      setUploadProgress(Math.round(eased * 100));
    }, 120);

    try {
      await modulesApi.upload(file);
      clearInterval(uploadTickRef.current);
      uploadTickRef.current = null;
      setUploadProgress(100);
      // Brief moment so the user sees the "100%" state before the new card appears
      await new Promise((r) => setTimeout(r, 350));
      await loadModules();
    } catch (err) {
      clearInterval(uploadTickRef.current);
      uploadTickRef.current = null;
      alert(err.message);
    } finally {
      setUploading(false);
      setUploadFileName('');
      setUploadProgress(0);
      e.target.value = '';
    }
  }

  // Filtered + sorted list
  const displayList = useMemo(() => {
    const raw = activeTab === 'mine' ? myModules : publicModules;

    // Filter by search
    let filtered = raw;
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = raw.filter(m =>
        m.title?.toLowerCase().includes(q) ||
        m.file_name?.toLowerCase().includes(q)
      );
    }

    // Sort
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'oldest': return new Date(a.created_at) - new Date(b.created_at);
        case 'name-az': return (a.title || '').localeCompare(b.title || '');
        case 'name-za': return (b.title || '').localeCompare(a.title || '');
        case 'pages': return (b.page_count || 0) - (a.page_count || 0);
        default: return new Date(b.created_at) - new Date(a.created_at);
      }
    });

    return sorted;
  }, [activeTab, myModules, publicModules, search, sortBy]);

  return (
    <div className="modules-page">
      <div className="container">
        <motion.div className="modules-header"
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <div>
            <span className="label">Library</span>
            <h1 className="modules-title text-serif">Lesson Modules</h1>
          </div>
          <div className="modules-header__actions">
            <label className={`btn btn--primary ${uploading ? 'btn--loading' : ''}`}>
              {uploading ? <><Loader2 size={16} className="spin" /> Uploading...</>
                : <><Upload size={16} /> Upload Module</>}
              <input type="file" accept=".pdf" onChange={handleUpload} hidden disabled={uploading} />
            </label>
          </div>
        </motion.div>

        <div className="modules-tabs">
          <button className={`modules-tab ${activeTab === 'mine' ? 'modules-tab--active' : ''}`}
            onClick={() => setActiveTab('mine')}>My Modules</button>
          <button className={`modules-tab ${activeTab === 'public' ? 'modules-tab--active' : ''}`}
            onClick={() => setActiveTab('public')}>Public Library</button>
        </div>

        {/* Search & Sort Bar */}
        <div className="modules-filter-bar">
          <div className="modules-search">
            <Search size={16} className="modules-search__icon" />
            <input
              type="text"
              className="modules-search__input"
              placeholder="Search modules..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="modules-sort">
            <SlidersHorizontal size={14} />
            <select
              className="modules-sort__select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              {SORT_OPTIONS.map(s => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="modules-grid">
          {/* Upload-in-progress card — drops in as the first grid item so the user
              sees their upload as a tangible "module being made". Matches the
              .module-card silhouette so it visually slots into the grid. */}
          {uploading && (
            <div className="module-card module-card--uploading" aria-live="polite">
              <div className="module-card__cover module-card__cover--uploading">
                <div className="upload-card__shimmer" aria-hidden="true" />
                <div className="upload-card__icon">
                  <Loader2 size={28} className="spin" strokeWidth={1.5} />
                </div>
              </div>
              <div className="module-card__body">
                <div className="upload-card__label">
                  {uploadProgress < 100 ? 'Uploading & processing' : 'Done — finishing up'}
                </div>
                <div className="upload-card__filename" title={uploadFileName}>
                  {uploadFileName || 'Module'}
                </div>
                <div className="upload-card__bar" role="progressbar"
                  aria-valuenow={uploadProgress} aria-valuemin={0} aria-valuemax={100}>
                  <div className="upload-card__bar-fill" style={{ width: `${uploadProgress}%` }} />
                </div>
                <div className="upload-card__hint">
                  {uploadProgress < 50
                    ? 'Saving your file...'
                    : uploadProgress < 88
                    ? 'Extracting text content...'
                    : uploadProgress < 100
                    ? 'Rendering images for reader mode...'
                    : 'Almost there...'}
                </div>
              </div>
            </div>
          )}

          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 240, borderRadius: 12 }} />
            ))
          ) : displayList.length === 0 ? (
            <div className="modules-empty">
              <BookOpen size={40} strokeWidth={1} />
              <p>
                {search.trim()
                  ? `No modules matching "${search}"`
                  : activeTab === 'mine' ? 'No modules yet. Upload your first PDF!' : 'No public modules available.'}
              </p>
            </div>
          ) : (
            displayList.map((mod) => (
              <motion.div key={mod.id} className="module-card"
                onClick={() => navigate(`/modules/${mod.id}`)}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ y: -4, boxShadow: '0 8px 30px rgba(0,0,0,0.3)' }}
                transition={{ duration: 0.25 }}>
                <div className="module-card__cover">
                  <PdfThumbnail moduleId={mod.id} />
                  <span className="module-card__pages">{mod.page_count || '—'} pg</span>
                </div>
                <div className="module-card__body">
                  <h4 className="module-card__title">{mod.title}</h4>
                  <span className="module-card__file">{mod.file_name}</span>
                  <div className="module-card__footer">
                    <span className="module-card__date">
                      {new Date(mod.created_at).toLocaleDateString()}
                    </span>
                    <span className={`module-card__vis ${mod.is_public ? 'module-card__vis--public' : ''}`}>
                      {mod.is_public ? <><Globe size={11} /> Public</> : <><Lock size={11} /> Private</>}
                    </span>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
