import { useAuth } from "@/contexts/AuthContext";
import ProfileSettingsCard from "@/components/settings/ProfileSettingsCard";
import MfaSettingsCard from "@/components/settings/MfaSettingsCard";
import AdminControlsCard from "@/components/settings/AdminControlsCard";

export default function SettingsPage() {
  const { fullName, role, user, refreshProfile } = useAuth();

  return (
    <div className="space-y-4 max-w-full overflow-x-hidden pb-10 animate-in fade-in duration-500">

      <ProfileSettingsCard
        user={user}
        fullName={fullName}
        role={role}
        refreshProfile={refreshProfile}
      />

      {role !== "hospital" && <MfaSettingsCard user={user} fullName={fullName} role={role} />}

      {role === "admin" && <AdminControlsCard user={user} />}
    </div>
  );
}
