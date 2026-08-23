"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { loginUser } from "@/lib/api/auth";
import { notify } from "@/lib/notifications/notifications";
import { cn } from "@/lib/utils";

// Same pattern as `register-form.tsx` (Block 4): explicit format check, not just the browser's
// `type="email"`, to control the error text like the rest of the form.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EMAIL_REQUIRED_MESSAGE = "Ingresá tu email.";
const EMAIL_FORMAT_MESSAGE = "Ingresá un email válido.";
const PASSWORD_REQUIRED_MESSAGE = "Ingresá tu contraseña.";
// Deliberately generic -- never distinguishes email from password (AGENTS.md: "do not leave
// messages that reveal whether an email is registered"), same criterion as the API's own login.
const INVALID_CREDENTIALS_MESSAGE = "Email o contraseña incorrectos.";
const TOO_MANY_ATTEMPTS_MESSAGE = "Demasiados intentos. Probá de nuevo en unos minutos.";
const VALIDATION_ERROR_MESSAGE = "Revisá el formato del email y la contraseña.";
// Same text `expense-form.tsx`/`register-form.tsx` use (`GENERIC_ERROR_MESSAGE`) for every
// unmapped/network failure.
const GENERIC_ERROR_MESSAGE = "Ocurrió un error, intentá de nuevo.";

const EMAIL_INPUT_ID = "login-email";
const EMAIL_INPUT_ERROR_ID = "login-email-error";
const PASSWORD_INPUT_ID = "login-password";
const PASSWORD_INPUT_ERROR_ID = "login-password-error";

// Reuses `textarea.tsx`'s token-based styling (border/focus/aria-invalid), same constant as
// `register-form.tsx` -- no screen defines its own colors/typography/spacing (AGENTS.md).
const INPUT_CLASSNAME = cn(
  "flex h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40"
);

function validateEmail(value: string): string | null {
  if (value.trim().length === 0) {
    return EMAIL_REQUIRED_MESSAGE;
  }
  if (!EMAIL_PATTERN.test(value)) {
    return EMAIL_FORMAT_MESSAGE;
  }
  return null;
}

// Login only requires a non-empty password -- deliberately does NOT reuse Block 4's 8-character
// minimum. Mirrors `loginBodySchema.password` in `apps/api/src/schemas/auth.ts:18-21`: enforcing 8
// here would leak a distinct status code for a short-but-otherwise-correct historical password.
function validatePassword(value: string): string | null {
  if (value.length === 0) {
    return PASSWORD_REQUIRED_MESSAGE;
  }
  return null;
}

export function LoginForm() {
  const router = useRouter();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [emailError, setEmailError] = React.useState<string | null>(null);
  const [passwordError, setPasswordError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const hasEmailError = emailError !== null;
  const hasPasswordError = passwordError !== null;

  function handleEmailChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextValue = event.target.value;
    setEmail(nextValue);
    if (emailError !== null && validateEmail(nextValue) === null) {
      setEmailError(null);
    }
  }

  function handlePasswordChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextValue = event.target.value;
    setPassword(nextValue);
    if (passwordError !== null && validatePassword(nextValue) === null) {
      setPasswordError(null);
    }
  }

  function handleEmailBlur() {
    setEmailError(validateEmail(email));
  }

  function handlePasswordBlur() {
    setPasswordError(validatePassword(password));
  }

  async function submitLogin(rawEmail: string, rawPassword: string) {
    setIsSubmitting(true);
    try {
      const result = await loginUser(rawEmail, rawPassword);

      switch (result.outcome) {
        case "success":
          router.push("/");
          return;
        case "invalid_credentials":
          notify("error", INVALID_CREDENTIALS_MESSAGE);
          return;
        case "too_many_attempts":
          notify("error", TOO_MANY_ATTEMPTS_MESSAGE);
          return;
        case "validation_error":
          notify("error", VALIDATION_ERROR_MESSAGE);
          return;
        case "unknown_error":
          notify("error", GENERIC_ERROR_MESSAGE);
          return;
      }
    } catch {
      // A rejected `loginUser` promise is treated the same as its own "unknown_error" outcome.
      notify("error", GENERIC_ERROR_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const emailValidationError = validateEmail(email);
    const passwordValidationError = validatePassword(password);
    setEmailError(emailValidationError);
    setPasswordError(passwordValidationError);
    if (emailValidationError !== null || passwordValidationError !== null) {
      return;
    }
    void submitLogin(email, password);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={EMAIL_INPUT_ID}>Email</label>
        <input
          id={EMAIL_INPUT_ID}
          name="email"
          type="email"
          value={email}
          onChange={handleEmailChange}
          onBlur={handleEmailBlur}
          aria-invalid={hasEmailError}
          aria-describedby={hasEmailError ? EMAIL_INPUT_ERROR_ID : undefined}
          className={INPUT_CLASSNAME}
        />
        {hasEmailError ? (
          <p id={EMAIL_INPUT_ERROR_ID} role="alert">
            {emailError}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={PASSWORD_INPUT_ID}>Contraseña</label>
        <input
          id={PASSWORD_INPUT_ID}
          name="password"
          type="password"
          value={password}
          onChange={handlePasswordChange}
          onBlur={handlePasswordBlur}
          aria-invalid={hasPasswordError}
          aria-describedby={hasPasswordError ? PASSWORD_INPUT_ERROR_ID : undefined}
          className={INPUT_CLASSNAME}
        />
        {hasPasswordError ? (
          <p id={PASSWORD_INPUT_ERROR_ID} role="alert">
            {passwordError}
          </p>
        ) : null}
      </div>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Loader2 className="animate-spin" aria-hidden="true" />
            Ingresando...
          </>
        ) : (
          "Iniciar sesión"
        )}
      </Button>
      <p className="text-sm text-muted-foreground">
        ¿No tenés cuenta?{" "}
        <Link href="/register" className="underline underline-offset-4">
          Creá una
        </Link>
      </p>
    </form>
  );
}
