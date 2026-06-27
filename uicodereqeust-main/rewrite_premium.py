import sys

def rewrite_page():
    path = r'c:\Users\WINDOWS\Downloads\Med code updated\uicodereqeust-main\src\pages\dashboard\SupportMessagesPage.tsx'
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Glassmorphism Bottom Nav
    old_nav = '''      {/* Mobile bottom tab navigation */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-4 py-2 flex items-center justify-around z-40">
        <button
          type="button"
          onClick={() => setMobileSubView("LIST")}
          className={cn(
            "flex flex-col items-center gap-1 py-1 px-4 rounded-lg transition-colors",
            mobileSubView === "LIST" ? "text-brand-700 bg-brand-50" : "text-slate-500"
          )}
        >'''
    
    new_nav = '''      {/* Mobile bottom tab navigation (Glass Island) */}
      <div className="lg:hidden fixed bottom-4 left-4 right-4 bg-white/85 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.12)] rounded-2xl px-2 py-2 flex items-center justify-around z-40 ring-1 ring-slate-900/5">
        <button
          type="button"
          onClick={() => setMobileSubView("LIST")}
          className={cn(
            "flex flex-col items-center gap-1 py-1.5 px-4 rounded-xl transition-all duration-300",
            mobileSubView === "LIST" ? "text-brand-700 bg-brand-50 shadow-sm ring-1 ring-brand-100 inset" : "text-slate-500 hover:text-slate-700 hover:bg-slate-50/50"
          )}
        >'''
    content = content.replace(old_nav, new_nav)

    old_nav_2 = '''className={cn(
            "flex flex-col items-center gap-1 py-1 px-4 rounded-lg transition-colors",
            mobileSubView === "CHAT" && selected ? "text-brand-700 bg-brand-50" : "text-slate-400"
          )}'''
    new_nav_2 = '''className={cn(
            "flex flex-col items-center gap-1 py-1.5 px-4 rounded-xl transition-all duration-300",
            mobileSubView === "CHAT" && selected ? "text-brand-700 bg-brand-50 shadow-sm ring-1 ring-brand-100 inset" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50/50"
          )}'''
    content = content.replace(old_nav_2, new_nav_2)

    old_nav_3 = '''className={cn(
            "flex flex-col items-center gap-1 py-1 px-4 rounded-lg transition-colors",
            mobileSubView === "INFO" && selected ? "text-brand-700 bg-brand-50" : "text-slate-400"
          )}'''
    new_nav_3 = '''className={cn(
            "flex flex-col items-center gap-1 py-1.5 px-4 rounded-xl transition-all duration-300",
            mobileSubView === "INFO" && selected ? "text-brand-700 bg-brand-50 shadow-sm ring-1 ring-brand-100 inset" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50/50"
          )}'''
    content = content.replace(old_nav_3, new_nav_3)

    # 2. Premium FAB
    old_fab = '''      {/* Floating Action Button */}
      <button
        type="button"
        onClick={() => {
          setNewTicketOpen(true);
        }}
        className="fixed bottom-20 right-5 z-50 lg:bottom-8 lg:right-8 h-14 w-14 rounded-full bg-slate-900 text-white shadow-2xl shadow-slate-900/30 hover:bg-slate-800 hover:scale-110 active:scale-95 transition-all flex items-center justify-center"
        title="New Conversation"
      >'''
    new_fab = '''      {/* Premium Floating Action Button */}
      <button
        type="button"
        onClick={() => {
          setNewTicketOpen(true);
        }}
        className="fixed bottom-24 right-5 z-50 lg:bottom-8 lg:right-8 h-14 w-14 rounded-full bg-gradient-to-br from-brand-500 to-indigo-600 text-white shadow-[0_8px_20px_rgb(79,70,229,0.4)] hover:shadow-[0_12px_25px_rgb(79,70,229,0.5)] hover:scale-105 active:scale-90 transition-all duration-300 flex items-center justify-center ring-1 ring-white/20 inset"
        title="New Conversation"
      >'''
    content = content.replace(old_fab, new_fab)

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

def rewrite_sidebar():
    path = r'c:\Users\WINDOWS\Downloads\Med code updated\uicodereqeust-main\src\components\support\SupportConversationsSidebar.tsx'
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    old_btn = '''<Button size="sm" className="h-7 rounded text-xs font-bold bg-brand-600 hover:bg-brand-700 px-2.5 shadow-sm text-white" onClick={onNewTicketClick}>'''
    new_btn = '''<Button size="sm" className="h-7 rounded text-xs font-bold bg-gradient-to-br from-brand-500 to-indigo-600 hover:from-brand-600 hover:to-indigo-700 px-3 shadow-md shadow-brand-500/20 text-white ring-1 ring-white/20 inset transition-all active:scale-95" onClick={onNewTicketClick}>'''
    content = content.replace(old_btn, new_btn)

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

def rewrite_details():
    path = r'c:\Users\WINDOWS\Downloads\Med code updated\uicodereqeust-main\src\components\support\SupportDetailsSidebar.tsx'
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    old_btn1 = '''className="w-full h-8 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-black uppercase tracking-wider text-xs transition-all"'''
    new_btn1 = '''className="w-full h-8 rounded-lg bg-gradient-to-b from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 text-white font-black uppercase tracking-wider text-xs transition-all shadow-md shadow-slate-900/20 ring-1 ring-white/10 inset active:scale-[0.98]"'''
    content = content.replace(old_btn1, new_btn1)

    old_btn2 = '''className="w-full h-8 rounded-lg text-rose-600 border-rose-250 hover:bg-rose-50 font-black uppercase tracking-wider text-xs transition-all"'''
    new_btn2 = '''className="w-full h-8 rounded-lg text-rose-600 border-rose-200 bg-rose-50/30 hover:bg-rose-50 hover:border-rose-300 font-black uppercase tracking-wider text-xs transition-all active:scale-[0.98]"'''
    content = content.replace(old_btn2, new_btn2)

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

rewrite_page()
rewrite_sidebar()
rewrite_details()
print("done")
