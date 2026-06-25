import re

with open("src/pages/hospital/HospitalAuthorizations.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# Replace useDataPagination import removal
content = content.replace('import { useDataPagination } from "@/hooks/use-data-pagination";\n', '')

# Replace supabase query with 'as any'
content = content.replace('''      const { data: allExportData, error } = await supabase
        .from("authorization_requests")
        .select("created_at, patient_name, diagnosis, treatment, policy_number, authorization_code, status, clinical_notes, deletion_status")
        .or(idQuery.join(","))
        .order("created_at", { ascending: false });''', '''      const { data: allExportData, error } = await (supabase
        .from("authorization_requests" as any)
        .select("created_at, patient_name, diagnosis, treatment, policy_number, authorization_code, status, clinical_notes, deletion_status")
        .or(idQuery.join(","))
        .order("created_at", { ascending: false }) as any);''')

content = content.replace('const exportableRequests = (allExportData || []).filter(r => r.deletion_status !== "awaiting_admin_approval");', 'const exportableRequests = (allExportData || []).filter((r: any) => r.deletion_status !== "awaiting_admin_approval");')

content = content.replace('const rows = exportableRequests.map(r => [', 'const rows = exportableRequests.map((r: any) => [')

content = content.replace('const csvContent = [headers.join(","), ...rows.map(e => e.map(f => `"${String(f).replace(/"/g, \'""\')}"`).join(","))].join("\\n");', 'const csvContent = [headers.join(","), ...rows.map((e: any) => e.map((f: any) => `"${String(f).replace(/"/g, \'""\')}"`).join(","))].join("\\n");')

with open("src/pages/hospital/HospitalAuthorizations.tsx", "w", encoding="utf-8") as f:
    f.write(content)
