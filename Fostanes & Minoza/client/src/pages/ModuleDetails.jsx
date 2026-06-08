import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Eye, Sparkles, Globe, Lock, Trash2, Pencil,
  FileText, Loader2
} from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
import { modules as modulesApi } from '../services/api';
import useAuthStore from '../store/useAuthStore';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import './ModuleDetails.css';
import '../components/shared/pdfWorker';

export default function ModuleDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [mod, setMod] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const res = await modulesApi.get(id);
        setMod(res.data.module);
        setEditTitle(res.data.module.title);
      } catch (err) { setError(err.message); }
      finally { setLoading(false); }
    }
    load();
  }, [id]);

  async function handleTogglePublic() {
    try {
      const res = await modulesApi.update(id, { isPublic: !mod.is_public });
      setMod({ ...mod, is_public: !mod.is_public });
    } catch (err) { alert(err.message); }
  }

  async function handleSaveTitle() {
    if (!editTitle.trim()) return;
    try {
      await modulesApi.update(id, { title: editTitle.trim() });
      setMod({ ...mod, title: editTitle.trim() });
      setEditing(false);
    } catch (err) { alert(err.message); }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${mod.title}"? This cannot be undone.`)) return;
    try {
      await modulesApi.delete(id);
      navigate('/modules');
    } catch (err) { alert(err.message); }
  }

  if (loading) {
    return (
      <div className="detail-loading">
        <Loader2 size={28} className="spin" />
        <p>Loading module...</p>
      </div>
    );
  }

  if (error || !mod) {
    return (
      <div className="detail-loading">
        <p>{error || 'Module not found'}</p>
        <button className="btn btn--ghost" onClick={() => navigate('/modules')}>Back to Library</button>
      </div>
    );
  }

  return (
    <div className="detail-page">
      <div className="container">
        {/* Back button */}
        <motion.button className="detail-back"
          onClick={() => navigate('/modules')}
          initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>
          <ArrowLeft size={18} /> Back to Library
        </motion.button>

        <div className="detail-layout">
          {/* Left: Book cover */}
          <motion.div className="detail-cover"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}>
            <div className="detail-cover__book">
              <div className="detail-cover__spine" />
              <div className="detail-cover__front">
                <Document file={modulesApi.getFileUrl(id)}
                  loading={<div className="detail-cover__placeholder"><FileText size={48} /><span>Loading...</span></div>}
                  error={<div className="detail-cover__placeholder"><FileText size={48} /><span>PDF</span></div>}>
                  <Page pageNumber={1} height={260}
                    renderTextLayer={false} renderAnnotationLayer={false}
                    loading={<div className="detail-cover__placeholder"><Loader2 size={24} className="spin" /></div>} />
                </Document>
                <span className="detail-cover__pages">{mod.page_count || '—'} pages</span>
              </div>
            </div>
          </motion.div>

          {/* Right: Info */}
          <motion.div className="detail-info"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}>

            {/* Title */}
            {editing ? (
              <div className="detail-edit">
                <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
                  className="detail-edit__input" autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveTitle(); if (e.key === 'Escape') setEditing(false); }} />
                <div className="detail-edit__actions">
                  <button className="btn btn--primary btn--sm" onClick={handleSaveTitle}>Save</button>
                  <button className="btn btn--ghost btn--sm" onClick={() => setEditing(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <h1 className="detail-title text-serif">{mod.title}</h1>
            )}

            {/* Actions */}
            <div className="detail-actions">
              <button className="btn btn--primary btn--lg" onClick={() => navigate(`/modules/${id}/read`)}>
                <Eye size={18} /> Read Module
              </button>
              <button className="btn btn--accent btn--lg" onClick={() => navigate(`/create?moduleId=${id}`)}>
                <Sparkles size={18} /> Generate Quiz
              </button>
            </div>

            {/* Metadata */}
            <div className="detail-meta">
              <div className="detail-meta__row">
                <span className="detail-meta__label">File name</span>
                <span className="detail-meta__value">{mod.file_name}</span>
              </div>
              <div className="detail-meta__row">
                <span className="detail-meta__label">Pages</span>
                <span className="detail-meta__value">{mod.page_count || '—'}</span>
              </div>
              <div className="detail-meta__row">
                <span className="detail-meta__label">Uploaded</span>
                <span className="detail-meta__value">{new Date(mod.created_at).toLocaleDateString()}</span>
              </div>
              <div className="detail-meta__row">
                <span className="detail-meta__label">Visibility</span>
                <span className={`detail-meta__value ${mod.is_public ? 'detail-meta__value--green' : ''}`}>
                  {mod.is_public ? '🌐 Public' : '🔒 Private'}
                </span>
              </div>
            </div>

            {/* Management — owner only */}
            {user?.id === mod.user_id && (
            <div className="detail-manage">
              <button className="btn btn--ghost" onClick={handleTogglePublic}>
                {mod.is_public ? <><Lock size={15} /> Make Private</> : <><Globe size={15} /> Make Public</>}
              </button>
              <button className="btn btn--ghost" onClick={() => { setEditing(true); setEditTitle(mod.title); }}>
                <Pencil size={15} /> Rename
              </button>
              <button className="btn btn--ghost btn--danger" onClick={handleDelete}>
                <Trash2 size={15} /> Delete
              </button>
            </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
