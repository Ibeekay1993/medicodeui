import sys

path = r'c:\Users\WINDOWS\Downloads\Med code updated\uicodereqeust-main\src\components\support\SupportConversationsSidebar.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Replace header and search
start = content.find('      {/* Inbox Header */}')
end = content.find('      {/* Category Filter Dropdown */}')
new_header = '''      {/* Inbox Header & Search */}
      <div className="p-3 border-b border-slate-150 flex flex-col gap-3 bg-white shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black text-slate-800 tracking-tight uppercase">Conversations</h2>
          <div className="flex items-center gap-1">
            <Button size="sm" className="h-7 rounded text-xs font-bold bg-brand-600 hover:bg-brand-700 px-2.5 shadow-sm text-white" onClick={onNewTicketClick}>
              <Plus className="mr-1 h-3.5 w-3.5" /> New
            </Button>
            <Button variant="ghost" size="icon" className="hidden lg:flex h-7 w-7 rounded text-slate-400" onClick={() => setLeftCollapsed(true)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search auth or subject..." className="h-8 rounded bg-slate-50 pl-8 text-xs font-medium border-slate-200" />
        </div>
      </div>

'''
content = content[:start] + new_header + content[end:]

# 2. Compact message items
start = content.find('              <button\n                key={item.id}')
end = content.find('            );\n          })\n        )}\n      </div>')
new_item = '''              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setSelected(item);
                  setMobileSubView("CHAT");
                }}
                className={cn(
                  "block w-full p-3 text-left transition-all border-l-4 border-b border-slate-100",
                  isSelected ? "bg-brand-50 border-brand-400" : "border-transparent hover:bg-slate-50"
                )}
              >
                <div className="flex flex-col gap-1">
                  {/* Top Row: Subject ● Status ● Date */}
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-bold text-slate-900 truncate max-w-[140px]">{item.subject || "Request Support"}</span>
                    <span className="text-slate-300 shrink-0">•</span>
                    <span className={cn("font-bold uppercase tracking-wider text-[10px] shrink-0", item.status === "closed" || item.status === "resolved" ? "text-slate-500" : "text-brand-600")}>
                      {(item.status || "open").replace(/_/g, " ")}
                    </span>
                    <span className="text-slate-300 shrink-0">•</span>
                    <span className="text-slate-500 font-medium whitespace-nowrap shrink-0 text-[10px]">
                      {item.last_message_at ? new Date(item.last_message_at).toLocaleDateString([], { day: "numeric", month: "short" }) : new Date(item.created_at).toLocaleDateString([], { day: "numeric", month: "short" })}
                    </span>
                  </div>

                  {/* Bottom Row: Hospital ● Priority */}
                  <div className="flex items-center gap-2 text-[11px] text-slate-500">
                    <span className="font-medium truncate">{name}</span>
                    {item.priority && (
                      <>
                        <span className="text-slate-300 shrink-0">•</span>
                        <span className={cn("font-bold capitalize shrink-0", item.priority === "urgent" || item.priority === "high" ? "text-rose-600" : "")}>{item.priority}</span>
                      </>
                    )}
                  </div>
                </div>
              </button>
'''
content = content[:start] + new_item + content[end:]

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("done")
