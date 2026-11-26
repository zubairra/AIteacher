'use client';

import { BookOpen, LayoutDashboard, LineChart, UserRound } from 'lucide-react';
import { usePathname } from 'next/navigation';

import { SignOutButton } from '@/components/teacher/SignOutButton';
import { STUDENT_NAV } from '@/lib/student/nav';

const ICONS = {
  '/learn': LayoutDashboard,
  '/learn/progress': LineChart,
  '/learn/profile': UserRound,
} as const;

export function StudentShell({
  children,
  studentName,
}: {
  children: React.ReactNode;
  studentName: string;
}) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <a
            href="/learn"
            className="flex items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700"
          >
            <span className="grid size-10 place-items-center rounded-xl bg-blue-700 text-white">
              <BookOpen className="size-5" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-semibold leading-none">OrbitTeach</span>
              <span className="mt-1 block text-xs text-slate-500">Your tutor</span>
            </span>
          </a>
          <nav aria-label="Student" className="hidden items-center gap-1 md:flex">
            {STUDENT_NAV.map((item) => {
              const active =
                item.href === '/learn' ? pathname === '/learn' : pathname.startsWith(item.href);
              const Icon = ICONS[item.href];
              return (
                <a
                  key={item.href}
                  href={item.href}
                  className={`flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${
                    active ? 'bg-blue-50 text-blue-800' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {item.label}
                </a>
              );
            })}
          </nav>
          <div className="flex items-center gap-2">
            <span className="hidden max-w-40 truncate text-sm font-medium text-slate-700 sm:block">
              {studentName}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-6 pb-24 md:pb-10">{children}</main>
      <nav
        aria-label="Student"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-slate-200 bg-white md:hidden"
      >
        {STUDENT_NAV.map((item) => {
          const active =
            item.href === '/learn' ? pathname === '/learn' : pathname.startsWith(item.href);
          const Icon = ICONS[item.href];
          return (
            <a
              key={item.href}
              href={item.href}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 text-xs font-semibold ${
                active ? 'text-blue-800' : 'text-slate-500'
              }`}
            >
              <Icon className="size-4" aria-hidden="true" />
              {item.label}
            </a>
          );
        })}
      </nav>
    </div>
  );
}
