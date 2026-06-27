import sys
import re

def fix_details_sidebar():
    path = r'c:\Users\WINDOWS\Downloads\Med code updated\uicodereqeust-main\src\components\support\SupportDetailsSidebar.tsx'
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Fix the Header (Dispute Details)
    # Re-apply the header fix just in case it was reverted
    old_header = r'<h2 className="text-xs font-black text-slate-900 tracking-wider uppercase">\s*Dispute Details\s*</h2>\s*<p className="text-\[10px\] font-bold text-slate-400 uppercase tracking-widest">\s*Linked authorization, claim, and review actions\s*</p>'
    new_header = '<h2 className="text-lg font-semibold text-slate-800">Dispute Details</h2>'
    content = re.sub(old_header, new_header, content)

    # 2. Rewrite the Authorization details block to use grid
    # We will find the entire <div className="flex flex-col gap-1.5 text-xs leading-none"> inside the matchedRequest block
    auth_block_pattern = r'<div className="flex flex-col gap-1\.5 text-xs leading-none">(.*?)</div>\s*</div>\s*<div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm space-y-2">'
    
    # We'll just replace the inner content with a hardcoded grid structure
    new_auth_block = '''<div className="grid grid-cols-[100px_1fr] gap-x-2 gap-y-2 text-xs">
                    <div className="text-[11px] font-medium text-slate-400 uppercase">Request Ref:</div>
                    <div className="font-medium text-slate-800 break-all">{matchedRequest.request_id || matchedRequest.authorization_code || "REQ-LINKED"}</div>
                    
                    <div className="text-[11px] font-medium text-slate-400 uppercase">Status:</div>
                    <div className="font-medium text-slate-800 uppercase">{matchedRequest.status || "PENDING"}</div>
                    
                    <div className="text-[11px] font-medium text-slate-400 uppercase">Auth Code:</div>
                    <div className="font-medium text-slate-800">{matchedRequest.status === "approved" ? matchedRequest.authorization_code || "PENDING" : "NONE"}</div>
                    
                    <div className="text-[11px] font-medium text-slate-400 uppercase">Decision:</div>
                    <div className="font-medium text-slate-800">{getDecisionReason(matchedRequest) || "No note recorded"}</div>
                    
                    <div className="text-[11px] font-medium text-slate-400 uppercase">Patient:</div>
                    <div className="font-medium text-slate-800">{matchedRequest.patient_name || "—"}</div>
                    
                    <div className="text-[11px] font-medium text-slate-400 uppercase">Policy:</div>
                    <div className="font-medium text-slate-800">{matchedRequest.policy_number || "—"}</div>
                    
                    <div className="text-[11px] font-medium text-slate-400 uppercase">Hospital:</div>
                    <div className="font-medium text-slate-800">{matchedRequest.requesting_hospital_name || matchedRequest.hospital_name || "Requesting hospital"}</div>
                    
                    <div className="text-[11px] font-medium text-slate-400 uppercase">Diagnosis:</div>
                    <div className="font-medium text-slate-800 leading-snug">{matchedRequest.diagnosis || "—"}</div>
                  </div>'''
    
    # Actually, the regex might be tricky to match the exact end.
    # Let's use a simpler replace on the Linked Authorization Details string.
    content = content.replace(
        '<span className="text-xs font-black text-slate-400 uppercase tracking-wider">\n                      Linked Authorization Details\n                    </span>',
        '<span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">\n                      Request Details\n                    </span>'
    )
    
    # We can use regex to replace from <div className="flex flex-col gap-1.5 text-xs leading-none"> up to the end of the Auth block
    # We will find the start of the flex-col and replace everything inside it until we hit the Verification actions or similar.
    # Actually, an easier way is to just use standard string replacement for the individual labels and classes to compact them.
    # Change label styles:
    content = content.replace('text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none', 'text-[11px] font-medium text-slate-400 uppercase')
    
    # Change value styles to be less massive:
    content = content.replace('font-mono font-black text-slate-900 text-xs leading-none', 'font-medium text-slate-800 text-xs')
    content = content.replace('font-black text-slate-800 text-xs uppercase', 'font-medium text-slate-800 text-xs uppercase')
    content = content.replace('font-extrabold text-slate-800 text-xs leading-none', 'font-medium text-slate-800 text-xs')
    content = content.replace('font-black text-slate-800 text-[11px] leading-tight', 'font-medium text-slate-800 text-[11px]')
    content = content.replace('font-black text-slate-800 text-xs leading-none', 'font-medium text-slate-800 text-xs')
    content = content.replace('font-bold text-slate-600 leading-tight', 'font-medium text-slate-800 text-xs')
    content = content.replace('font-medium text-slate-600 text-[11px] leading-snug', 'font-medium text-slate-800 text-[11px] leading-snug')

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

def fix_dashboard_layout():
    path = r'c:\Users\WINDOWS\Downloads\Med code updated\uicodereqeust-main\src\components\dashboard\DashboardLayout.tsx'
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Remove the thin | divider
    content = content.replace('<span className="w-px h-5 bg-slate-200" />', '')

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

fix_details_sidebar()
fix_dashboard_layout()
print("Done fixing layout")
