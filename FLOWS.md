# PLPass User Flow Diagrams

Complete visual flows for all pages and user journeys in the PLPass application.

---

## 1. Authentication & Access Flow

```mermaid
graph TD
    Start([User Visits App]) --> CheckAuth{Authenticated?}
    
    CheckAuth -->|No| LoginPage["🔐 Login Page<br/>/login"]
    CheckAuth -->|Yes| CheckRole{Check Role}
    
    LoginPage --> EnterCreds["Enter Email & Password"]
    EnterCreds --> ValidateCreds{Credentials Valid?}
    
    ValidateCreds -->|No| LoginError["❌ Show Error Message"]
    LoginError --> LoginPage
    
    ValidateCreds -->|Yes| RoleSelect{"Select Role/<br/>Auto-Detect"}
    
    RoleSelect -->|Organizer| OrgDash["📊 Organizer Dashboard<br/>/organizer/dashboard"]
    RoleSelect -->|Student| StudDash["📚 Student Dashboard<br/>/student/dashboard"]
    
    LoginPage --> ForgotLink["Forgot Password Link"]
    ForgotLink --> ForgotPage["🔓 Forgot Password<br/>/forgot-password"]
    ForgotPage --> ResetEmail["Send Reset Email"]
    ResetEmail --> ResetPage["🔐 Reset Password<br/>/reset-password"]
    ResetPage --> ResetSuccess["✅ Password Reset"]
    ResetSuccess --> LoginPage
    
    CheckRole -->|Organizer| OrgDash
    CheckRole -->|Student| StudDash
    CheckRole -->|Invalid| AccessDenied["❌ Access Denied<br/>/access-denied"]
    
    AccessDenied --> BackToLogin["← Back to Login"]
    BackToLogin --> LoginPage
    
    style LoginPage fill:#4CAF50
    style OrgDash fill:#2196F3
    style StudDash fill:#FF9800
    style AccessDenied fill:#f44336
    style ForgotPage fill:#9C27B0
```

---

## 2. Organizer Portal Navigation Flow

```mermaid
graph TD
    OrgDash["📊 Organizer Dashboard<br/>/organizer/dashboard"]
    
    OrgDash --> NavChoice{Sidebar Navigation}
    
    NavChoice -->|Events| EventMgmt["📅 Event Management<br/>/organizer/events"]
    NavChoice -->|Create Event| CreateEvent["✏️ Create Event<br/>/organizer/events/create"]
    NavChoice -->|Records| EventRecords["📋 Event Records<br/>/organizer/records"]
    NavChoice -->|Users| UserMgmt["👥 User Management<br/>/organizer/users"]
    NavChoice -->|Corrections| OrgCorrections["⚠️ Correction Requests<br/>/organizer/corrections"]
    NavChoice -->|Methods| AuthMethods["🔐 Authentication Methods<br/>/organizer/reports"]
    NavChoice -->|Analytics| Analytics["📈 Analytics Insights<br/>/organizer/analytics"]
    NavChoice -->|Profile| OrgProfile["👤 Organizer Profile<br/>/organizer/profile"]
    NavChoice -->|Notifications| Notif["🔔 Notifications<br/>/notifications"]
    
    EventMgmt --> EventChoice{Action}
    EventChoice -->|View Event| EventDetails["📌 Event Details<br/>/organizer/events/:eventId"]
    EventChoice -->|Create New| CreateEvent
    EventChoice -->|Back| OrgDash
    
    CreateEvent --> CreateForm["Fill Event Form<br/>- Venue<br/>- Time<br/>- Category<br/>- Objectives"]
    CreateForm --> SaveEvent["Save Event"]
    SaveEvent --> EventMgmt
    
    EventDetails --> SessionChoice{Session Action}
    SessionChoice -->|View Sessions| SessionList["List Sessions"]
    SessionChoice -->|Start New Session| EventAttendance["✅ Event Attendance<br/>/organizer/sessions/:sessionId"]
    SessionChoice -->|View Participants| ParticipantList["List Participants"]
    SessionChoice -->|Back| EventMgmt
    
    EventRecords --> RecordsFilter["Filter by:<br/>- Today<br/>- Incoming<br/>- Completed"]
    RecordsFilter --> ViewRecord{Select Record}
    ViewRecord -->|View Details| EventAttendance
    ViewRecord -->|Generate Report| ExportReport["Export Report"]
    ExportReport --> RecordsTab["Back to Records"]
    RecordsTab --> EventRecords
    
    UserMgmt --> ManageUsers["Manage Users<br/>- Add/Remove<br/>- Assign Roles<br/>- Edit Permissions"]
    ManageUsers --> OrgDash
    
    OrgCorrections --> ReviewRequests["Review Student<br/>Correction Requests"]
    ReviewRequests --> ApprovalAction{Action}
    ApprovalAction -->|Approve| Approve["✅ Approve Request"]
    ApprovalAction -->|Reject| Reject["❌ Reject Request"]
    Approve --> OrgDash
    Reject --> OrgDash
    
    AuthMethods --> ConfigAuth["Configure Auth Methods<br/>- NFC<br/>- QR Code<br/>- Facial Recognition"]
    ConfigAuth --> OrgDash
    
    Analytics --> ViewMetrics["View Analytics<br/>- Predictions<br/>- Attendance Trends<br/>- Feedback<br/>- Late Arrivals"]
    ViewMetrics --> OrgDash
    
    OrgProfile --> EditProfile["Edit Profile<br/>Settings & Logout"]
    EditProfile --> LogoutOrg["🚪 Logout"]
    LogoutOrg --> LoginPage["← Back to Login"]
    
    Notif --> ViewNotif["View Notifications"]
    ViewNotif --> OrgDash
    
    style OrgDash fill:#2196F3
    style EventMgmt fill:#2196F3
    style CreateEvent fill:#4CAF50
    style EventDetails fill:#2196F3
    style EventAttendance fill:#FF5722
    style EventRecords fill:#2196F3
    style Analytics fill:#00BCD4
    style OrgProfile fill:#757575
    style LoginPage fill:#4CAF50
```

