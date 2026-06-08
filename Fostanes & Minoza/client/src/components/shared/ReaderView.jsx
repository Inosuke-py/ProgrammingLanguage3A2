import { useState } from 'react';
import { Loader2, ImageIcon } from 'lucide-react';
import { resolveApiUrl } from '../../services/api';
import './ReaderView.css';

/**
 * ReaderView
 * --------------------------------------------------------------
 * Renders one page of a module's extracted reader content as a
 * single-column, scrollable, Wattpad-style chapter. Themed via the
 * parent's `[data-module-theme="<id>"]` attribute — no logic here
 * cares about the theme, only the surrounding CSS does.
 *
 * Phase 2 scope:
 *   • Heading / paragraph / list blocks render as semantic HTML.
 *   • Image blocks render as a bordered placeholder showing the
 *     reported dimensions. Real image bytes ship in phase 3.
 *
 * Props:
 *   pages       — array of { pageNumber, blocks[] }
 *   currentPage — 1-indexed page to display
 *   loading     — boolean, show a spinner if true
 */
export default function ReaderView({ pages = [], currentPage = 1, loading = false }) {
  if (loading) {
    return (
      <div className="reader-view-container">
        <div className="reader-view reader-view--state">
          <Loader2 size={28} className="spin" />
          <p>Loading reader content...</p>
        </div>
      </div>
    );
  }

  if (!pages || pages.length === 0) {
    return (
      <div className="reader-view-container">
        <div className="reader-view reader-view--state">
          <p>No reader content for this module yet.</p>
        </div>
      </div>
    );
  }

  // Find page by pageNumber, fall back to index lookup, then to first page.
  const page =
    pages.find((p) => p.pageNumber === currentPage) ||
    pages[currentPage - 1] ||
    pages[0];

  const totalPages = pages.length;

  return (
    <div className="reader-view-container">
      <article className="reader-view">
        {(page?.blocks || []).map((block, idx) => (
          <ReaderBlock key={idx} block={block} />
        ))}
        <div className="reader-view__page-indicator">
          Page {page?.pageNumber ?? currentPage} of {totalPages}
        </div>
      </article>
    </div>
  );
}

function ReaderBlock({ block }) {
  if (!block || !block.type) return null;

  switch (block.type) {
    case 'heading': {
      const level = Math.min(Math.max(block.level || 1, 1), 3);
      const text = block.text || '';
      if (level === 1) return <h1 className="reader-view__h1">{text}</h1>;
      if (level === 2) return <h2 className="reader-view__h2">{text}</h2>;
      return <h3 className="reader-view__h3">{text}</h3>;
    }

    case 'paragraph': {
      const text = (block.text || '').trim();
      if (!text) {
        // Empty paragraph -> visible vertical spacing, no <p>&nbsp;</p>.
        return <div className="reader-view__spacer" aria-hidden="true" />;
      }
      return <p className="reader-view__p">{block.text}</p>;
    }

    case 'list': {
      const items = Array.isArray(block.items) ? block.items : [];
      if (block.ordered) {
        return (
          <ol className="reader-view__ol">
            {items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ol>
        );
      }
      return (
        <ul className="reader-view__ul">
          {items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      );
    }

    case 'image': {
      return <ReaderImage block={block} />;
    }

    default:
      return null;
  }
}

/**
 * Phase 3: real image rendering.
 *
 * If the block has a `src` (populated by the server's image renderer), show the
 * actual image. On load failure we fall back to the legacy placeholder so the
 * reader never shows a broken-image icon. Blocks without `src` (legacy modules
 * that haven't been backfilled yet) also use the placeholder.
 */
function ReaderImage({ block }) {
  const [failed, setFailed] = useState(false);
  const w = Math.max(1, Number(block.width) || 0);
  const h = Math.max(1, Number(block.height) || 0);
  const maxBoxWidth = 'min(100%, ' + (w || 720) + 'px)';
  const aspect = w && h ? `${w} / ${h}` : 'auto';

  if (block.src && !failed) {
    return (
      <figure className="reader-image" style={{ maxWidth: maxBoxWidth }}>
        <img
          src={resolveApiUrl(block.src)}
          alt=""
          loading="lazy"
          style={{ aspectRatio: aspect }}
          onError={() => setFailed(true)}
        />
      </figure>
    );
  }

  // Fallback / legacy placeholder.
  return (
    <figure className="reader-image-placeholder" style={{ width: maxBoxWidth }}>
      <div
        className="reader-image-placeholder__box"
        style={{ aspectRatio: aspect, maxHeight: '480px' }}
      >
        <ImageIcon size={32} aria-hidden="true" />
      </div>
      <figcaption className="reader-image-placeholder__caption">
        Image ({w}×{h}) — view in PDF mode
      </figcaption>
    </figure>
  );
}
