import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { ApiError, login } from "../api/client";
import { AuthShell, fieldClassName } from "../components/AuthShell";
import { useAppSelector } from "../store/hooks";

export function LoginPage() {
  const accessToken = useAppSelector((state) => state.auth.accessToken);
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (accessToken) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not log in");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell title="Log in">
      <form className="space-y-4" onSubmit={onSubmit}>
        <label className="block text-sm font-medium">
          Email
          <input
            className={fieldClassName}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="block text-sm font-medium">
          Password
          <input
            className={fieldClassName}
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error ? (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
        <button
          className="w-full rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          type="submit"
          disabled={submitting}
        >
          {submitting ? "Logging in…" : "Log in"}
        </button>
      </form>
      <p className="mt-4 text-sm text-stone-600">
        No account?{" "}
        <Link className="font-medium text-stone-900 underline" to="/register">
          Register
        </Link>
      </p>
    </AuthShell>
  );
}
