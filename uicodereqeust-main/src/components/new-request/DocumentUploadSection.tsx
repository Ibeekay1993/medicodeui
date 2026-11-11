import { BrandSpinner } from "@/components/BrandSpinner";
import { useState, useRef } from "react";
import { Upload, FileText, X, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface DocumentUploadSectionProps {
  doctorReportPath: string | null;
  setDoctorReportPath: (url: string | null) => void;
  doctorReportName: string | null;
  setDoctorReportName: (name: string | null) => void;
}

export default function DocumentUploadSection({
  doctorReportPath,
  setDoctorReportPath,
  doctorReportName,
  setDoctorReportName,
}: DocumentUploadSectionProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const uploadFile = async (file: File) => {
    if (!file) return;

    const allowedTypes = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
    if (!allowedTypes.includes(file.type)) {
      toast({ variant: "destructive", title: "Invalid file type", description: "Please upload PDF, JPG, or PNG." });
      return;
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({ variant: "destructive", title: "File too large", description: "Max size is 5MB." });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const extension = file.name.split(".").pop()?.toLowerCase() || file.type.split("/").pop() || "bin";
      const safeExtension = extension === "jpeg" ? "jpg" : extension;
      const objectId = typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const filePath = `${user.id}/${objectId}.${safeExtension}`;

      const progressInterval = setInterval(() => setUploadProgress(p => Math.min(p + 10, 90)), 200);

      const { error: uploadError } = await supabase.storage
        .from("doctor-reports")
        .upload(filePath, file, { cacheControl: '3600', upsert: false });

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (uploadError) throw uploadError;

      setDoctorReportPath(filePath);
      setDoctorReportName(file.name);

      toast({ title: "Uploaded", description: `${file.name} uploaded successfully.` });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Upload failed", description: error.message });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeFile = async () => {
    try {
      if (doctorReportPath) {
        const { error } = await supabase.storage.from("doctor-reports").remove([doctorReportPath]);
        if (error) throw error;
      }

      setDoctorReportPath(null);
      setDoctorReportName(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast({ title: "Removed", description: "Uploaded report was removed." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Remove failed", description: error.message });
    }
  };

  return (
    <div className="p-4 sm:p-5 space-y-3.5">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
        <div>
          <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5 text-emerald-600" /> Supporting Clinical Documents
          </h4>
          <p className="text-[11px] text-slate-500">Upload doctor prescription, lab report, or clinical summary</p>
        </div>
        {doctorReportPath && (
          <Badge variant="outline" className="rounded-full border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Attached
          </Badge>
        )}
      </div>

      <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => e.target.files?.[0] && uploadFile(e.target.files[0])} className="hidden" id="doctor-report-upload" />

      {!doctorReportPath ? (
        <div
          className={cn(
            "relative rounded-lg border-2 border-dashed p-6 transition-all text-center",
            isDragging ? "border-emerald-500 bg-emerald-50/60" : "border-slate-300 bg-slate-50"
          )}
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={e => { e.preventDefault(); setIsDragging(false); }}
          onDrop={e => { e.preventDefault(); setIsDragging(false); uploadFile(e.dataTransfer.files[0]); }}
        >
          {isUploading ? (
            <div className="flex flex-col items-center space-y-3">
              <BrandSpinner className="h-8 w-8 animate-spin text-emerald-600" />
              <div className="w-full max-w-xs bg-slate-200 rounded-full h-1.5 overflow-hidden">
                <div className="bg-emerald-600 h-full transition-all" style={{ width: `${uploadProgress}%` }} />
              </div>
              <span className="text-xs text-slate-600 font-semibold">Uploading document…</span>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center">
              <Upload className="mx-auto h-7 w-7 mb-2 text-slate-500" />
              <p className="text-xs font-bold text-slate-900">{isDragging ? "Drop document here" : "Drag & drop clinical report"}</p>
              <p className="text-[11px] text-slate-700 font-medium mt-0.5">PDF, JPG, or PNG (up to 5MB)</p>
              <label
                htmlFor="doctor-report-upload"
                className="cursor-pointer inline-flex items-center justify-center mt-3 h-8 px-3 rounded-lg bg-white border border-slate-300 text-xs font-bold text-slate-800 hover:bg-slate-100 shadow-xs"
              >
                <FileText className="mr-1.5 h-3.5 w-3.5 text-slate-600" />
                Select File
              </label>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5 min-w-0 flex-1">
              <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700 shrink-0">
                <FileText className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-900 truncate">{doctorReportName}</p>
                <p className="text-[10px] text-slate-500">Document attached</p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={removeFile}
              className="h-7 w-7 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded shrink-0 ml-2"
              aria-label="Remove document"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
