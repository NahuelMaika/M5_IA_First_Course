import { LoginForm } from "@/components/login-form";

// Block 5 (spec-FEAT-004b): login screen, reachable on its own or from a 401 redirect (Block 7/8).
export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 p-4">
      <h1 className="text-2xl font-bold">Iniciar sesión</h1>
      <LoginForm />
    </main>
  );
}
