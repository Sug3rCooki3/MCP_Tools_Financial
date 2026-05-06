"use client";

import { useState } from "react";
import { signIn } from "next-auth/react"; // client-side signIn — NOT from @/auth (server action)

interface LoginModalProps {
  open: boolean;
  onSuccess: () => void;
  onClose: () => void;
}

export function LoginModal({ open, onSuccess, onClose }: LoginModalProps) {
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const reset = () => {
    setEmail("");
    setPassword("");
    setError(null);
    setLoading(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) {
        setError("Invalid email or password.");
      } else {
        reset();
        onSuccess();
        onClose();
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        setError("Registration failed. Please try a different email.");
        return;
      }
      // Auto-login after registration
      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) {
        setError("Registration succeeded but login failed. Please log in manually.");
      } else {
        reset();
        onSuccess();
        onClose();
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      data-testid="login-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex justify-between">
          <div className="flex gap-4">
            <button
              className={`text-sm font-medium pb-1 border-b-2 ${tab === "login" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500"}`}
              onClick={() => { setTab("login"); setError(null); }}
            >
              Log in
            </button>
            <button
              className={`text-sm font-medium pb-1 border-b-2 ${tab === "signup" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500"}`}
              onClick={() => { setTab("signup"); setError(null); }}
            >
              Sign up
            </button>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
            ✕
          </button>
        </div>

        <form onSubmit={tab === "login" ? handleLogin : handleSignup} className="flex flex-col gap-3">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Please wait…" : tab === "login" ? "Log in" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}
