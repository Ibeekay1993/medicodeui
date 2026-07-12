import React, { useState, useRef } from "react";
import { Upload, FileText, X, CheckCircle2, Loader2 } from "lucide-react";
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

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({ variant: "destructive", title: "File too large", description: "Max size is 10MB." });
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
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Supporting Document</p>
          <p className="text-xs text-slate-500 mt-1">Upload the doctor's report or diagnosis form</p>
        </div>
        {doctorReportPath && (
          <Badge variant="outline" className="rounded-full border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
            Required
          </Badge>
        )}
      </div>

      <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => e.target.files?.[0] && uploadFile(e.target.files[0])} className="hidden" id="doctor-report-upload" />

      {!doctorReportPath ? (
        <div
          className={cn("relative rounded-2xl border-2 border-dashed p-8 transition-all", isDragging ? "border-emerald-400 bg-emerald-50/50" : "border-slate-200 bg-slate-50/50")}
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={e => { e.preventDefault(); setIsDragging(false); }}
          onDrop={e => { e.preventDefault(); setIsDragging(false); uploadFile(e.dataTransfer.files[0]); }}
        >
          {isUploading ? (
            <div className="flex flex-col items-center space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-emerald-600" />
              <div className="w-full max-w-xs bg-slate-200 rounded-full h-2 overflow-hidden">
                <div className="bg-emerald-600 h-full transition-all" style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center">
              <Upload className="mx-auto h-10 w-10 mb-4 text-slate-400" />
              <h3 className="text-sm font-bold text-slate-900">{isDragging ? "Drop file here" : "Upload doctor's report"}</h3>
              <p className="text-xs text-slate-500 mt-1">PDF, JPG, or PNG (max 10MB)</p>
              <label htmlFor="doctor-report-upload" className="cursor-pointer inline-flex items-center justify-center mt-4 px-4 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold hover:bg-slate-50">
                <FileText className="mr-2 h-4 w-4" />
                Select File
              </label>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/30 p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-3 flex-1">
              <div className="p-2 rounded-xl bg-emerald-100"><FileText className="h-5 w-5 text-emerald-700" /></div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-900 truncate">{doctorReportName}</p>
                <p className="text-xs text-slate-500 mt-1">Uploaded</p>
              </div>
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={removeFile} className="h-8 w-8"><X className="h-4 w-4" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}
