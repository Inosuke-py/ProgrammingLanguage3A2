import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import useAuthStore from '../store/useAuthStore';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    const success = params.get('success');
    if (success === 'true') {
      initialize().then(() => {
        const user = useAuthStore.getState().user;
        // Auto-redirect admin users to admin panel
        if (user?.role === 'admin') {
          navigate('/admin', { replace: true });
        } else {
          navigate('/dashboard', { replace: true });
        }
      });
    } else {
      navigate('/?error=auth_failed', { replace: true });
    }
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '1.5rem',
      background: 'var(--color-surface-0)',
      color: 'var(--color-text-primary)',
    }}>
      <BookOpen size={32} style={{ color: 'var(--color-accent)' }} />
      <p className="text-serif" style={{ fontSize: 'var(--text-xl)' }}>
        Authenticating...
      </p>
      <div className="skeleton" style={{ width: 200, height: 4, borderRadius: 999 }} />
    </div>
  );
}
