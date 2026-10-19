import type { Metadata } from 'next';
import { StudentJoin } from '@/components/student/StudentJoin';

export const metadata: Metadata = {
  title: 'Join class · SmartBoard AI',
  description: 'Enter the class code from the board to answer the current question.',
};

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[] }>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.code) ? params.code[0] : params.code;
  return <StudentJoin initialCode={raw ?? ''} />;
}
