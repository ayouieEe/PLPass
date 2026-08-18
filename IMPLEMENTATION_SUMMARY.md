# Live Session Attendance - Implementation Summary

## Overview
This implementation adds check-in/check-out functionality to the Live Session page of the Organizer Dashboard. Students can check in using QR Code or Manual methods (Facial Recognition backend ready, awaiting organizer UI integration), and check out using any of the same methods.

## Key Changes

### 1. Database Migration
**File**: `supabase/migrations/20260816130000_support_checkin_checkout_methods.sql`

Added support for tracking which verification method was used for check-out:
- New column: `checkout_verification_method` (text, nullable)
- Constraint: Only allows 'qr', 'facial', 'manual' values
- Constraint: If set, `time_out` must also be set

### 2. Type Definitions
**File**: `src/types/domain.ts`

Updated `AttendanceRecord` type:
- Added `checkoutVerificationMethod?: VerificationMethod` - tracks which method was used for check-out
- Renamed `timeOut` to `checkedOutAt` - matches UI expectations in EventManagementPage

```typescript
export type AttendanceRecord = {
  id: string;
  sessionId: string;
  studentId: string;
  status: AttendanceStatus;
  verificationMethod: VerificationMethod;  // Check-in method
  checkoutVerificationMethod?: VerificationMethod;  // Check-out method (NEW)
  recordedAt: string;
  recordedByUserId?: string;
  note?: string;
  lateReasonCategory?: string;
  timeIn?: string;
  checkedOutAt?: string;  // Previously timeOut, renamed for UI
  lateReason?: string;
};
```

### 3. Data Mappers
**File**: `src/lib/supabase/mappers.ts`

Updated `mapAttendanceRecord()` to:
- Map database `time_out` column to `checkedOutAt` type field
- Map database `checkout_verification_method` to `checkoutVerificationMethod` type field

### 4. Attendance Recording Logic
**File**: `src/services/supabase/repositories.ts`

#### recordCredentialAttendance() (QR attendance)
**New Check-In/Check-Out Flow:**
1. Check if attendance record exists for student in session
2. If NO record exists:
   - CREATE CHECK-IN: Insert new record with `time_in = occurredAt`
   - Set `verification_method = "qr"`
   - Return success status "Present"

3. If record exists AND `time_out` is NULL:
   - UPDATE CHECK-OUT: Set `time_out = occurredAt` and `checkout_verification_method = "qr"`
   - Return success status "Present"
   
4. If record exists AND BOTH `time_in` and `time_out` are set:
   - REJECT: Return "Already Recorded" status
   - Prevent duplicate attendance attempts

#### recordManualAttendance() (Manual attendance)
**Same Check-In/Check-Out Flow:**
1. Similar logic as credential attendance, but for manual entries
2. Supports status override (present/late) and late reasons
3. Tracks `checkout_verification_method = "manual"` on check-out

**Key Behaviors:**
- Late cutoff validation only applies to CHECK-IN
- Check-out can occur after session ends (no time window restriction)
- Different methods can be used for check-in and check-out
- Late reason can only be provided during initial check-in if overriding to "late" status

### 5. How Check-In/Check-Out Works

#### Example 1: QR Only
```
1. Student scans QR at 13:00
   → Record created: time_in=13:00, verification_method="qr"
   
2. Student scans QR again at 14:00
   → Record updated: time_out=14:00, checkout_verification_method="qr"
   
3. Student scans QR again at 14:30
   → Already Recorded - no further changes
```

#### Example 2: QR Check-in, Manual Check-out
```
1. Student scans QR at 13:00
   → Record created: time_in=13:00, verification_method="qr"
   
2. Organizer manually marks present for check-out at 14:00
   → Record updated: time_out=14:00, checkout_verification_method="manual"
```

#### Example 3: Manual Check-in (Late), QR Check-out
```
1. Organizer marks student late at 13:20 (after 13:15 cutoff)
   → Record created: time_in=13:20, verification_method="manual", 
                   attendance_status="late", late_reason_category="Traffic / Commute"
   
2. Student scans QR at 14:00
   → Record updated: time_out=14:00, checkout_verification_method="qr"
   → Attendance status remains "late"
```

### 6. UI Integration

The EventManagementPage already had:
- Three attendance method buttons (QR Code, Facial Recognition, Manual)
- Manual attendance form with late status selection and reason dropdown
- Attendance table with student names and attendance details
- Session summary tiles (Present, Late, Absent, Rate)

**Changes Made:**
- No UI changes required - all functionality connects to existing controls
- The attendance table now displays both check-in and check-out times
- `checkedOutAt` field from backend maps to existing UI expectations

### 7. Data Flow

```
Live Session UI
    ↓ (recordManualAttendance mutation)
React Query Hook (useAttendanceSubmissionMutations)
    ↓
Repository Function (recordManualAttendance/recordCredentialAttendance)
    ↓
Supabase Client
    ↓
Attendance Records Table
    ↓ (Query Invalidation)
React Query Cache Updated
    ↓
UI Re-renders with Latest Attendance
```

### 8. Validation & Error Handling

**Input Validation:**
- Session must be active
- Student must exist and be enrolled in event
- QR credentials must be valid and activated
- Attendance must be within attendance window (check-in only)
- Cannot check out before checking in (database constraint)

**Error Handling:**
- Returns specific result status for UI feedback
- Invalid credentials → "Invalid Credential"
- Student not enrolled → "Student Not Enrolled"
- Session not active → "No Active Session"
- Outside attendance window → "Outside Attendance Window"
- Already recorded after checkout → "Already Recorded"
- Database errors → Proper error logging and UI notification

### 9. Backward Compatibility

- Existing attendance records without `checkout_verification_method` remain valid
- Migration adds optional field, doesn't break existing data
- UI correctly handles missing `checkedOutAt` value (displays as empty)
- All existing status values ('present', 'late', 'absent', 'excused') continue to work

### 10. Facial Recognition Support

Currently returns: "Facial verification is not enabled for live check-in yet."

**Next Steps for Facial Recognition:**
1. Implement facial verification capture in organizer portal (camera integration)
2. Call `recordCredentialAttendance()` with `method: "facial"` and facial profile ID
3. Backend will lookup facial profile and apply same check-in/check-out logic
4. Update error message when implementation is ready

## Testing

See `tests/attendance-checkin-checkout.test.ts` for comprehensive test scenarios:
- QR check-in/check-out
- Manual check-in/check-out
- Mixed method scenarios
- Duplicate prevention
- Status constraints
- Verification method tracking

## Files Modified

1. `supabase/migrations/20260816130000_support_checkin_checkout_methods.sql` - NEW
2. `src/types/domain.ts` - Updated AttendanceRecord type
3. `src/lib/supabase/mappers.ts` - Updated mapAttendanceRecord function
4. `src/services/supabase/repositories.ts` - Updated attendance recording functions
5. `tests/attendance-checkin-checkout.test.ts` - NEW test scenarios

## No UI Changes Required

The existing EventManagementPage Live Session interface remains unchanged:
- All existing buttons and controls work as before
- Manual attendance form functions as designed
- Attendance table displays correctly
- No visual changes or restructuring
