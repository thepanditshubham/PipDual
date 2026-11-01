import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth/auth-form';

export const metadata: Metadata = {
  title: 'Create account | Pip Duel',
  description:
    'Open a Pip Duel account — Free tables, four entries per duel, coins only when you take a Paid table.',
};

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <AuthForm initialMode="signup" />
    </Suspense>
  );
}
