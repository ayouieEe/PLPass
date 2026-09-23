import { beforeEach, describe, expect, it, vi } from "vitest";
import { reconcileOfflineEventLifecycle, synchronizePendingAttendance } from "@/features/offline/offlineService";
import type { PendingAttendanceRecord, PLPassDesktopApi } from "@/features/offline/types";

const rpc=vi.fn(); const maybeSingle=vi.fn(); const getUser=vi.fn(); const from=vi.fn();
vi.mock("@/lib/supabase/client",()=>({getSupabaseBrowserClient:()=>({auth:{getUser},rpc,from})}));
const record:PendingAttendanceRecord={localAttendanceUuid:"local-1",eventId:"event-1",sessionId:"session-1",studentId:"student-1",identificationMethod:"qr",attendanceTimestamp:"2026-09-05T00:15:00.000Z",attendanceStatus:"present",timeIn:"2026-09-05T00:15:00.000Z",syncStatus:"PENDING_SYNC",syncAttempts:0,createdAt:"2026-09-05T00:15:00.000Z",updatedAt:"2026-09-05T00:15:00.000Z"};
function api(){return {recoverInterruptedSync:vi.fn().mockResolvedValue(0),beginSync:vi.fn().mockResolvedValue([record]),confirmSync:vi.fn().mockResolvedValue(undefined),failSync:vi.fn().mockResolvedValue(undefined),hasUnresolvedWork:vi.fn().mockResolvedValue(false),listPending:vi.fn().mockResolvedValue([]),beginWalkInSync:vi.fn().mockResolvedValue([]),listPendingWalkInScans:vi.fn().mockResolvedValue([]),confirmWalkInSync:vi.fn().mockResolvedValue(undefined),discardWalkInSync:vi.fn().mockResolvedValue(undefined),failWalkInSync:vi.fn().mockResolvedValue(undefined)} as unknown as PLPassDesktopApi;}
describe("offline synchronization",()=>{beforeEach(()=>{vi.clearAllMocks();getUser.mockResolvedValue({data:{user:{id:"organizer"}},error:null});from.mockImplementation(()=>({select:()=>({eq:()=>({maybeSingle})})}));});
  it("confirms an idempotent upload with a bounded batch",async()=>{const local=api();window.plpassDesktop=local;rpc.mockResolvedValue({data:{id:"server-1",local_attendance_uuid:"local-1"},error:null});expect(await synchronizePendingAttendance(1000,false,false,"organizer")).toEqual({confirmed:1,failed:0,discarded:0});expect(local.beginSync).toHaveBeenCalledWith(20,false,"organizer");expect(local.confirmSync).toHaveBeenCalledWith("local-1","server-1");});
  it("recovers a lost success response by querying the UUID",async()=>{const local=api();window.plpassDesktop=local;rpc.mockRejectedValue(new Error("response lost"));maybeSingle.mockResolvedValue({data:{id:"server-1",local_attendance_uuid:"local-1"}});expect(await synchronizePendingAttendance(20,false,false,"organizer")).toEqual({confirmed:1,failed:0,discarded:0});expect(local.failSync).not.toHaveBeenCalled();});
  it("retains network failures for retry",async()=>{const local=api();window.plpassDesktop=local;rpc.mockResolvedValue({data:null,error:{code:"NETWORK"}});maybeSingle.mockRejectedValue(new Error("offline"));expect(await synchronizePendingAttendance(20,false,false,"organizer")).toEqual({confirmed:0,failed:1,discarded:0});expect(local.failSync).toHaveBeenCalledWith("local-1","RETRY",expect.any(String));});
  it("backs off a server throttle without issuing a follow-up attendance query",async()=>{const local=api();window.plpassDesktop=local;rpc.mockResolvedValue({data:null,error:null});expect(await synchronizePendingAttendance(20,true,false,"organizer")).toEqual({confirmed:0,failed:1,discarded:0});expect(local.failSync).toHaveBeenCalledWith("local-1","RETRY",expect.stringContaining("rate limited"));expect(maybeSingle).not.toHaveBeenCalled();});
  it("retains genuine central conflicts and backs off retries",async()=>{const local=api();window.plpassDesktop=local;rpc.mockResolvedValue({data:null,error:{code:"40001"}});maybeSingle.mockResolvedValue({data:null});await synchronizePendingAttendance(20,true,false,"organizer");expect(local.failSync).toHaveBeenCalledWith("local-1","CONFLICT",expect.any(String));const beginCalls=vi.mocked(local.beginSync).mock.calls.length;expect(await synchronizePendingAttendance(20,false,false,"organizer")).toEqual({confirmed:0,failed:0,discarded:0});expect(local.beginSync).toHaveBeenCalledTimes(beginCalls);});
  it("does not retry permanent authorization failures",async()=>{const local=api();window.plpassDesktop=local;rpc.mockResolvedValue({data:null,error:{code:"42501",message:"An active organizer account is required."}});maybeSingle.mockResolvedValue({data:null});await synchronizePendingAttendance(20,true,false,"organizer");expect(local.failSync).toHaveBeenCalledWith("local-1","CONFLICT",expect.any(String));const beginCalls=vi.mocked(local.beginSync).mock.calls.length;expect(await synchronizePendingAttendance(20,false,false,"organizer")).toEqual({confirmed:0,failed:0,discarded:0});expect(local.beginSync).toHaveBeenCalledTimes(beginCalls);});
  it("lets an explicit retry bypass automatic backoff",async()=>{const local=api();window.plpassDesktop=local;rpc.mockResolvedValueOnce({data:null,error:{code:"NETWORK"}}).mockResolvedValueOnce({data:{id:"server-1",local_attendance_uuid:"local-1"},error:null});maybeSingle.mockResolvedValue({data:null});await synchronizePendingAttendance(20,true,false,"organizer");expect(await synchronizePendingAttendance(20,true,false,"organizer")).toEqual({confirmed:1,failed:0,discarded:0});expect(local.beginSync).toHaveBeenCalledTimes(2);});
  it("discards only a server-confirmed permanent walk-in conflict",async()=>{const walkIn={localScanUuid:"walkin-1",eventId:"event-1",sessionId:"session-1",studentNumber:"23-00265",identificationMethod:"manual" as const,timeIn:record.timeIn,syncStatus:"CONFLICT" as const,syncAttempts:1,createdAt:record.createdAt,updatedAt:record.updatedAt};const local={...api(),beginSync:vi.fn().mockResolvedValue([]),beginWalkInSync:vi.fn().mockResolvedValue([walkIn])} as unknown as PLPassDesktopApi;window.plpassDesktop=local;rpc.mockResolvedValue({data:{disposition:"discarded_permanent_conflict",reasonCode:"no_active_enrolled_student"},error:null});expect(await synchronizePendingAttendance(20,true,true,"organizer")).toEqual({confirmed:0,failed:0,discarded:1});expect(local.discardWalkInSync).toHaveBeenCalledWith("walkin-1","organizer");expect(local.failWalkInSync).not.toHaveBeenCalled();});
  it("keeps an unexpected walk-in failure retryable",async()=>{const walkIn={localScanUuid:"walkin-1",eventId:"event-1",sessionId:"session-1",studentNumber:"23-00265",identificationMethod:"manual" as const,timeIn:record.timeIn,syncStatus:"PENDING_SYNC" as const,syncAttempts:0,createdAt:record.createdAt,updatedAt:record.updatedAt};const local={...api(),beginSync:vi.fn().mockResolvedValue([]),beginWalkInSync:vi.fn().mockResolvedValue([walkIn])} as unknown as PLPassDesktopApi;window.plpassDesktop=local;rpc.mockResolvedValue({data:null,error:{code:"NETWORK"}});expect(await synchronizePendingAttendance(20,true,true,"organizer")).toEqual({confirmed:0,failed:1,discarded:0});expect(local.failWalkInSync).toHaveBeenCalledWith("walkin-1","RETRY",expect.any(String));expect(local.discardWalkInSync).not.toHaveBeenCalled();});
  it("reconciles an offline start, then ends only with the exact prepared roster",async()=>{
    const session={id:"session-1",eventId:"event-1",title:"Event",venue:"Hall",status:"completed",startsAt:"2026-09-05T00:00:00.000Z",endsAt:"2026-09-05T03:00:00.000Z",offlineLifecycle:"END_PENDING",offlineStartedAt:"2026-09-05T00:15:00.000Z",offlineEndedAt:"2026-09-05T02:00:00.000Z",offlineStartReconciledAt:"2026-09-05T00:16:00.000Z"};
    const pkg={event:{id:"event-1",code:"EVT-1",title:"Event",status:"scheduled",startsAt:session.startsAt,endsAt:session.endsAt},sessions:[session],participants:[{studentId:"student-1",studentNumber:"S1",displayName:"Student One",participantStatus:"active",faceEmbeddings:[]},{studentId:"student-2",studentNumber:"S2",displayName:"Student Two",participantStatus:"active",faceEmbeddings:[]}],attendance:[]} ;
    const local={...api(),listPreparedEvents:vi.fn().mockResolvedValue([{event:pkg.event,sessionId:"session-1",lifecycle:"END_PENDING"}]),getPreparedEvent:vi.fn().mockResolvedValue(pkg),setOfflineLifecycleState:vi.fn().mockResolvedValue(undefined),listPending:vi.fn().mockResolvedValue([]),listPendingWalkInScans:vi.fn().mockResolvedValue([]),beginSync:vi.fn().mockResolvedValue([])} as unknown as PLPassDesktopApi;
    window.plpassDesktop=local;
    rpc.mockResolvedValue({data:{id:"session-1"},error:null});
    expect(await reconcileOfflineEventLifecycle("organizer",true)).toMatchObject({completed:true});
    expect(rpc).toHaveBeenCalledWith("reconcile_offline_event_session_end",{p_session_id:"session-1",p_actual_end:session.offlineEndedAt,p_reason:"Organizer ended this session offline.",p_expected_student_ids:["student-1","student-2"]});
    expect(rpc).not.toHaveBeenCalledWith("reconcile_offline_event_session_start",expect.anything());
    expect(local.setOfflineLifecycleState).toHaveBeenCalledWith("event-1","session-1","ENDED");
  });
  it("uploads pending attendance for a session already marked STARTED during global reconnect",async()=>{
    const local=api();
    local.listPreparedEvents=vi.fn().mockResolvedValue([{event:{id:"event-1",code:"EVT-1",title:"Event",status:"ongoing",startsAt:record.createdAt,endsAt:record.createdAt},sessionId:"session-1",lifecycle:"STARTED",preparedAt:record.createdAt,cacheVersion:1}]);
    window.plpassDesktop=local;
    rpc.mockResolvedValue({data:{id:"server-1",local_attendance_uuid:"local-1"},error:null});
    expect(await reconcileOfflineEventLifecycle("organizer",true,true)).toMatchObject({completed:true});
    expect(rpc).toHaveBeenCalledWith("sync_offline_event_attendance",expect.objectContaining({p_local_attendance_uuid:"local-1"}));
    expect(local.confirmSync).toHaveBeenCalledWith("local-1","server-1");
  });
  it("reconciles older unresolved sessions even when the event summary points to the latest session",async()=>{
    const older={id:"session-old",eventId:"event-1",title:"Earlier",venue:"Hall",status:"ongoing",startsAt:"2026-09-05T00:00:00.000Z",endsAt:"2026-09-05T01:00:00.000Z",offlineLifecycle:"START_PENDING",offlineStartedAt:"2026-09-05T00:10:00.000Z",offlineEndedAt:null,offlineStartReconciledAt:null};
    const latest={id:"session-latest",eventId:"event-1",title:"Latest",venue:"Hall",status:"completed",startsAt:"2026-09-05T02:00:00.000Z",endsAt:"2026-09-05T03:00:00.000Z",offlineLifecycle:"END_PENDING",offlineStartedAt:"2026-09-05T02:10:00.000Z",offlineEndedAt:"2026-09-05T02:50:00.000Z",offlineStartReconciledAt:"2026-09-05T02:11:00.000Z"};
    const pkg={event:{id:"event-1",code:"EVT-1",title:"Event",status:"ongoing",startsAt:older.startsAt,endsAt:latest.endsAt},sessions:[older,latest],participants:[],attendance:[]};
    const local={...api(),listPreparedEvents:vi.fn().mockResolvedValue([{event:pkg.event,sessionId:latest.id,lifecycle:"END_PENDING"}]),getPreparedEvent:vi.fn().mockResolvedValue(pkg),setOfflineLifecycleState:vi.fn().mockResolvedValue(undefined),listPending:vi.fn().mockResolvedValue([]),listPendingWalkInScans:vi.fn().mockResolvedValue([]),beginSync:vi.fn().mockResolvedValue([])} as unknown as PLPassDesktopApi;
    window.plpassDesktop=local;
    rpc.mockResolvedValue({data:{id:"session"},error:null});
    expect(await reconcileOfflineEventLifecycle("organizer",true,true)).toMatchObject({completed:true});
    expect(rpc).toHaveBeenCalledWith("reconcile_offline_event_session_start",{p_session_id:older.id,p_actual_start:older.offlineStartedAt});
    expect(rpc).toHaveBeenCalledWith("reconcile_offline_event_session_end",expect.objectContaining({p_session_id:latest.id}));
  });
  it("re-reads lifecycle state before ending a session started during the same reconnect",async()=>{
    const startPending={id:"session-1",eventId:"event-1",title:"Event",venue:"Hall",status:"ongoing",startsAt:"2026-09-05T00:00:00.000Z",endsAt:"2026-09-05T03:00:00.000Z",offlineLifecycle:"START_PENDING",offlineStartedAt:"2026-09-05T00:15:00.000Z",offlineEndedAt:"2026-09-05T02:00:00.000Z",offlineStartReconciledAt:null};
    const endPending={...startPending,offlineLifecycle:"END_PENDING",offlineStartReconciledAt:"2026-09-05T00:16:00.000Z"} as typeof startPending & { offlineStartReconciledAt: string };
    const pkg=(localSession: typeof startPending)=>({event:{id:"event-1",code:"EVT-1",title:"Event",status:"completed",startsAt:startPending.startsAt,endsAt:startPending.endsAt},sessions:[localSession],participants:[],attendance:[]});
    const local={...api(),listPreparedEvents:vi.fn().mockResolvedValue([{event:pkg(startPending).event,sessionId:startPending.id,lifecycle:"START_PENDING"}]),getPreparedEvent:vi.fn().mockResolvedValueOnce(pkg(startPending)).mockResolvedValueOnce(pkg(endPending)),setOfflineLifecycleState:vi.fn().mockResolvedValue(undefined),listPending:vi.fn().mockResolvedValue([]),listPendingWalkInScans:vi.fn().mockResolvedValue([]),beginSync:vi.fn().mockResolvedValue([])} as unknown as PLPassDesktopApi;
    window.plpassDesktop=local;
    rpc.mockResolvedValue({data:{id:"session-1"},error:null});
    expect(await reconcileOfflineEventLifecycle("organizer",true)).toMatchObject({completed:true});
    expect(rpc).toHaveBeenCalledWith("reconcile_offline_event_session_start",expect.anything());
    expect(rpc).toHaveBeenCalledWith("reconcile_offline_event_session_end",expect.objectContaining({p_session_id:"session-1"}));
  });
  it("retains an offline end for retry after a transient server failure",async()=>{
    const session={id:"session-1",eventId:"event-1",title:"Event",venue:"Hall",status:"completed",startsAt:"2026-09-05T00:00:00.000Z",endsAt:"2026-09-05T03:00:00.000Z",offlineLifecycle:"END_PENDING",offlineStartedAt:"2026-09-05T00:15:00.000Z",offlineEndedAt:"2026-09-05T02:00:00.000Z",offlineStartReconciledAt:"2026-09-05T00:16:00.000Z"};
    const pkg={event:{id:"event-1",code:"EVT-1",title:"Event",status:"completed",startsAt:session.startsAt,endsAt:session.endsAt},sessions:[session],participants:[],attendance:[]};
    const local={...api(),listPreparedEvents:vi.fn().mockResolvedValue([{event:pkg.event,sessionId:session.id,lifecycle:"END_PENDING"}]),getPreparedEvent:vi.fn().mockResolvedValue(pkg),setOfflineLifecycleState:vi.fn().mockResolvedValue(undefined),listPending:vi.fn().mockResolvedValue([]),listPendingWalkInScans:vi.fn().mockResolvedValue([]),hasUnresolvedWork:vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false),beginSync:vi.fn().mockResolvedValue([])} as unknown as PLPassDesktopApi;
    window.plpassDesktop=local;
    rpc.mockResolvedValueOnce({data:null,error:{code:"NETWORK",message:"temporary outage"}}).mockResolvedValueOnce({data:{id:"session-1"},error:null});
    expect(await reconcileOfflineEventLifecycle("organizer",true,true)).toMatchObject({completed:false});
    expect(local.setOfflineLifecycleState).not.toHaveBeenCalledWith("event-1","session-1","ENDED");
    expect(await reconcileOfflineEventLifecycle("organizer",true,true)).toMatchObject({completed:true});
    expect(local.setOfflineLifecycleState).toHaveBeenCalledWith("event-1","session-1","ENDED");
  });
  it("does not create a conflict when an end response is lost after server completion",async()=>{
    let sessionReadCount=0;
    from.mockImplementation(()=>({select:()=>({in:vi.fn().mockImplementation(async()=>{
      sessionReadCount+=1;
      return {data:sessionReadCount === 1 ? [{id:"session-1",event_id:"event-1",session_status:"ongoing"}] : [{id:"session-1",event_id:"event-1",session_status:"completed",actual_end:"2026-09-05T02:00:00.000Z"}],error:null};
    })})}));
    const session={id:"session-1",eventId:"event-1",title:"Event",venue:"Hall",status:"completed",startsAt:"2026-09-05T00:00:00.000Z",endsAt:"2026-09-05T03:00:00.000Z",offlineLifecycle:"END_PENDING",offlineStartedAt:"2026-09-05T00:15:00.000Z",offlineEndedAt:"2026-09-05T02:00:00.000Z",offlineStartReconciledAt:"2026-09-05T00:16:00.000Z"};
    const pkg={event:{id:"event-1",code:"EVT-1",title:"Event",status:"completed",startsAt:session.startsAt,endsAt:session.endsAt},sessions:[session],participants:[],attendance:[]};
    const local={...api(),listPreparedEvents:vi.fn().mockResolvedValue([{event:pkg.event,sessionId:session.id,lifecycle:"END_PENDING"}]),getPreparedEvent:vi.fn().mockResolvedValue(pkg),setOfflineLifecycleState:vi.fn().mockResolvedValue(undefined),listPending:vi.fn().mockResolvedValue([]),listPendingWalkInScans:vi.fn().mockResolvedValue([]),beginSync:vi.fn().mockResolvedValue([])} as unknown as PLPassDesktopApi;
    window.plpassDesktop=local;
    rpc.mockResolvedValue({data:null,error:{code:"NETWORK",message:"response lost"}});
    expect(await reconcileOfflineEventLifecycle("organizer",true,true)).toMatchObject({completed:true});
    expect(local.setOfflineLifecycleState).toHaveBeenCalledWith("event-1","session-1","ENDED");
    expect(local.setOfflineLifecycleState).not.toHaveBeenCalledWith("event-1","session-1","CONFLICT");
  });
  it("fails closed when the server session is ongoing but local end evidence is missing",async()=>{
    from.mockImplementation(()=>({select:()=>({in:vi.fn().mockResolvedValue({data:[{id:"session-1",event_id:"event-1",session_status:"ongoing"}],error:null})})}));
    const session={id:"session-1",eventId:"event-1",title:"Event",venue:"Hall",status:"scheduled",startsAt:"2026-09-05T00:00:00.000Z",endsAt:"2026-09-05T03:00:00.000Z",offlineLifecycle:"NOT_STARTED" as const,offlineStartedAt:null,offlineEndedAt:null,offlineStartReconciledAt:null};
    const pkg={event:{id:"event-1",code:"EVT-1",title:"Event",status:"scheduled",startsAt:session.startsAt,endsAt:session.endsAt},sessions:[session],participants:[],attendance:[]};
    const local={...api(),listPreparedEvents:vi.fn().mockResolvedValue([{event:pkg.event,sessionId:session.id,lifecycle:"NOT_STARTED"}]),getPreparedEvent:vi.fn().mockResolvedValue(pkg),setOfflineLifecycleState:vi.fn().mockResolvedValue(undefined)} as unknown as PLPassDesktopApi;
    window.plpassDesktop=local;
    expect(await reconcileOfflineEventLifecycle("organizer",true)).toMatchObject({completed:false,message:expect.stringContaining("no local end record")});
    expect(rpc).not.toHaveBeenCalledWith("reconcile_offline_event_session_end",expect.anything());
  });
  it("clears a local conflict only after a matching server session is confirmed completed",async()=>{
    from.mockImplementation(()=>({select:()=>({in:vi.fn().mockResolvedValue({data:[{id:"session-1",event_id:"event-1",session_status:"completed",actual_end:"2026-09-05T02:00:00.000Z"}],error:null})})}));
    const session={id:"session-1",eventId:"event-1",title:"Event",venue:"Hall",status:"completed",startsAt:"2026-09-05T00:00:00.000Z",endsAt:"2026-09-05T03:00:00.000Z",offlineLifecycle:"CONFLICT" as const,offlineStartedAt:"2026-09-05T00:15:00.000Z",offlineEndedAt:"2026-09-05T02:00:00.000Z",offlineStartReconciledAt:"2026-09-05T00:16:00.000Z"};
    const pkg={event:{id:"event-1",code:"EVT-1",title:"Event",status:"completed",startsAt:session.startsAt,endsAt:session.endsAt},sessions:[session],participants:[],attendance:[]};
    const local={...api(),listPreparedEvents:vi.fn().mockResolvedValue([{event:pkg.event,sessionId:session.id,lifecycle:"CONFLICT"}]),getPreparedEvent:vi.fn().mockResolvedValue(pkg),setOfflineLifecycleState:vi.fn().mockResolvedValue(undefined),beginSync:vi.fn().mockResolvedValue([])} as unknown as PLPassDesktopApi;
    window.plpassDesktop=local;
    expect(await reconcileOfflineEventLifecycle("organizer",true,true)).toMatchObject({completed:true});
    expect(local.setOfflineLifecycleState).toHaveBeenCalledWith("event-1","session-1","ENDED");
    expect(rpc).not.toHaveBeenCalledWith("reconcile_offline_event_session_end",expect.anything());
  });
});
