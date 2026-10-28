'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/store';
import { useTheme } from '@/components/theme-provider';
import { sound } from '@/components/terminal/sound';
import {
  Settings, User, Palette, Globe, Volume2, Trash2,
  CheckCircle2, AlertTriangle, Moon, Sun, Monitor,
} from 'lucide-react';

export default function SettingsPage() {
  const router = useRouter();
  const { user, updateProfile, logout } = useAuthStore();
  const { theme, setTheme } = useTheme();

  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [language, setLanguage] = useState('en');
  const [soundSetting, setSoundSetting] = useState(sound.enabled);
  const [saved, setSaved] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile({ displayName });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleToggleSound = () => {
    const next = !soundSetting;
    setSoundSetting(next);
    sound.setEnabled(next);
  };

  const handleDeleteAccount = () => {
    logout();
    if (typeof window !== 'undefined') {
      localStorage.removeItem('pip-duel-auth-storage');
      localStorage.removeItem('pip_duel_guest_id');
    }
    router.push('/');
  };

  return (
    <div className="max-w-4xl mx-auto px-5 py-14 space-y-6">
      {/* Page header */}
      <div className="space-y-1 mb-10">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              background: 'rgba(231,70,148,0.1)',
              border: '1px solid rgba(231,70,148,0.2)',
              color: 'var(--pink)',
            }}
          >
            <Settings size={20} />
          </div>
          <h1 className="text-3xl font-bold">Settings</h1>
        </div>
        <p className="text-sm pl-[52px]" style={{ color: 'var(--text-secondary)' }}>
          Manage your terminal preferences, display identity, and security.
        </p>
      </div>

      {/* Success banner */}
      {saved && (
        <div
          className="p-4 rounded-xl flex items-center gap-3 animate-fade-in text-sm font-medium"
          style={{
            background: 'color-mix(in srgb, var(--green) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--green-soft) 25%, transparent)',
            color: 'var(--green-soft)',
          }}
        >
          <CheckCircle2 size={18} />
          Preferences successfully updated.
        </div>
      )}

      {/* Profile Details */}
      <SettingsCard
        icon={<User size={18} />}
        title="Trader Identity"
        iconColor="var(--purple-light)"
        iconBg="rgba(146,98,249,0.1)"
        iconBorder="rgba(146,98,249,0.2)"
      >
        <form onSubmit={handleSaveProfile} className="space-y-5 max-w-md">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text-secondary)' }}>
              Display Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-4 py-2.5 text-sm rounded-xl"
              style={{
                background: 'var(--surface-muted)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
              }}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text-secondary)' }}>
              Username (Immutable)
            </label>
            <input
              type="text"
              disabled
              value={user?.username || ''}
              className="w-full px-4 py-2.5 text-sm rounded-xl cursor-not-allowed"
              style={{
                background: 'var(--surface-muted)',
                border: '1px solid var(--border)',
                color: 'var(--text-muted)',
                opacity: 0.7,
              }}
            />
          </div>

          <button type="submit" className="btn-primary text-sm px-6 py-2.5">
            Save Profile
          </button>
        </form>
      </SettingsCard>

      {/* Theme */}
      <SettingsCard
        icon={<Palette size={18} />}
        title="Theme & Appearance"
        iconColor="var(--pink)"
        iconBg="rgba(231,70,148,0.1)"
        iconBorder="rgba(231,70,148,0.2)"
      >
        <div className="grid sm:grid-cols-3 gap-3 max-w-lg">
          {[
            { id: 'dark', label: 'Tactical Dark', icon: <Moon size={14} /> },
            { id: 'light', label: 'Daylight Mode', icon: <Sun size={14} /> },
            { id: 'system', label: 'Follow System', icon: <Monitor size={14} /> },
          ].map((t) => {
            const isActive = theme === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTheme(t.id as 'dark' | 'light' | 'system')}
                className="flex items-center justify-center gap-2 p-3 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all"
                style={
                  isActive
                    ? {
                        background:
                          'linear-gradient(138.51deg, color-mix(in srgb, var(--green-start) 14%, transparent) 3.04%, color-mix(in srgb, var(--green-soft) 14%, transparent) 97.61%)',
                        border: '1px solid color-mix(in srgb, var(--green-soft) 25%, transparent)',
                        color: 'var(--green-soft)',
                        boxShadow: '0 0 12px color-mix(in srgb, var(--green-start) 15%, transparent)',
                      }
                    : {
                        background: 'var(--surface-muted)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-secondary)',
                      }
                }
              >
                {t.icon}
                {t.label}
              </button>
            );
          })}
        </div>
      </SettingsCard>

      {/* Language */}
      <SettingsCard
        icon={<Globe size={18} />}
        title="Language / भाषा"
        iconColor="var(--purple-light)"
        iconBg="rgba(172,148,250,0.1)"
        iconBorder="rgba(172,148,250,0.2)"
      >
        <div className="grid sm:grid-cols-3 gap-3 max-w-lg">
          {[
            { id: 'en', label: 'English (Default)' },
            { id: 'hi', label: 'हिन्दी (Hindi)' },
            { id: 'mr', label: 'मराठी (Marathi)' },
          ].map((lang) => {
            const isActive = language === lang.id;
            return (
              <button
                key={lang.id}
                onClick={() => setLanguage(lang.id)}
                className="p-3 rounded-xl text-xs font-semibold tracking-wide text-center transition-all"
                style={
                  isActive
                    ? {
                        background:
                          'linear-gradient(138.51deg, color-mix(in srgb, var(--green-start) 14%, transparent) 3.04%, color-mix(in srgb, var(--green-soft) 14%, transparent) 97.61%)',
                        border: '1px solid color-mix(in srgb, var(--green-soft) 25%, transparent)',
                        color: 'var(--green-soft)',
                        boxShadow: '0 0 12px color-mix(in srgb, var(--green-start) 15%, transparent)',
                      }
                    : {
                        background: 'var(--surface-muted)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-secondary)',
                      }
                }
              >
                {lang.label}
              </button>
            );
          })}
        </div>
      </SettingsCard>

      {/* Terminal Audio */}
      <SettingsCard
        icon={<Volume2 size={18} />}
        title="Audio Synthesizer"
        iconColor="var(--green-soft)"
        iconBg="rgba(5,122,85,0.12)"
        iconBorder="rgba(132,225,188,0.2)"
      >
        <div
          className="flex items-center justify-between max-w-md p-4 rounded-xl"
          style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}
        >
          <div>
            <div className="font-semibold text-sm mb-0.5">Trading Floor Sound FX</div>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Auditory cues for order fills, SL/TP triggers, and match settlements
            </p>
          </div>
          <button
            onClick={handleToggleSound}
            className="ml-4 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all flex-shrink-0"
            style={
              soundSetting
                ? {
                    background: 'linear-gradient(315deg, var(--green-start) 0%, var(--green-end) 100%)',
                    color: '#fff',
                  }
                : {
                    background: 'var(--border)',
                    color: 'var(--text-muted)',
                  }
            }
          >
            {soundSetting ? 'Enabled' : 'Muted'}
          </button>
        </div>
      </SettingsCard>

      {/* Danger Zone */}
      <div
        className="rounded-2xl p-6 space-y-4"
        style={{
          background: 'color-mix(in srgb, var(--down) 4%, transparent)',
          border: '1px solid color-mix(in srgb, var(--down) 20%, transparent)',
        }}
      >
        <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--down)' }}>
          <Trash2 size={18} /> Danger Zone
        </h2>
        <p className="text-xs leading-relaxed max-w-lg" style={{ color: 'var(--text-secondary)' }}>
          Permanently purge your account, match records, personal metadata, and stored statistics.
          This action is irreversible.
        </p>
        <button
          onClick={() => setShowDeleteModal(true)}
          className="px-5 py-2.5 rounded-full text-sm font-semibold transition-all"
          style={{
            background: 'color-mix(in srgb, var(--down) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--down) 30%, transparent)',
            color: 'var(--down)',
          }}
        >
          Delete Account
        </button>
      </div>

      {/* Delete Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(12px)' }}
        >
          <div
            className="max-w-md w-full p-7 rounded-2xl space-y-5 animate-slide-up"
            style={{
              background: 'var(--surface)',
              border: '1px solid color-mix(in srgb, var(--down) 30%, transparent)',
            }}
          >
            <div className="flex items-center gap-3" style={{ color: 'var(--down)' }}>
              <AlertTriangle size={22} />
              <h3 className="text-xl font-bold">Confirm Account Deletion</h3>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Are you sure you want to permanently delete your account? All match history, ratings,
              and stored preferences will be completely destroyed.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="btn-secondary text-sm px-5 py-2.5"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                className="px-5 py-2.5 rounded-full text-sm font-semibold transition-all"
                style={{
                  background: 'var(--down)',
                  color: '#fff',
                }}
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsCard({
  icon,
  title,
  iconColor,
  iconBg,
  iconBorder,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  iconColor: string;
  iconBg: string;
  iconBorder: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl p-6 space-y-5"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <h2
        className="text-base font-bold flex items-center gap-3"
      >
        <span
          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: iconBg, border: `1px solid ${iconBorder}`, color: iconColor }}
        >
          {icon}
        </span>
        {title}
      </h2>
      {children}
    </div>
  );
}
