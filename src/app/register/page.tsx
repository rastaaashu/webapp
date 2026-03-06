"use client";

import { useState, useEffect, Suspense, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useSignMessage } from "wagmi";
import { useAuth } from "@/contexts/AuthContext";
import { API_BASE_URL } from "@/config/constants";

type AuthTab = "wallet" | "email" | "telegram";

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="text-gray-400 p-6">Loading...</div>}>
      <RegisterContent />
    </Suspense>
  );
}

function RegisterContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const sponsorCode = searchParams.get("ref") || "";
  const [activeTab, setActiveTab] = useState<AuthTab>("wallet");

  useEffect(() => {
    if (isAuthenticated) router.replace("/dashboard");
  }, [isAuthenticated, router]);

  if (!sponsorCode) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 max-w-md w-full text-center">
          <h2 className="text-2xl font-bold mb-4">Referral Required</h2>
          <p className="text-gray-400 mb-6">
            You need a referral link to register. Please ask an existing member for an invite.
          </p>
          <Link href="/login" className="text-brand-400 hover:text-brand-300 underline">
            Already have an account? Login
          </Link>
        </div>
      </div>
    );
  }

  const tabs: { key: AuthTab; label: string }[] = [
    { key: "wallet", label: "EVM Wallet" },
    { key: "email", label: "Email" },
    { key: "telegram", label: "Telegram" },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 max-w-md w-full">
        <h2 className="text-2xl font-bold mb-2 text-center">Create Account</h2>
        <p className="text-gray-400 text-sm text-center mb-1">Register to start using BitTON.AI</p>
        <p className="text-xs text-gray-500 text-center mb-6">
          Referred by: <span className="text-brand-400">{sponsorCode}</span>
        </p>

        {/* Tabs */}
        <div className="flex border-b border-gray-700 mb-6">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "text-brand-400 border-b-2 border-brand-400"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "wallet" && <WalletRegister sponsorCode={sponsorCode} />}
        {activeTab === "email" && <EmailRegister sponsorCode={sponsorCode} />}
        {activeTab === "telegram" && <TelegramRegister sponsorCode={sponsorCode} />}

        <p className="text-center text-sm text-gray-500 mt-6">
          Already have an account?{" "}
          <Link href="/login" className="text-brand-400 hover:text-brand-300 underline">
            Login
          </Link>
        </p>
      </div>
    </div>
  );
}

