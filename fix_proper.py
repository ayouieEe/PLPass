import os, re

files = {
    'EventAttendancePage.tsx': 'Event Attendance',
    'EventRecordsPage.tsx': 'Event Records',
    'EventManagementPage.tsx': 'Event Management',
    'OrganizerAuditLogsPage.tsx': 'Audit Logs',
    'OrganizerCorrectionRequestsPage.tsx': 'Correction Requests',
    'OrganizerProfilePage.tsx': 'Organizer Profile',
    'OrganizerUserManagement.tsx': 'User Management',
    'AuthenticationMethodsPage.tsx': 'Authentication Methods',
    'OrganizerDashboardPage.tsx': 'Organizer Dashboard'
}

for name, title in files.items():
    path = os.path.join('src', 'features', 'organizer', 'pages', name)
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # We need to find the main export function
        func_name = name.replace('.tsx', '')
        if name == 'OrganizerUserManagement.tsx':
            func_name = 'OrganizerUserManagement'
            
        pattern = rf'(export\s+(?:async\s+)?function\s+{func_name}\s*\([^)]*\)\s*{{.*?return\s*\(\s*<div[^>]*>)'
        
        # We use re.DOTALL so .*? matches newlines
        match = re.search(pattern, content, re.DOTALL)
        if match:
            # We insert it right after the opening div
            replacement = match.group(1) + f'\n      <h1 className="sr-only">{title}</h1>'
            content = content[:match.start()] + replacement + content[match.end():]
            
            with open(path, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"Added to {name}")
        else:
            print(f"Could not find main return for {name}")
