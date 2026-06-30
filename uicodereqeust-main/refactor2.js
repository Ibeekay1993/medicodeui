const fs = require('fs');
const path = require('path');

const pagesDir = path.join(__dirname, 'src/features/dashboard/pages');

const replacements = [
  {
    file: 'NhisBeneficiaryUpdatePage.tsx',
    patterns: [
      {
        from: /import \{ supabase \} from "@\/integrations\/supabase\/client";/g,
        to: 'import { useUpdateNhisBeneficiaries } from "../hooks/useAdminOps";'
      }
    ]
  },
  {
    file: 'ReportsPage.tsx',
    patterns: [
      {
        from: /import \{ supabase \} from "@\/integrations\/supabase\/client";/g,
        to: 'import { useReports } from "../hooks/useReports";'
      }
    ]
  },
  {
    file: 'RequestsPage.tsx',
    patterns: [
      {
        from: /import \{ supabase \} from "@\/integrations\/supabase\/client";/g,
        to: 'import { useRequestsQuery } from "../hooks/useRequests";'
      }
    ]
  },
  {
    file: 'SupportMessagesPage.tsx',
    patterns: [
      {
        from: /import \{ supabase \} from "@\/integrations\/supabase\/client";/g,
        to: 'import { useSupportConversations, useSupportMessages } from "../hooks/useSupport";'
      }
    ]
  },
  {
    file: 'UsersPage.tsx',
    patterns: [
      {
        from: /import \{ supabase \} from "@\/integrations\/supabase\/client";/g,
        to: 'import { useUsers, useNameChangeRequests } from "../hooks/useUsers";'
      }
    ]
  },
  {
    file: 'WhatsAppPage.tsx',
    patterns: [
      {
        from: /import \{ supabase \} from "@\/integrations\/supabase\/client";/g,
        to: ''
      }
    ]
  }
];

for (const { file, patterns } of replacements) {
  const filePath = path.join(pagesDir, file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    for (const { from, to } of patterns) {
      content = content.replace(from, to);
    }
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${file}`);
  } else {
    console.log(`File not found: ${filePath}`);
  }
}
