/**
 * economy — coins in, coins out.
 * Config and maths are pure; the deposit and withdrawal stores are the only
 * stateful pieces, and neither one decides on its own whether money moved.
 */
export * from './config';
export * from './types';
export * from './stakes';
export * from './deposit';
export * from './withdraw';
export { useDepositStore } from './deposit-store';
export type { SubmitResult } from './deposit-store';
export { useWithdrawStore } from './withdraw-store';
export type { WithdrawResult } from './withdraw-store';