---

## 3. Organizer Event Attendance Capture Flow

```mermaid
graph TD
    EventDetails["📌 Event Details<br/>/organizer/events/:eventId"]
    
    EventDetails --> StartSession["Click 'Start Session'"]
    StartSession --> EventAttendance["✅ Event Attendance<br/>/organizer/sessions/:sessionId"]
    
    EventAttendance --> AttendanceMenu{Capture Method}
    
    AttendanceMenu -->|QR Code| QRMethod["📱 QR Code Scanning"]
    QRMethod --> QRScan["Scan Student QR"]
    QRScan --> VerifyQR{QR Valid?}
    VerifyQR -->|Yes| RecordPresent["✅ Mark Present<br/>with timestamp"]
    VerifyQR -->|No| QRError["❌ Invalid QR"]
    QRError --> QRMethod
    
    AttendanceMenu -->|Manual Lookup| ManualMethod["🔍 Manual Student Lookup"]
    ManualMethod --> SearchStudent["Search Student by:<br/>- ID<br/>- Name<br/>- Program"]
    SearchStudent --> SelectStudent["Select Student"]
    SelectStudent --> MarkStatus{"Mark as"}
    MarkStatus -->|Present| MarkPresent["✅ Present"]
    MarkStatus -->|Late| MarkLate["⏱️ Late<br/>+ Late Reason"]
    MarkStatus -->|Absent| MarkAbsent["❌ Absent"]
    MarkPresent --> RecordPresent
    MarkLate --> RecordLate["Record Late Entry"]
    MarkAbsent --> RecordAbsent["Record Absence"]
    
    AttendanceMenu -->|Facial Recognition| FaceMethod["👤 Facial Recognition"]
    FaceMethod --> CaptureFace["Capture Face"]
    CaptureFace --> MatchFace{Match Found?}
    MatchFace -->|Yes| IdentifyStudent["Identify Student"]
    MatchFace -->|No| FaceError["❌ No Match"]
    FaceError --> FaceMethod
    IdentifyStudent --> ConfirmFace["Confirm Identity"]
    ConfirmFace --> RecordPresent
    
    RecordPresent --> ContinueCapture{Continue?}
    RecordLate --> ContinueCapture
    RecordAbsent --> ContinueCapture
    
    ContinueCapture -->|More Students| AttendanceMenu
    ContinueCapture -->|Review| SessionSummary["📋 Session Summary<br/>- Total Present<br/>- Total Late<br/>- Total Absent"]
    
    SessionSummary --> ReviewAccurate{Accurate?}
    ReviewAccurate -->|No| EditRecord["Edit Records"]
    EditRecord --> AttendanceMenu
    ReviewAccurate -->|Yes| EndSession["✅ End Session"]
    
    EndSession --> SessionComplete["Session Completed"]
    SessionComplete --> EventRecords["📋 Event Records<br/>/organizer/records"]
    
    style EventAttendance fill:#FF5722
    style RecordPresent fill:#4CAF50
    style RecordLate fill:#FFC107
    style RecordAbsent fill:#f44336
    style SessionSummary fill:#2196F3
```

