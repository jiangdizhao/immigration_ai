import type { SiteLocale } from "@/lib/site-locale";

export type ConsultationStaffCopy = {
  reviewLabel: string;
  schedulingLabel: string;
  schedulingDescription: string;
  adminTitle: string;
  lawyerTitle: string;
  adminSubtitle: string;
  lawyerSubtitle: string;
  loading: string;
  unavailable: string;
  loadError: string;
  emptyQueue: string;
  backToQueue: string;
  customer: string;
  status: string;
  assignedLawyer: string;
  unassigned: string;
  assignment: string;
  selectLawyer: string;
  noLawyers: string;
  saveAssignment: string;
  customerTimezone: string;
  staffTimezone: string;
  preferences: string;
  methodPreference: string;
  customerNote: string;
  currentProposal: string;
  start: string;
  end: string;
  scheduledMethod: string;
  meetingInstructions: string;
  propose: string;
  rePropose: string;
  cancel: string;
  complete: string;
  requested: string;
  proposed: string;
  confirmed: string;
  completed: string;
  cancelled: string;
  video: string;
  phone: string;
  inPerson: string;
  other: string;
  noPreference: string;
  created: string;
  updated: string;
  proposedAt: string;
  confirmedAt: string;
  completedAt: string;
  cancelledAt: string;
  conflict: string;
  saved: string;
  actionError: string;
  proposalValidation: string;
  chooseAnotherSlot: string;
};

const copy: Record<SiteLocale, ConsultationStaffCopy> = {
  "zh-CN": {
    reviewLabel: "律师审核",
    schedulingLabel: "咨询预约安排",
    schedulingDescription: "预约安排是独立于律师审核请求的工作流程。",
    adminTitle: "咨询预约队列",
    lawyerTitle: "已分配的咨询预约",
    adminSubtitle: "查看请求、分配律师并安排具体时间。",
    lawyerSubtitle: "仅显示分配给您的咨询预约。",
    loading: "正在加载咨询预约…",
    unavailable: "咨询预约功能在当前环境中暂不可用。",
    loadError: "无法加载咨询预约信息，请稍后重试。",
    emptyQueue: "目前没有咨询预约请求。",
    backToQueue: "返回咨询预约队列",
    customer: "客户邮箱",
    status: "状态",
    assignedLawyer: "已分配律师",
    unassigned: "尚未分配",
    assignment: "律师分配",
    selectLawyer: "选择已验证的律师",
    noLawyers: "暂无可分配的已验证律师账户。",
    saveAssignment: "保存分配",
    customerTimezone: "客户时区",
    staffTimezone: "您的设备时区",
    preferences: "客户偏好的时间（仅供参考，并非可用时段）",
    methodPreference: "客户方式偏好",
    customerNote: "客户备注",
    currentProposal: "当前提议 / 已安排时间",
    start: "开始时间",
    end: "结束时间",
    scheduledMethod: "安排方式",
    meetingInstructions: "会议信息（可选）",
    propose: "提议时间",
    rePropose: "重新提议时间",
    cancel: "取消预约",
    complete: "标记为已完成",
    requested: "已提交",
    proposed: "已提议",
    confirmed: "已确认",
    completed: "已完成",
    cancelled: "已取消",
    video: "视频",
    phone: "电话",
    inPerson: "当面",
    other: "其他",
    noPreference: "无偏好",
    created: "创建时间",
    updated: "更新时间",
    proposedAt: "提议时间",
    confirmedAt: "确认时间",
    completedAt: "完成时间",
    cancelledAt: "取消时间",
    conflict: "更新未能应用。已重新加载最新预约状态，请检查后再选择操作。",
    saved: "预约已更新。",
    actionError: "无法更新预约，请检查后重试。",
    proposalValidation: "请填写有效的开始和结束时间，并确认设备时区有效。",
    chooseAnotherSlot: "请查看最新状态，并在需要时选择其他时间。",
  },
  en: {
    reviewLabel: "Lawyer review",
    schedulingLabel: "Consultation scheduling",
    schedulingDescription:
      "Scheduling is a separate workflow from lawyer review requests.",
    adminTitle: "Consultation queue",
    lawyerTitle: "Assigned consultations",
    adminSubtitle:
      "Review requests, assign a lawyer, and propose a concrete time.",
    lawyerSubtitle: "Only consultations assigned to you are shown.",
    loading: "Loading consultations…",
    unavailable: "Consultations are unavailable in this environment.",
    loadError:
      "Consultation information could not be loaded. Please try again.",
    emptyQueue: "There are no consultation requests right now.",
    backToQueue: "Back to consultation queue",
    customer: "Customer email",
    status: "Status",
    assignedLawyer: "Assigned lawyer",
    unassigned: "Not assigned",
    assignment: "Lawyer assignment",
    selectLawyer: "Select a verified lawyer",
    noLawyers: "There are no verified lawyer accounts available to assign.",
    saveAssignment: "Save assignment",
    customerTimezone: "Customer timezone",
    staffTimezone: "Your device timezone",
    preferences:
      "Customer preferred times (preferences only, not availability)",
    methodPreference: "Customer method preference",
    customerNote: "Customer note",
    currentProposal: "Current proposed / scheduled time",
    start: "Start time",
    end: "End time",
    scheduledMethod: "Scheduled method",
    meetingInstructions: "Meeting instructions (optional)",
    propose: "Propose time",
    rePropose: "Propose a new time",
    cancel: "Cancel consultation",
    complete: "Mark complete",
    requested: "Requested",
    proposed: "Proposed",
    confirmed: "Confirmed",
    completed: "Completed",
    cancelled: "Cancelled",
    video: "Video",
    phone: "Phone",
    inPerson: "In person",
    other: "Other",
    noPreference: "No preference",
    created: "Created",
    updated: "Updated",
    proposedAt: "Proposed",
    confirmedAt: "Confirmed",
    completedAt: "Completed",
    cancelledAt: "Cancelled",
    conflict:
      "The update could not be applied. The latest consultation state has been reloaded; review it before choosing another action.",
    saved: "Consultation updated.",
    actionError:
      "The consultation could not be updated. Please review and try again.",
    proposalValidation:
      "Enter valid start and end times and check the device timezone.",
    chooseAnotherSlot:
      "Review the latest state and choose another time if needed.",
  },
};

export function getConsultationStaffCopy(locale: SiteLocale) {
  return copy[locale];
}
