import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useToastStore } from '../../store/toastStore';
import { axiosClient } from '../../api/axiosClient';
import { Lock, User, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { setAuth, isAuthenticated, user } = useAuthStore();
  const { addToast } = useToastStore();
  const { t } = useTranslation('auth');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<'username' | 'password' | null>(null);

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
    if (!username || !password) return;

    setIsLoading(true);
    setErrorMsg('');

    try {
      const res = await axiosClient.post('/auth/login', { username, password });
      const { user: authUser, accessToken } = res.data;

      // Restore user's preferred language on login
      if (authUser.preferredLanguage && authUser.preferredLanguage !== i18n.language) {
        await i18n.changeLanguage(authUser.preferredLanguage);
        document.documentElement.lang = authUser.preferredLanguage;
      }

      setAuth(authUser, accessToken);
      addToast({ type: 'success', title: `Welcome back, ${authUser.name}!` });
      redirectByRole(authUser.role);
    } catch (err: any) {
      const errorData = err.response?.data?.error;
      setErrorMsg(
        typeof errorData === 'object' && errorData?.message
          ? errorData.message
          : errorData || t('errors.invalidCredentials')
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Override browser default styles for autofill, invalid, and required states */}
      <style>{`
        .login-input:-webkit-autofill,
        .login-input:-webkit-autofill:hover,
        .login-input:-webkit-autofill:focus,
        .login-input:-webkit-autofill:active {
          -webkit-box-shadow: 0 0 0 30px transparent inset !important;
          -webkit-text-fill-color: hsl(var(--foreground)) !important;
          caret-color: hsl(var(--foreground));
          transition: background-color 5000s ease-in-out 0s;
        }
        .login-input {
          appearance: none;
          -webkit-appearance: none;
          -moz-appearance: none;
        }
        .login-input::-webkit-credentials-auto-fill-button {
          visibility: hidden;
          pointer-events: none;
          position: absolute;
          right: 0;
        }
        .login-input:-moz-ui-invalid {
          box-shadow: none;
          outline: none;
        }
        .login-input:invalid {
          box-shadow: none;
          outline: none;
          border: none;
        }
      `}</style>

      <div className="min-h-screen w-full bg-background flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md animate-fade-in">
          {/* Logo/Brand */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary mb-5">
              <svg
                className="w-7 h-7 text-primary-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">
              {t('title')}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {t('subtitle')}
            </p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-3" noValidate>
            {errorMsg && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-full bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-600"
              >
                <Lock className="w-4 h-4 shrink-0" />
                <p className="font-medium">{errorMsg}</p>
              </div>
            )}

            {/* Email Input */}
            <div
              className={cn(
                'group relative flex items-center w-full rounded-full transition-all duration-200 overflow-hidden',
                focusedField === 'username'
                  ? 'bg-card border-2 border-primary shadow-[0_0_0_4px_hsl(var(--primary)/0.15)]'
                  : 'bg-secondary border-2 border-transparent shadow-none'
              )}
              style={{ borderRadius: '9999px' }}
            >
              <div className="pl-4 pr-3 flex items-center justify-center">
                <User
                  className={cn(
                    'w-5 h-5 transition-colors duration-200',
                    focusedField === 'username' ? 'text-primary' : 'text-muted-foreground'
                  )}
                />
              </div>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onFocus={() => setFocusedField('username')}
                onBlur={() => setFocusedField(null)}
                placeholder={t('username') || 'usermane'}
                autoComplete="off"
                required
                className="login-input flex-1 min-w-0 bg-transparent text-foreground placeholder:text-muted-foreground text-sm h-12 outline-none border-0 focus:outline-none focus:ring-0 focus:border-0 focus:shadow-none overflow-hidden"
              />
              <div className="pr-5 w-2 shrink-0" aria-hidden="true" />
            </div>

            {/* Password Input */}
            <div
              className={cn(
                'group relative flex items-center w-full rounded-full transition-all duration-200 overflow-hidden',
                focusedField === 'password'
                  ? 'bg-card border-2 border-primary shadow-[0_0_0_4px_hsl(var(--primary)/0.15)]'
                  : 'bg-secondary border-2 border-transparent shadow-none'
              )}
              style={{ borderRadius: '9999px' }}
            >
              <div className="pl-4 pr-3 flex items-center justify-center">
                <Lock
                  className={cn(
                    'w-5 h-5 transition-colors duration-200',
                    focusedField === 'password' ? 'text-primary' : 'text-muted-foreground'
                  )}
                />
              </div>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setFocusedField('password')}
                onBlur={() => setFocusedField(null)}
                placeholder={t('fields.password')}
                autoComplete="off"
                required
                className="login-input flex-1 min-w-0 bg-transparent text-foreground placeholder:text-muted-foreground text-sm h-12 outline-none border-0 focus:outline-none focus:ring-0 focus:border-0 focus:shadow-none overflow-hidden"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="pr-4 pl-2 text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center"
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading || !username || !password}
              className={cn(
                'relative w-full flex items-center justify-center gap-2 h-12 rounded-full',
                'bg-primary text-primary-foreground hover:opacity-90 text-sm font-semibold',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'transition-all duration-200 active:scale-[0.98] mt-4'
              )}
              style={{ borderRadius: '9999px' }}
            >
              {isLoading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  {t('actions.signingIn')}
                </span>
              ) : (
                <>
                  {t('actions.signIn')}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </>
  );
};