---

## 4. Student Attendance Verification Flow

```mermaid
graph TD
    StudDash["📚 Student Dashboard<br/>/student/dashboard"]
    
    StudDash --> StudNavChoice{Sidebar Navigation}
    
    StudNavChoice -->|Attendance| MyAttend["📅 My Attendance<br/>/student/attendance"]
    StudNavChoice -->|Methods| AttendMethods["🔐 Verification Methods<br/>/student/methods"]
    StudNavChoice -->|Corrections| StudCorrections["⚠️ Correction Requests<br/>/student/corrections"]
    StudNavChoice -->|Reports| Reports["📊 Student Reports<br/>/student/reports"]
    StudNavChoice -->|Schedule| Schedule["📋 Schedule<br/>/student/schedule"]
    StudNavChoice -->|Profile| StudProfile["👤 Student Profile<br/>/student/profile"]
    StudNavChoice -->|Notifications| NotifStudent["🔔 Notifications<br/>/notifications"]
    
    MyAttend --> ViewAttend["View Attendance Records<br/>- Calendar View<br/>- List View"]
    ViewAttend --> FilterAttend["Filter by:<br/>- Date<br/>- Status (Present/Late/Absent)<br/>- Course"]
    FilterAttend --> CheckStatus{Check Status}
    
    CheckStatus -->|Present ✅| Present["Marked Present"]
    CheckStatus -->|Late ⏱️| Late["Marked Late"]
    CheckStatus -->|Absent ❌| Absent["Marked Absent"]
    CheckStatus -->|Discrepancy| Discrepancy["❌ Notice Error"]
    
    Present --> MoreOptions{Action?}
    Late --> MoreOptions
    Absent --> MoreOptions
    Discrepancy --> MoreOptions
    
    MoreOptions -->|Submit Correction| StudCorrections
    MoreOptions -->|View Details| RecordDetail["View Record Details<br/>- Time<br/>- Method<br/>- Reason"]
    MoreOptions -->|Back| MyAttend
    
    RecordDetail --> StudCorrections
    
    StudCorrections --> SubmitRequest["Submit Correction Request"]
    SubmitRequest --> CorrectionForm["Fill Form:<br/>- Select Attendance<br/>- Choose Reason<br/>- Add Evidence<br/>- Submit"]
    CorrectionForm --> RequestSubmitted["✅ Request Submitted"]
    RequestSubmitted --> TrackRequest["Track Request Status:<br/>- Pending<br/>- Approved<br/>- Rejected"]
    TrackRequest --> StudDash
    
    AttendMethods --> SetupMethods["Setup Verification Methods"]
    SetupMethods --> NFCSetup["🏷️ NFC Credential<br/>- Register Device/Card<br/>- Test Connection"]
    SetupMethods --> QRSetup["📱 QR Code<br/>- Generate QR<br/>- Download/Screenshot"]
    SetupMethods --> FaceSetup["👤 Facial Recognition<br/>- Capture Photos<br/>- Enroll Face"]
    NFCSetup --> MethodsComplete["✅ Methods Updated"]
    QRSetup --> MethodsComplete
    FaceSetup --> MethodsComplete
    MethodsComplete --> StudDash
    
    Reports --> GenerateReport["Generate Report<br/>- Select Period<br/>- Choose Format"]
    GenerateReport --> ReportFormat{Format}
    ReportFormat -->|PDF| ExportPDF["📄 Download PDF"]
    ReportFormat -->|Excel| ExportXcel["📊 Download Excel"]
    ExportPDF --> StudDash
    ExportXcel --> StudDash
    
    Schedule --> ViewSchedule["View Schedule<br/>- Upcoming Events<br/>- Class Timetable<br/>- Calendar View"]
    ViewSchedule --> StudDash
    
    StudProfile --> EditProfile["Edit Profile<br/>Settings & Logout"]
    EditProfile --> LogoutStud["🚪 Logout"]
    LogoutStud --> LoginPage["← Back to Login"]
    
    NotifStudent --> ViewNotif["View Notifications"]
    ViewNotif --> StudDash
    
    style StudDash fill:#FF9800
    style MyAttend fill:#FF9800
    style StudCorrections fill:#f44336
    style AttendMethods fill:#4CAF50
    style Reports fill:#00BCD4
    style LoginPage fill:#4CAF50
```

