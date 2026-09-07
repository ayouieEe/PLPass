import os
import re

files = {
    'EventAttendancePage.tsx': 'Event Attendance',
    'EventRecordsPage.tsx': 'Event Records',
    'EventManagementPage.tsx': 'Event Management',
    'OrganizerAuditLogsPage.tsx': 'Audit Logs',
    'OrganizerCorrectionRequestsPage.tsx': 'Correction Requests',
    'OrganizerProfilePage.tsx': 'Organizer Profile',
    'OrganizerUserManagement.tsx': 'User Management',
    'AuthenticationMethodsPage.tsx': 'Authentication Methods',
    'OrganizerDashboardPage.tsx': 'Dashboard'
}

for name, title in files.items():
    path = os.path.join('src', 'features', 'organizer', 'pages', name)
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Replace the first instance of 'return (\n    <div'
        content = re.sub(r'return\s*\(\s*<div([^>]*)>', f'return (\\n    <div\\1>\\n      <h1 className="sr-only">{title}</h1>', content, count=1)
        
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated {name}")
