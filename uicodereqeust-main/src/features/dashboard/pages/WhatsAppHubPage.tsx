import { useState } from "react";
import { MessageSquare, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import WhatsAppPage from "./WhatsAppPage";
import WhatsAppAccessPage from "./WhatsAppAccessPage";

export default function WhatsAppHubPage() {
  const [tab, setTab] = useState<"access" | "parser">("access");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
        <Button variant={tab === "access" ? "default" : "ghost"} onClick={() => setTab("access")} className="gap-2">
          <ShieldCheck className="h-4 w-4" /> Hospital WhatsApp Access
        </Button>
        <Button variant={tab === "parser" ? "default" : "ghost"} onClick={() => setTab("parser")} className="gap-2">
          <MessageSquare className="h-4 w-4" /> WhatsApp Parser
        </Button>
      </div>
      {tab === "access" ? <WhatsAppAccessPage /> : <WhatsAppPage />}
    </div>
  );
}