---

## 5. Complete Application Flow Map

```mermaid
graph TD
    Start([User Arrives]) --> Auth{Authenticated?}
    
    Auth -->|No| LoginPage["🔐 Login Page"]
    Auth -->|Yes| RoleCheck{User Role?}
    
    LoginPage --> LoginFlow["Authentication Flow"]
    LoginFlow --> RoleCheck
    
    RoleCheck -->|Organizer| OrgPortal["📊 Organizer Portal"]
    RoleCheck -->|Student| StudentPortal["📚 Student Portal"]
    RoleCheck -->|Invalid| AccessDenied["❌ Access Denied"]
    
    AccessDenied --> LoginPage
    
    %% Organizer Portal Paths
    OrgPortal --> OrgMain["Organizer Dashboard"]
    OrgMain --> EventMgmtPath["Event Management Path"]
    OrgMain --> RecordsPath["Records Path"]
    OrgMain --> AdminPath["Admin Path"]
    OrgMain --> AnalyticsPath["Analytics Path"]
    
    EventMgmtPath --> CreateEvent["Create Event"]
    EventMgmtPath --> ViewEvents["View Events"]
    ViewEvents --> EventDetails["Event Details"]
    EventDetails --> SessionAttendance["Event Attendance<br/>Live Capture"]
    SessionAttendance --> RecordsPath
    
    RecordsPath --> HistoricalRecords["Historical Records"]
    HistoricalRecords --> ExportReports["Export Reports"]
    
    AdminPath --> UserMgmt["User Management"]
    AdminPath --> CorrectionReview["Review Corrections"]
    AdminPath --> AuthConfig["Auth Methods Config"]
    
    AnalyticsPath --> ViewAnalytics["View Analytics<br/>Predictions & Trends"]
    
    OrgMain --> OrgProfile["Profile & Logout"]
    OrgProfile --> LogoutOrg["Logout"]
    LogoutOrg --> LoginPage
    
    %% Student Portal Paths
    StudentPortal --> StudMain["Student Dashboard"]
    StudMain --> AttendancePath["Attendance Path"]
    StudMain --> MethodsPath["Methods Path"]
    StudMain --> CorrectionPath["Correction Path"]
    StudMain --> ReportsPath["Reports Path"]
    
    AttendancePath --> ViewAttendance["View Attendance Records"]
    ViewAttendance --> CheckDiscrepancy{Discrepancy?}
    CheckDiscrepancy -->|Yes| CorrectionPath
    CheckDiscrepancy -->|No| StudMain
    
    MethodsPath --> SetupAuth["Setup Auth Methods<br/>NFC/QR/Facial"]
    SetupAuth --> StudMain
    
    CorrectionPath --> SubmitCorrection["Submit Correction<br/>Request"]
    SubmitCorrection --> TrackCorrection["Track Status"]
    TrackCorrection --> StudMain
    
    ReportsPath --> GenerateReport["Generate Report<br/>PDF/Excel"]
    GenerateReport --> StudMain
    
    StudMain --> StudProfile["Profile & Logout"]
    StudProfile --> LogoutStud["Logout"]
    LogoutStud --> LoginPage
    
    %% Shared Features
    OrgPortal -.->|Cross-Portal| SharedNotif["🔔 Notifications"]
    StudentPortal -.->|Cross-Portal| SharedNotif
    SharedNotif -.-> OrgPortal
    SharedNotif -.-> StudentPortal
    
    style LoginPage fill:#4CAF50
    style OrgPortal fill:#2196F3
    style StudentPortal fill:#FF9800
    style AccessDenied fill:#f44336
    style SessionAttendance fill:#FF5722
    style SharedNotif fill:#9C27B0
```

