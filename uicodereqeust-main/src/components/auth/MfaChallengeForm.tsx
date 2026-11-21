import { BrandSpinner } from "@/components/BrandSpinner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield } from "lucide-react";
import React from "react";

interface MfaChallengeFormProps {
  mfaCode: string;
  onCodeChange: (code: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isLoading: boolean;
  onCancel: () => void;
}

export function MfaChallengeForm({
  mfaCode,
  onCodeChange,
  onSubmit,
  isLoading,
  onCancel,
}: MfaChallengeFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="rounded-xl bg-emerald-50/70 border border-emerald-200/80 p-3.5">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-[#0F6E56] shrink-0" />
          <span className="text-xs font-bold text-[#0F6E56]">
            Multi-Factor Authentication
          </span>
        </div>
        <p className="text-xs text-slate-600 mt-1 leading-relaxed">
          Enter the 6-digit verification code from your authenticator app to authorize this session.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="mfa-code" className="text-xs font-semibold text-slate-700">
            Authenticator Code
          </Label>
          <Badge variant="outline" className="text-[10px] font-mono text-[#0F6E56] border-emerald-200 bg-emerald-50">
            MFA Active
          </Badge>
        </div>
        <Input
          id="mfa-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={mfaCode}
          onChange={(e) => onCodeChange(e.target.value.replace(/\D/g, ""))}
          required
          placeholder="000000"
          className="h-12 rounded-xl text-center text-2xl font-mono tracking-[0.3em] font-bold border-slate-200 bg-slate-50/50 focus:bg-white focus:border-[#0F6E56] focus:ring-2 focus:ring-[#0F6E56]/15 transition-all"
        />
      </div>

      <div className="flex flex-col gap-2.5 pt-1">
        <Button
          type="submit"
          disabled={isLoading || mfaCode.length < 6}
          className="h-11 w-full rounded-xl bg-[#0F6E56] font-semibold text-white shadow-xs transition-colors hover:bg-[#0a5240] disabled:opacity-60"
        >
          {isLoading ? (
            <BrandSpinner className="h-4 w-4 animate-spin mx-auto" />
          ) : (
            "Verify Identity"
          )}
        </Button>

        <Button
          type="button"
          variant="ghost"
          disabled={isLoading}
          onClick={onCancel}
          className="h-10 text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100/70"
        >
          Cancel and return to sign in
        </Button>
      </div>
    </form>
  );
}
