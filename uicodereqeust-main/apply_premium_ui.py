import sys

def fix_chat_area():
    path = r'c:\Users\WINDOWS\Downloads\Med code updated\uicodereqeust-main\src\components\support\SupportChatArea.tsx'
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Main Background
    content = content.replace(
        '"flex-1 flex flex-col h-full bg-slate-50 transition-all duration-300 relative"',
        '"flex-1 flex flex-col h-full bg-[#F9FAFC] transition-all duration-300 relative"'
    )

    # 2. Composer Base
    content = content.replace(
        '<div className="border-t border-slate-200 bg-white/80 backdrop-blur-md p-3">',
        '<div className="border-t border-slate-200 bg-[#F9FAFC] p-3 md:p-4 shrink-0 shadow-[0_-4px_12px_rgba(0,0,0,0.02)]">'
    )

    # 3. The Input Area wrapper
    content = content.replace(
        '<div className="flex items-end gap-2 bg-white border border-slate-200 rounded-xl p-1.5 shadow-sm focus-within:ring-1 focus-within:ring-indigo-500/30 transition-all">',
        '<div className="flex items-end gap-2 bg-white border border-slate-200/80 rounded-[20px] p-1.5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all duration-300">'
    )

    # 4. The Send Button Gradient
    content = content.replace(
        'className="h-9 px-4 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 shrink-0"',
        'className="h-9 px-4 rounded-[14px] bg-gradient-to-tr from-brand-600 to-indigo-500 hover:from-brand-700 hover:to-indigo-600 shadow-md shadow-brand-500/20 text-white shrink-0 transition-all duration-300 hover:scale-[1.02] active:scale-95"'
    )

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

def fix_message_bubbles():
    path = r'c:\Users\WINDOWS\Downloads\Med code updated\uicodereqeust-main\src\components\support\MessageBubble.tsx'
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Incoming message background
    content = content.replace(
        '"bg-white border border-slate-200 text-slate-800 shadow-sm"',
        '"bg-white border border-slate-100 text-slate-800 shadow-[0_2px_8px_rgba(0,0,0,0.04)]"'
    )

    # Outgoing message background
    content = content.replace(
        '"bg-brand-600 text-white shadow-brand-900/10"',
        '"bg-brand-600 border border-brand-500 text-white shadow-[0_4px_12px_rgba(79,70,229,0.15)]"'
    )

    # Sculpted radiuses
    content = content.replace(
        'className={cn(\n              "px-3 py-2 rounded-2xl relative",\n              bubbleBg,\n              isOwnMessage ? "rounded-br-sm" : "rounded-bl-sm"\n            )}',
        'className={cn(\n              "px-3.5 py-2.5 rounded-[18px] relative",\n              bubbleBg,\n              isOwnMessage ? "rounded-br-[4px]" : "rounded-bl-[4px]"\n            )}'
    )
    
    # Inline sender spacing
    content = content.replace(
        'className={cn("flex items-center gap-1.5 px-1 mb-0.5", isOwnMessage ? "justify-end flex-row-reverse" : "justify-start")}',
        'className={cn("flex items-center gap-1.5 px-1.5 mb-1", isOwnMessage ? "justify-end flex-row-reverse" : "justify-start")}'
    )

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

def fix_sidebar():
    path = r'c:\Users\WINDOWS\Downloads\Med code updated\uicodereqeust-main\src\components\support\SupportConversationsSidebar.tsx'
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Sidebar active state
    content = content.replace(
        '"bg-indigo-50 border-indigo-200/60 shadow-sm relative z-10"',
        '"bg-white shadow-[0_4px_20px_rgba(0,0,0,0.06)] border-l-[3px] border-brand-600 relative z-10"'
    )

    # Hover state for inactive
    content = content.replace(
        '"hover:bg-slate-50 border-transparent hover:border-slate-200/40"',
        '"hover:bg-white border-transparent hover:shadow-[0_2px_12px_rgba(0,0,0,0.03)]"'
    )
    
    content = content.replace(
        'className={cn(\n                  "w-full flex flex-col gap-1 p-3 border-y transition-all text-left",',
        'className={cn(\n                  "w-full flex flex-col gap-1 p-3 border-y transition-all duration-300 text-left",'
    )

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

def fix_details_sidebar():
    path = r'c:\Users\WINDOWS\Downloads\Med code updated\uicodereqeust-main\src\components\support\SupportDetailsSidebar.tsx'
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Float cards
    content = content.replace(
        'rounded-xl border border-slate-200 bg-white p-3 shadow-sm',
        'rounded-[16px] border border-slate-100 bg-white p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.03)]'
    )

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

fix_chat_area()
fix_message_bubbles()
fix_sidebar()
fix_details_sidebar()

print("Premium UI fixes applied.")
