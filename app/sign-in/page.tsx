import { redirect } from 'next/navigation';
import { GoogleSignInForm } from '@/components/teacher/GoogleSignInForm';
import { getTeacherPageSession } from '@/lib/server/auth/session';

export default async function SignInPage() {
  if (await getTeacherPageSession()) redirect('/');
  return <GoogleSignInForm />;
}
