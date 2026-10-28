import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth/auth-form';

export const metadata: Metadata = {
  title: 'Log in | Pip Duel',
  description:
    'Sign in to Pip Duel, or switch to the sign-up tab without leaving the page. Free demo tables, coins for Live duels.',
};

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <AuthForm initialMode="login" />
    </Suspense>
  );
}
