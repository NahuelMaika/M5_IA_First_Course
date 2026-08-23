"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { registerUser } from "@/lib/api/auth";
import { notify } from "@/lib/notifications/notifications";
import { cn } from "@/lib/utils";

// F-SPEC-09, resolved by disambiguation Q1 of `/daw-validate-spec`: same email-format regex as
// `apps/api`'s own validation, checked explicitly here (not just the browser's `type="email"`) to
// control the error text like the rest of the form (RF-70/RF-81 pattern of `expense-form.tsx`).
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Mirrors `registerBodySchema.password` in `apps/api/src/schemas/auth.ts:15`.
const PASSWORD_MIN_LENGTH = 8;

const EMAIL_REQUIRED_MESSAGE = "Ingresá tu email.";
const EMAIL_FORMAT_MESSAGE = "Ingresá un email válido.";
const PASSWORD_REQUIRED_MESSAGE = "Ingresá tu contraseña.";
const PASSWORD_LENGTH_MESSAGE = "La contraseña debe tener al menos 8 caracteres.";
const DUPLICATE_EMAIL_MESSAGE = "Ese email ya está registrado.";
const VALIDATION_ERROR_MESSAGE = "Revisá el email y la contraseña (mínimo 8 caracteres).";
// Same text `expense-form.tsx` uses (`GENERIC_ERROR_MESSAGE`) for every unmapped/network failure.
const GENERIC_ERROR_MESSAGE = "Ocurrió un error, intentá de nuevo.";

const EMAIL_INPUT_ID = "register-email";
const EMAIL_INPUT_ERROR_ID = "register-email-error";
const PASSWORD_INPUT_ID = "register-password";
const PASSWORD_INPUT_ERROR_ID = "register-password-error";

// Reuses `textarea.tsx`'s token-based styling (border/focus/aria-invalid) for the `<input>`s: no
// dedicated `Input` component exists yet in `apps/web/src/components/ui/` (AGENTS.md: "no screen
// defines its own colors, typography or spacing").
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

function validatePassword(value: string): string | null {
  if (value.length === 0) {
    return PASSWORD_REQUIRED_MESSAGE;
  }
  if (value.length < PASSWORD_MIN_LENGTH) {
    return PASSWORD_LENGTH_MESSAGE;
  }
  return null;
}

export function RegisterForm() {
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
    // RF-81: hide an already-visible error the moment the value becomes valid again -- no need
    // to wait for a new blur or submit attempt.
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
    // RF-70: reveal the error on blur or submit only, never while typing the first character.
    setEmailError(validateEmail(email));
  }

  function handlePasswordBlur() {
    setPasswordError(validatePassword(password));
  }

  async function submitRegistration(rawEmail: string, rawPassword: string) {
    setIsSubmitting(true);
    try {
      const result = await registerUser(rawEmail, rawPassword);

      switch (result.outcome) {
        case "created":
          router.push("/");
          return;
        case "duplicate_email":
          notify("error", DUPLICATE_EMAIL_MESSAGE);
          return;
        case "validation_error":
          notify("error", VALIDATION_ERROR_MESSAGE);
          return;
        case "unknown_error":
          notify("error", GENERIC_ERROR_MESSAGE);
          return;
      }
    } catch {
      // A rejected `registerUser` promise is treated the same as its own "unknown_error" outcome.
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
    void submitRegistration(email, password);
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
            Creando cuenta...
          </>
        ) : (
          "Crear cuenta"
        )}
      </Button>
    </form>
  );
}
