import sys
import re

def fix_conversations_sidebar():
    path = r'c:\Users\WINDOWS\Downloads\Med code updated\uicodereqeust-main\src\components\support\SupportConversationsSidebar.tsx'
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Heading
    content = content.replace(
        '<h2 className="text-sm font-black text-slate-800 tracking-tight uppercase">Conversations</h2>',
        '<h2 className="text-base font-medium text-slate-800 mb-1 mt-1">Conversations</h2>'
    )
    # Gap above search
    content = content.replace(
        '<div className="p-3 border-b border-slate-150 flex flex-col gap-3 bg-white shrink-0">',
        '<div className="p-3 border-b border-slate-150 flex flex-col gap-2 bg-white shrink-0">'
    )
    # Search box height
    content = content.replace(
        '<Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search auth or subject..." className="h-8 rounded bg-slate-50 pl-8 text-xs font-medium border-slate-200" />',
        '<Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search auth or subject..." className="h-10 rounded-md bg-slate-50 pl-8 text-xs font-medium border-slate-200" />'
    )

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

def fix_details_sidebar():
    path = r'c:\Users\WINDOWS\Downloads\Med code updated\uicodereqeust-main\src\components\support\SupportDetailsSidebar.tsx'
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Header
    old_header = '''<h2 className="text-xs font-black text-slate-900 tracking-wider uppercase">
            Dispute Details
          </h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            Linked authorization, claim, and review actions
          </p>'''
    new_header = '''<h2 className="text-lg font-semibold text-slate-800">
            Dispute Details
          </h2>'''
    content = content.replace(old_header, new_header)

    # 2-column layout (Auth)
    old_auth_cols = '''<div className="flex flex-col gap-1.5 text-xs leading-none">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                        Request Reference
                      </span>
                      <span className="font-mono font-black text-slate-900 text-xs leading-none">
                        {matchedRequest.request_id || matchedRequest.authorization_code || "REQ-LINKED"}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                        Decision Status
                      </span>
                      <span className="font-black text-slate-800 text-xs uppercase">
                        {matchedRequest.status || "PENDING"}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                        Authorization Code
                      </span>
                      <span className="font-mono font-black text-slate-900 text-xs leading-none">
                        {matchedRequest.status === "approved"
                          ? matchedRequest.authorization_code || "PENDING"
                          : "NONE"}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                        Decision Note
                      </span>
                      <span className="font-medium text-slate-600 text-xs leading-tight">
                        {matchedRequest.decision_reason || "No decision note recorded"}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5 mt-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                        Patient Name
                      </span>
                      <span className="font-bold text-slate-800 text-xs">
                        {matchedRequest.patient_name || "—"}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                        Policy Number
                      </span>
                      <span className="font-mono font-bold text-slate-800 text-xs">
                        {matchedRequest.policy_number || "—"}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                        Hospital
                      </span>
                      <span className="font-black text-slate-800 text-[11px] leading-tight">
                        {matchedRequest.requesting_hospital_name ||
                          matchedRequest.hospital_name ||
                          "Requesting hospital"}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5 mt-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                        Clinical Diagnosis
                      </span>
                      <span className="font-medium text-slate-600 text-[11px] leading-snug">
                        {matchedRequest.diagnosis || "—"}
                      </span>
                    </div>
                  </div>'''

    new_auth_cols = '''<div className="grid grid-cols-[100px_1fr] gap-x-2 gap-y-2 text-xs">
                    <div className="text-[11px] font-medium text-slate-400 uppercase">Request Ref:</div>
                    <div className="font-medium text-slate-800 break-all">{matchedRequest.request_id || matchedRequest.authorization_code || "REQ-LINKED"}</div>
                    
                    <div className="text-[11px] font-medium text-slate-400 uppercase">Status:</div>
                    <div className="font-medium text-slate-800 uppercase">{matchedRequest.status || "PENDING"}</div>
                    
                    <div className="text-[11px] font-medium text-slate-400 uppercase">Auth Code:</div>
                    <div className="font-medium text-slate-800">{matchedRequest.status === "approved" ? matchedRequest.authorization_code || "PENDING" : "NONE"}</div>
                    
                    <div className="text-[11px] font-medium text-slate-400 uppercase">Decision:</div>
                    <div className="font-medium text-slate-800">{matchedRequest.decision_reason || "No note recorded"}</div>
                    
                    <div className="text-[11px] font-medium text-slate-400 uppercase mt-1">Patient:</div>
                    <div className="font-medium text-slate-800 mt-1">{matchedRequest.patient_name || "—"}</div>
                    
                    <div className="text-[11px] font-medium text-slate-400 uppercase">Policy:</div>
                    <div className="font-medium text-slate-800">{matchedRequest.policy_number || "—"}</div>
                    
                    <div className="text-[11px] font-medium text-slate-400 uppercase">Hospital:</div>
                    <div className="font-medium text-slate-800">{matchedRequest.requesting_hospital_name || matchedRequest.hospital_name || "Requesting hospital"}</div>
                    
                    <div className="text-[11px] font-medium text-slate-400 uppercase mt-1">Diagnosis:</div>
                    <div className="font-medium text-slate-800 mt-1 leading-snug">{matchedRequest.diagnosis || "—"}</div>
                  </div>'''
    
    content = content.replace(old_auth_cols, new_auth_cols)

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

