import { RegisterForm } from "@/components/register-form";

// Block 4 (spec-FEAT-004b): registration screen, reachable on its own so a new person can create
// an account before signing in.
export default function RegisterPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 p-4">
      <h1 className="text-2xl font-bold">Crear cuenta</h1>
      <RegisterForm />
    </main>
  );
}
