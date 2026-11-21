import { BrandSpinner } from "@/components/BrandSpinner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Mail } from "lucide-react";
import React from "react";

interface ForgotPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
  onEmailChange: (email: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  loading: boolean;
  success: boolean;
  error: string;
}

export function ForgotPasswordDialog({
  open,
  onOpenChange,
  email,
  onEmailChange,
  onSubmit,
  loading,
  success,
  error,
}: ForgotPasswordDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl max-w-[400px] p-6">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-slate-900">
            Reset Your Password
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Enter your registered email address and we will send you a secure password reset link.
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="py-4 text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Reset Link Sent</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              If an account exists for <strong className="text-slate-800">{email}</strong>, you will receive an email shortly with instructions to reset your password.
            </p>
            <Button
              type="button"
              onClick={() => onOpenChange(false)}
              className="mt-2 h-10 w-full rounded-xl bg-[#0F6E56] hover:bg-[#0a5240] text-xs font-semibold text-white"
            >
              Back to Sign In
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="forgot-email" className="text-xs font-semibold text-slate-700">
                Email Address
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id="forgot-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => onEmailChange(e.target.value)}
                  placeholder="name@hospital.com"
                  className="h-10 pl-9 rounded-xl border-slate-200 text-xs focus:border-[#0F6E56] focus:ring-2 focus:ring-[#0F6E56]/15"
                />
              </div>
            </div>

            {error && (
              <p className="text-xs font-medium text-rose-600">{error}</p>
            )}

            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="h-10 flex-1 rounded-xl text-xs font-semibold text-slate-600 border-slate-200 hover:bg-slate-50"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="h-10 flex-1 rounded-xl bg-[#0F6E56] hover:bg-[#0a5240] text-xs font-semibold text-white shadow-xs"
              >
                {loading ? (
                  <BrandSpinner className="h-4 w-4 animate-spin mx-auto" />
                ) : (
                  "Send Reset Link"
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