def fix_chat_area():
    path = r'c:\Users\WINDOWS\Downloads\Med code updated\uicodereqeust-main\src\components\support\SupportChatArea.tsx'
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Remove hospital badge and adjust subject
    old_chat_header = '''                {selected.hospitals?.name && (
                  <Badge
                    variant="outline"
                    className="shrink-0 hidden sm:inline-flex rounded border-slate-200 bg-white text-slate-500 text-[10px] font-black px-1.5 py-0 tracking-wider"
                  >
                    {selected.hospitals.name.toUpperCase()}
                  </Badge>
                )}
                <h2 className="text-sm font-bold text-slate-800 truncate" title={selected.subject}>
                  {selected.subject}
                </h2>'''
    
    new_chat_header = '''                <span className="text-slate-300 shrink-0 font-black">&middot;</span>
                <h2 className="text-sm font-semibold text-slate-800 truncate" title={selected.subject}>
                  {selected.subject}
                </h2>'''
    
    content = content.replace(old_chat_header, new_chat_header)
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

def fix_message_bubble():
    path = r'c:\Users\WINDOWS\Downloads\Med code updated\uicodereqeust-main\src\components\support\MessageBubble.tsx'
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    old_sender = '''          {/* Sender Name outside bubble if not own message, or if it's internal memo it's fine to show */}
          <div className={cn("text-[10px] font-bold px-1", isOwnMessage ? "text-right text-slate-500" : "text-left text-slate-500")}>
            {displayName} {isMsgInternal ? " (Internal Note)" : ""}
          </div>'''
    
    new_sender = '''          {/* Inline Name + Time */}
          <div className={cn("flex items-center gap-1.5 px-1 mb-0.5", isOwnMessage ? "justify-end flex-row-reverse" : "justify-start")}>
            <span className="text-[11px] font-semibold text-slate-700">{displayName}</span>
            <span className="text-[10px] font-medium text-slate-400">{timeString}</span>
            {isMsgInternal && <span className="text-[10px] font-bold text-amber-600">(Internal)</span>}
          </div>'''
    
    content = content.replace(old_sender, new_sender)

    # remove bottom timestamp since it's now inline
    old_timestamp = '''            <div className={cn("text-[9px] font-semibold mt-1", timeColor, isOwnMessage ? "text-right" : "text-left")}>
              {timeString}
            </div>'''
    content = content.replace(old_timestamp, '')

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

fix_conversations_sidebar()
fix_details_sidebar()
fix_chat_area()
fix_message_bubble()
print("Done applying user UI fixes")