// ── Wallet Registration ──
function WalletRegister({ sponsorCode }: { sponsorCode: string }) {
  const { isConnected, address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { login } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleRegister = async () => {
    if (!address) return;
    setLoading(true);
    setError("");

    try {
      const timestamp = new Date().toISOString();
      const message = `Sign this message to register with BitTON.AI\n\nAddress: ${address}\nTimestamp: ${timestamp}`;
      const signature = await signMessageAsync({ message });

      const res = await fetch(`${API_BASE_URL}/auth/register/wallet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, signature, message, sponsorCode }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Registration failed");
        return;
      }

      login(data.accessToken, data.refreshToken, data.user);
      router.replace("/dashboard");
    } catch (err: any) {
      if (err?.message?.includes("User rejected")) {
        setError("Signature rejected.");
      } else {
        setError("Unable to connect to server.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">Connect your wallet and sign a message to register.</p>
      <div className="flex justify-center">
        <ConnectButton />
      </div>
      {isConnected && (
        <button
          onClick={handleRegister}
          disabled={loading}
          className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white py-2.5 rounded-lg font-medium transition-colors"
        >
          {loading ? "Registering..." : "Sign & Register"}
        </button>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}

// ── Email Registration ──
function EmailRegister({ sponsorCode }: { sponsorCode: string }) {
  const { isConnected, address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { login } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<"email" | "otp" | "wallet">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE_URL}/auth/register/email/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to send verification code");
        return;
      }
      setSessionId(data.sessionId);
      setStep("otp");
    } catch {
      setError("Unable to connect to server.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE_URL}/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, otp }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Invalid code");
        return;
      }
      setStep("wallet");
    } catch {
      setError("Unable to connect to server.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE_URL}/auth/resend-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to resend");
        return;
      }
      setError("");
      setOtp("");
    } catch {
      setError("Unable to connect to server.");
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async () => {
    if (!address) return;
    setLoading(true);
    setError("");

    try {
      const timestamp = new Date().toISOString();
      const message = `Sign this message to register with BitTON.AI\n\nEmail: ${email}\nAddress: ${address}\nTimestamp: ${timestamp}`;
      const signature = await signMessageAsync({ message });

      const res = await fetch(`${API_BASE_URL}/auth/register/email/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, sponsorCode, address, signature, message }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Registration failed");
        return;
      }
      login(data.accessToken, data.refreshToken, data.user);
      router.replace("/dashboard");
    } catch (err: any) {
      if (err?.message?.includes("User rejected")) {
        setError("Signature rejected.");
      } else {
        setError("Unable to connect to server.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Step indicator */}
      <div className="flex items-center justify-center gap-2 mb-2">
        {["Email", "Verify", "Wallet"].map((label, i) => {
          const stepIndex = i;
          const currentIndex = step === "email" ? 0 : step === "otp" ? 1 : 2;
          return (
            <div key={label} className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
                  stepIndex <= currentIndex
                    ? "bg-brand-600 text-white"
                    : "bg-gray-700 text-gray-400"
                }`}
              >
                {stepIndex + 1}
              </div>
              <span className={`text-xs ${stepIndex <= currentIndex ? "text-white" : "text-gray-500"}`}>
                {label}
              </span>
              {i < 2 && <div className="w-6 h-px bg-gray-700" />}
            </div>
          );
        })}
      </div>

      {step === "email" && (
        <form onSubmit={handleSendOtp} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white py-2.5 rounded-lg font-medium"
          >
            {loading ? "Sending..." : "Send Verification Code"}
          </button>
        </form>
      )}

      {step === "otp" && (
        <form onSubmit={handleVerifyOtp} className="space-y-4">
          <p className="text-sm text-gray-400">
            A 6-digit code was sent to <span className="text-white">{email}</span>
          </p>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Verification Code</label>
            <input
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              required
              maxLength={6}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-center text-2xl tracking-widest"
            />
          </div>
          <button
            type="submit"
            disabled={loading || otp.length !== 6}
            className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white py-2.5 rounded-lg font-medium"
          >
            {loading ? "Verifying..." : "Verify Code"}
          </button>
          <button
            type="button"
            onClick={handleResendOtp}
            disabled={loading}
            className="w-full text-sm text-gray-400 hover:text-white"
          >
            Resend code
          </button>
        </form>
      )}

      {step === "wallet" && (
        <div className="space-y-4">
          <p className="text-sm text-green-400">Email verified! Now connect your wallet.</p>
          <div className="flex justify-center">
            <ConnectButton />
          </div>
          {isConnected && (
            <button
              onClick={handleComplete}
              disabled={loading}
              className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white py-2.5 rounded-lg font-medium"
            >
              {loading ? "Completing..." : "Sign & Complete Registration"}
            </button>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}

// ── Telegram Registration ──
function TelegramRegister({ sponsorCode }: { sponsorCode: string }) {
  const { isConnected, address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { login } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<"telegram" | "wallet">("telegram");
  const [sessionId, setSessionId] = useState("");
  const [telegramUser, setTelegramUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [botUsername, setBotUsername] = useState("");
  const [botConfigured, setBotConfigured] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE_URL}/auth/telegram/config`)
      .then((r) => r.json())
      .then((data) => {
        setBotUsername(data.botUsername);
        setBotConfigured(data.configured);
      })
      .catch(() => {});
  }, []);

  // Telegram Login Widget callback
  const handleTelegramAuth = useCallback(async (telegramData: any) => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE_URL}/auth/register/telegram/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(telegramData),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Telegram auth failed");
        return;
      }
      setSessionId(data.sessionId);
      setTelegramUser(data.telegramUser);
      setStep("wallet");
    } catch {
      setError("Unable to connect to server.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Load Telegram widget script
  useEffect(() => {
    if (!botConfigured || !botUsername || step !== "telegram") return;

    // Make callback available globally
    (window as any).onTelegramAuth = handleTelegramAuth;

    const container = document.getElementById("telegram-login-container");
    if (!container) return;

    // Clear previous widget
    container.innerHTML = "";

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    script.setAttribute("data-request-access", "write");
    container.appendChild(script);

    return () => {
      delete (window as any).onTelegramAuth;
    };
  }, [botConfigured, botUsername, step, handleTelegramAuth]);

  const handleComplete = async () => {
    if (!address) return;
    setLoading(true);
    setError("");

    try {
      const timestamp = new Date().toISOString();
      const message = `Sign this message to register with BitTON.AI\n\nAddress: ${address}\nTimestamp: ${timestamp}`;
      const signature = await signMessageAsync({ message });

      const res = await fetch(`${API_BASE_URL}/auth/register/telegram/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, sponsorCode, address, signature, message }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Registration failed");
        return;
      }
      login(data.accessToken, data.refreshToken, data.user);
      router.replace("/dashboard");
    } catch (err: any) {
      if (err?.message?.includes("User rejected")) {
        setError("Signature rejected.");
      } else {
        setError("Unable to connect to server.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (!botConfigured) {
    return (
      <div className="text-center py-4">
        <p className="text-gray-400 text-sm mb-2">Telegram login is not yet configured.</p>
        <p className="text-gray-500 text-xs">
          The administrator needs to set up a Telegram Bot and configure
          TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME in the backend.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {step === "telegram" && (
        <div className="space-y-4">
          <p className="text-sm text-gray-400">Log in with your Telegram account.</p>
          <div id="telegram-login-container" className="flex justify-center" />
          {loading && <p className="text-sm text-gray-400 text-center">Verifying...</p>}
        </div>
      )}

      {step === "wallet" && (
        <div className="space-y-4">
          <p className="text-sm text-green-400">
            Telegram verified as {telegramUser?.firstName || telegramUser?.username}! Now connect your wallet.
          </p>
          <div className="flex justify-center">
            <ConnectButton />
          </div>
          {isConnected && (
            <button
              onClick={handleComplete}
              disabled={loading}
              className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white py-2.5 rounded-lg font-medium"
            >
              {loading ? "Completing..." : "Sign & Complete Registration"}
            </button>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
