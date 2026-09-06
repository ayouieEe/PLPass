import { beforeEach, describe, expect, it, vi } from "vitest";
import { synchronizePendingAttendance } from "@/features/offline/offlineService";
import type { PendingAttendanceRecord, PLPassDesktopApi } from "@/features/offline/types";

const rpc=vi.fn(); const maybeSingle=vi.fn(); const getUser=vi.fn();
vi.mock("@/lib/supabase/client",()=>({getSupabaseBrowserClient:()=>({auth:{getUser},rpc,from:()=>({select:()=>({eq:()=>({maybeSingle})})})})}));
const record:PendingAttendanceRecord={localAttendanceUuid:"local-1",eventId:"event-1",sessionId:"session-1",studentId:"student-1",identificationMethod:"qr",attendanceTimestamp:"2026-09-05T00:15:00.000Z",attendanceStatus:"present",timeIn:"2026-09-05T00:15:00.000Z",syncStatus:"PENDING_SYNC",syncAttempts:0,createdAt:"2026-09-05T00:15:00.000Z",updatedAt:"2026-09-05T00:15:00.000Z"};
function api(){return {recoverInterruptedSync:vi.fn().mockResolvedValue(0),beginSync:vi.fn().mockResolvedValue([record]),confirmSync:vi.fn().mockResolvedValue(undefined),failSync:vi.fn().mockResolvedValue(undefined)} as unknown as PLPassDesktopApi;}
describe("offline synchronization",()=>{beforeEach(()=>{vi.clearAllMocks();getUser.mockResolvedValue({data:{user:{id:"organizer"}},error:null});});
  it("confirms an idempotent upload",async()=>{const local=api();window.plpassDesktop=local;rpc.mockResolvedValue({data:{id:"server-1",local_attendance_uuid:"local-1"},error:null});expect(await synchronizePendingAttendance()).toEqual({confirmed:1,failed:0});expect(local.confirmSync).toHaveBeenCalledWith("local-1","server-1");});
  it("recovers a lost success response by querying the UUID",async()=>{const local=api();window.plpassDesktop=local;rpc.mockRejectedValue(new Error("response lost"));maybeSingle.mockResolvedValue({data:{id:"server-1",local_attendance_uuid:"local-1"}});expect(await synchronizePendingAttendance()).toEqual({confirmed:1,failed:0});expect(local.failSync).not.toHaveBeenCalled();});
  it("retains network failures for retry",async()=>{const local=api();window.plpassDesktop=local;rpc.mockResolvedValue({data:null,error:{code:"NETWORK"}});maybeSingle.mockRejectedValue(new Error("offline"));expect(await synchronizePendingAttendance()).toEqual({confirmed:0,failed:1});expect(local.failSync).toHaveBeenCalledWith("local-1","RETRY",expect.any(String));});
  it("retains genuine central conflicts",async()=>{const local=api();window.plpassDesktop=local;rpc.mockResolvedValue({data:null,error:{code:"40001"}});maybeSingle.mockResolvedValue({data:null});await synchronizePendingAttendance();expect(local.failSync).toHaveBeenCalledWith("local-1","CONFLICT",expect.any(String));});
});
