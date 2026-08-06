import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useToastStore } from '../../store/toastStore';
import { axiosClient } from '../../api/axiosClient';
import { Lock, Mail, ArrowRight } from 'lucide-react';
import { Input } from '../../components/ui/Input';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { setAuth, isAuthenticated, user } = useAuthStore();
  const { addToast } = useToastStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      redirectByRole(user.role);
    }
  }, [isAuthenticated, user]);

  const redirectByRole = (role: string) => {
    switch (role) {
      case 'OWNER': navigate('/owner'); break;
      case 'MANAGER': navigate('/manager'); break;
      case 'CASHIER': navigate('/cashier'); break;
      default: navigate('/login'); break;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setIsLoading(true);
    setErrorMsg('');

    try {
      const res = await axiosClient.post('/auth/login', { email, password });
      const { user: authUser, accessToken, refreshToken } = res.data;

      setAuth(authUser, accessToken, refreshToken);
      addToast({ type: 'success', title: `Welcome back, ${authUser.name}!` });
      redirectByRole(authUser.role);
    } catch (err: any) {
      const data = err.response?.data;
      setErrorMsg(data?.error || 'Invalid email or password.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-surface-gradient relative flex flex-col items-center justify-center p-6 overflow-hidden">
      {/* Decorative top accent line */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
      <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />

      <div className="relative z-10 w-full max-w-md animate-fade-in">
        {/* Brand mark */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2.5 mb-5">
            <span className="h-px w-10 bg-gradient-to-r from-transparent to-primary/60" />
            <span className="text-[10px] font-mono font-semibold uppercase tracking-[0.3em] text-primary">
              Management System
            </span>
            <span className="h-px w-10 bg-gradient-to-l from-transparent to-primary/60" />
          </div>
          <h1 className="text-5xl font-display font-semibold text-foreground tracking-tight leading-none">
            CMS
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Sign in to your staff dashboard
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-border bg-card/80 backdrop-blur-sm shadow-2xl shadow-black/40 p-7 relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

          <form onSubmit={handleSubmit} className="space-y-5">
            {errorMsg && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive animate-slide-in-from-top-2"
              >
                <Lock className="w-4 h-4 mt-0.5 shrink-0" />
                <p className="font-medium leading-snug">{errorMsg}</p>
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Email Address
              </label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                leftIcon={<Mail className="h-4 w-4" />}
                autoComplete="email"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Password
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                leftIcon={<Lock className="h-4 w-4" />}
                autoComplete="current-password"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || !email || !password}
              className="group relative w-full inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl text-sm font-semibold text-primary-foreground bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 shadow-lg shadow-primary/25 hover:shadow-primary/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none transition-all duration-200 active:scale-[0.98]"
            >
              {isLoading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  Signing in…
                </span>
              ) : (
                <>
                  Sign In
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Need help signing in? <span className="text-primary">Contact your manager</span>
        </p>
      </div>

      {/* Footer */}
      <p className="absolute bottom-4 inset-x-0 text-center text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60">
        CMS · v1.0
      </p>
    </div>
  );
};
