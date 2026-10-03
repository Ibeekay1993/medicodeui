import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import ProfileSettingsCard from "@/components/settings/ProfileSettingsCard";
import MfaSettingsCard from "@/components/settings/MfaSettingsCard";
import AdminControlsCard from "@/components/settings/AdminControlsCard";
import ConsentSettingsCard from "@/components/settings/ConsentSettingsCard";
import PushNotificationSettingsCard from "@/components/settings/PushNotificationSettingsCard";
import { Bell, LockKeyhole, Shield, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

type Section = "account" | "notifications" | "privacy" | "security" | "admin";

export default function SettingsPage() {
  const { fullName, role, user, refreshProfile } = useAuth();
  const [section, setSection] = useState<Section>("account");
  const sections: { id: Section; label: string; icon: typeof UserRound }[] = [
    { id: "account", label: "Account", icon: UserRound },
    { id: "notifications", label: "Alerts", icon: Bell },
    { id: "privacy", label: "Privacy", icon: Shield },
    ...(role !== "hospital" ? [{ id: "security" as const, label: "Security", icon: LockKeyhole }] : []),
    ...(role === "admin" ? [{ id: "admin" as const, label: "Admin", icon: LockKeyhole }] : []),
  ];

  return (
    <main className="mx-auto max-w-4xl space-y-5 pb-8">
      <header>
        <h1 className="text-xl font-semibold text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Manage your account and preferences.</p>
      </header>

      <nav aria-label="Settings sections" className="flex gap-2 overflow-x-auto border-b border-slate-200 pb-2">
        {sections.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSection(id)}
            aria-current={section === id ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
              section === id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100",
            )}
          >
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </nav>

      <section className="space-y-4">
        {section === "account" && <ProfileSettingsCard user={user} fullName={fullName} role={role} refreshProfile={refreshProfile} />}
        {section === "notifications" && <PushNotificationSettingsCard />}
        {section === "privacy" && <ConsentSettingsCard />}
        {section === "security" && role !== "hospital" && <MfaSettingsCard user={user} fullName={fullName} role={role} />}
        {section === "admin" && role === "admin" && <AdminControlsCard user={user} />}
      </section>
    </main>
  );
}
