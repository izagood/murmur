import type { AccountView } from '@murmur/shared';

interface IdentityProps {
  account: AccountView | undefined;
  className?: string;
}

const HANDLE_COLORS: Record<string, string> = {};

function getHandleColor(handle: string): string {
  let hash = 0;
  for (let i = 0; i < handle.length; i++) {
    const char = handle.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const colors = ['bg-red-200', 'bg-orange-200', 'bg-amber-200', 'bg-lime-200', 'bg-emerald-200', 'bg-teal-200', 'bg-cyan-200', 'bg-sky-200', 'bg-blue-200', 'bg-violet-200', 'bg-fuchsia-200', 'bg-rose-200'];
  return colors[Math.abs(hash) % colors.length]!;
}

function getInitial(handle: string): string {
  const part = handle.split(/[\s_-]/)[0] ?? '';
  return part.charAt(0).toUpperCase();
}

export function Identity({ account, className = '' }: IdentityProps) {
  if (!account) return null;

  if (account.kind === 'agent') {
    return (
      <span className={`inline-flex items-center rounded bg-indigo-100 px-1 text-[10px] text-indigo-700 ${className}`}>
        🤖
      </span>
    );
  }

  const colorClass = HANDLE_COLORS[account.handle] || (HANDLE_COLORS[account.handle] = getHandleColor(account.handle));
  return (
    <span
      className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold text-white ${colorClass} ${className}`}
    >
      {getInitial(account.handle)}
    </span>
  );
}