---

## 6. Page-by-Page Quick Reference

### Public Pages
| Page | Route | Entry Point | Next Pages |
|------|-------|------------|-----------|
| **Login** | `/login` | Start | Dashboard (role-based), Forgot Password |
| **Forgot Password** | `/forgot-password` | Login link | Reset Password |
| **Reset Password** | `/reset-password` | Email link | Login |
| **Access Denied** | `/access-denied` | Invalid role | Login |
| **Profile** | `/profile` | Header (role-aware) | Previous page, Logout → Login |
| **Notifications** | `/notifications` | Header bell | Previous page |
| **Not Found** | `/*` | Invalid URL | Any route |

### Organizer Pages
| Page | Route | Parent | Child Pages |
|------|-------|--------|------------|
| **Dashboard** | `/organizer/dashboard` | Portal Root | All organizer pages |
| **Event Management** | `/organizer/events` | Dashboard | Event Details, Create Event |
| **Create Event** | `/organizer/events/create` | Event Management | Event Management |
| **Event Details** | `/organizer/events/:eventId` | Event Management | Event Attendance, Event Details (sessions tab) |
| **Event Attendance** | `/organizer/sessions/:sessionId` | Event Details | Event Records |
| **Event Records** | `/organizer/records` | Dashboard | Event Attendance, Dashboard |
| **User Management** | `/organizer/users` | Dashboard | Dashboard |
| **Corrections** | `/organizer/corrections` | Dashboard | Dashboard |
| **Auth Methods** | `/organizer/reports` | Dashboard | Dashboard |
| **Analytics** | `/organizer/analytics` | Dashboard | Dashboard |
| **Profile** | `/organizer/profile` | Header | Logout → Login |

### Student Pages
| Page | Route | Parent | Child Pages |
|------|-------|--------|------------|
| **Dashboard** | `/student/dashboard` | Portal Root | All student pages |
| **My Attendance** | `/student/attendance` | Dashboard | Student Corrections, Dashboard |
| **Verification Methods** | `/student/methods` | Dashboard | Dashboard |
| **Correction Requests** | `/student/corrections` | Dashboard, My Attendance | Dashboard |
| **Reports** | `/student/reports` | Dashboard | Dashboard |
| **Schedule** | `/student/schedule` | Dashboard | Dashboard |
| **Profile** | `/student/profile` | Header | Logout → Login |

---

## 7. Critical User Journeys

### Journey 1: Organizer Creates Event and Takes Attendance
```
Dashboard → Events → Create Event → Fill Form → Save
→ Events → View Event → Start Session → Capture Attendance (QR/Manual/Facial)
→ Review Summary → End Session → Records → View Session Record
```

### Journey 2: Student Discovers Attendance Error and Requests Correction
```
Dashboard → My Attendance → Filter by Status → Find Error
→ Submit Correction Request → Upload Evidence → Track Status
→ Wait for Approval → Check Dashboard for Result
```

### Journey 3: Organizer Reviews Analytics and Predictions
```
Dashboard → Analytics → View Predictions → Check Attendance Trends
→ Review Feedback Insights → Analyze Late Arrivals → Export Report
```

### Journey 4: Student Sets Up Verification Methods
```
Dashboard → Methods → Register NFC → Generate QR → Enable Facial
→ Test Methods → Back to Dashboard → Ready for Attendance
```

### Journey 5: Both Roles Access Notifications
```
Any Page → Click Notifications Bell → View Notifications
→ Take Action (if needed) → Back to Previous Page
```

---

## Flow Legend

| Symbol | Meaning |
|--------|---------|
| 🔐 | Security/Authentication |
| 📊 | Analytics/Dashboard |
| 📚 | Student Portal |
| 📅 | Events/Calendar |
| ✅ | Attendance/Completion |
| ⏱️ | Time/Late |
| ❌ | Errors/Denied |
| 🔔 | Notifications |
| 👥 | Users/Admin |
| 🔍 | Search/Lookup |
| 📱 | QR Code |
| 🏷️ | NFC |
| 👤 | Facial Recognition |
| 💾 | Save/Export |
| 🚪 | Logout |

