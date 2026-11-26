import { JoinClassForm } from '@/components/student/JoinClassForm';

export default async function JoinClassPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const code = (await searchParams).code ?? '';
  return <JoinClassForm initialCode={code} />;
}
