import os, re

files = [
    'EventAttendancePage.tsx', 
    'EventRecordsPage.tsx', 
    'EventManagementPage.tsx', 
    'OrganizerAuditLogsPage.tsx', 
    'OrganizerCorrectionRequestsPage.tsx', 
    'OrganizerProfilePage.tsx', 
    'OrganizerUserManagement.tsx', 
    'AuthenticationMethodsPage.tsx', 
    'OrganizerDashboardPage.tsx'
]

for name in files:
    path = os.path.join('src', 'features', 'organizer', 'pages', name)
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
        content = re.sub(r'\s*<h1 className="sr-only">.*?</h1>', '', content)
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Removed from {name}")
