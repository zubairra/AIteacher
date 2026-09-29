'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, LayoutDashboard, Library, Plus, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SignOutButton } from './SignOutButton';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/lessons/new', label: 'Create Lesson', icon: Plus },
  { href: '/lessons', label: 'Saved Lessons', icon: Library },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;

export function TeacherShell({
  children,
  teacherName,
  teacherEmail,
  photoURL,
}: {
  children: React.ReactNode;
  teacherName: string;
  teacherEmail: string;
  photoURL?: string;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[#f7f8fb] text-slate-950 dark:bg-slate-950 dark:text-slate-50">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="flex items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-600"
          >
            <span className="grid size-10 place-items-center rounded-xl bg-violet-600 text-white shadow-sm">
              <BookOpen className="size-5" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-semibold leading-none">SmartBoard AI</span>
              <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                Teacher workspace
              </span>
            </span>
          </Link>

          <nav aria-label="Primary navigation" className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => {
              const active = item.href === '/' ? pathname === '/' : pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600',
                    active
                      ? 'bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-200'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white',
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-1">
            {photoURL ? (
              <img
                src={photoURL}
                alt=""
                referrerPolicy="no-referrer"
                className="size-9 rounded-full border border-slate-200"
              />
            ) : null}
            <span className="hidden max-w-44 xl:block">
              <span className="block truncate text-sm font-medium text-slate-700">
                {teacherName}
              </span>
              <span className="block truncate text-xs text-slate-500">{teacherEmail}</span>
            </span>
            <Link
              href="/advanced"
              className="min-h-11 rounded-lg px-3 py-3 text-sm font-medium text-slate-500 hover:bg-slate-100"
            >
              Advanced
            </Link>
            <SignOutButton />
          </div>
        </div>
        <nav
          aria-label="Mobile navigation"
          className="flex gap-1 overflow-x-auto border-t border-slate-100 px-3 py-2 md:hidden dark:border-slate-900"
        >
          {navItems.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'min-h-10 shrink-0 rounded-lg px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-violet-600',
                  active
                    ? 'bg-violet-50 text-violet-700 dark:bg-violet-950/50'
                    : 'text-slate-600 dark:text-slate-300',
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
}
