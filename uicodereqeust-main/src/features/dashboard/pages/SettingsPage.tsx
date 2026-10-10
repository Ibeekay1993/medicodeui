import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import ProfileSettingsCard from "@/components/settings/ProfileSettingsCard";
import MfaSettingsCard from "@/components/settings/MfaSettingsCard";
import AdminControlsCard from "@/components/settings/AdminControlsCard";
import ConsentSettingsCard from "@/components/settings/ConsentSettingsCard";
import PushNotificationSettingsCard from "@/components/settings/PushNotificationSettingsCard";
import { ArrowLeft, ArrowRight, Bell, LockKeyhole, Shield, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Section = "account" | "notifications" | "privacy" | "security" | "admin";

export default function SettingsPage() {
  const { fullName, role, user, refreshProfile } = useAuth();
  const [section, setSection] = useState<Section>("account");
  const [sectionOpen, setSectionOpen] = useState(false);
  const sections: { id: Section; label: string; description: string; icon: typeof UserRound }[] = [
    { id: "account", label: "Account", description: "Profile details", icon: UserRound },
    { id: "notifications", label: "Alerts", description: "Push notifications", icon: Bell },
    { id: "privacy", label: "Privacy", description: "Data consent", icon: Shield },
    ...(role !== "hospital" ? [{ id: "security" as const, label: "Security", description: "Sign-in protection", icon: LockKeyhole }] : []),
    ...(role === "admin" ? [{ id: "admin" as const, label: "Admin", description: "Portal controls", icon: LockKeyhole }] : []),
  ];

  return (
    <main className="mx-auto max-w-5xl space-y-5 pb-8">
      <header>
        <h1 className="text-xl font-semibold text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Manage your account and preferences.</p>
      </header>

      <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)] md:items-start">
      <nav
        aria-label="Settings sections"
        className={cn(
          "space-y-1 rounded-xl border border-slate-200 bg-white p-2",
          sectionOpen ? "hidden md:block" : "block",
        )}
      >
        {sections.map(({ id, label, description, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setSection(id);
              setSectionOpen(true);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            aria-current={section === id ? "page" : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors",
              section === id ? "bg-slate-100 text-slate-950" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
            )}
          >
            <Icon className={cn("h-4 w-4 shrink-0", section === id ? "text-indigo-700" : "text-slate-400")} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{label}</span>
              <span className="block text-xs text-slate-500">{description}</span>
            </span>
            <ArrowRight className={cn("h-4 w-4 shrink-0 md:hidden", section === id ? "text-indigo-700" : "text-slate-300")} />
          </button>
        ))}
      </nav>

      <section
        aria-live="polite"
        className={cn("min-w-0 space-y-4", sectionOpen ? "block" : "hidden md:block")}
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setSectionOpen(false)}
          className="h-9 gap-2 px-2 text-sm text-slate-600 hover:text-slate-900 md:hidden"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Settings
        </Button>
        {section === "account" && <ProfileSettingsCard user={user} fullName={fullName} role={role} refreshProfile={refreshProfile} />}
        {section === "notifications" && <PushNotificationSettingsCard />}
        {section === "privacy" && <ConsentSettingsCard />}
        {section === "security" && role !== "hospital" && <MfaSettingsCard user={user} fullName={fullName} role={role} />}
        {section === "admin" && role === "admin" && <AdminControlsCard user={user} />}
      </section>
      </div>
    </main>
  );
}
