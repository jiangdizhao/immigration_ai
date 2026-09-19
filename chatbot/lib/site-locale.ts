export const SITE_LOCALE_COOKIE = "site-locale";

export const DEFAULT_SITE_LOCALE = "zh-CN" as const;

export const SUPPORTED_SITE_LOCALES = ["zh-CN", "en"] as const;

export type SiteLocale = (typeof SUPPORTED_SITE_LOCALES)[number];

export type SiteNavKey =
  | "workspace"
  | "services"
  | "intelligence"
  | "process"
  | "contact";

export type SiteTranslation = {
  brand: {
    name: string;
    tagline: string;
  };
  nav: Record<SiteNavKey, string>;
  header: {
    login: string;
    register: string;
    talkToAi: string;
    openNavigation: string;
    closeNavigation: string;
  };
  account: {
    menuFor: string;
    signedInAs: string;
    administrator: string;
    vipUntil: string;
    vipExpired: string;
    freeAccount: string;
    aiWorkspace: string;
    conversationsAndWorkspace: string;
    lawyerPortal: string;
    lawyerRequests: string;
    renewVip: string;
    upgradeVip: string;
    adminPortal: string;
    logOut: string;
  };
  language: {
    label: string;
    chinese: string;
    english: string;
    switchToChinese: string;
    switchToEnglish: string;
  };
  footer: {
    description: string;
    informationOnly: string;
    lawyerHandoff: string;
    pages: string;
    contactConcept: string;
    sydneyService: string;
    bookingSystem: string;
  };
};

export const SITE_TRANSLATIONS: Record<SiteLocale, SiteTranslation> = {
  "zh-CN": {
    brand: {
      name: "Sovereign Nexus Legal",
      tagline: "AI 辅助移民初步咨询",
    },
    nav: {
      workspace: "AI 工作台",
      services: "服务",
      intelligence: "最新政策解读",
      process: "办理流程",
      contact: "联系我们",
    },
    header: {
      login: "登录",
      register: "注册",
      talkToAi: "咨询 AI",
      openNavigation: "打开导航菜单",
      closeNavigation: "关闭导航菜单",
    },
    account: {
      menuFor: "打开账户菜单：",
      signedInAs: "当前登录账户",
      administrator: "管理员",
      vipUntil: "VIP 有效期至",
      vipExpired: "VIP 已过期",
      freeAccount: "免费账户",
      aiWorkspace: "AI 工作台",
      conversationsAndWorkspace: "我的对话 / AI 工作台",
      lawyerPortal: "律师工作台",
      lawyerRequests: "我的律师请求",
      renewVip: "续订 VIP",
      upgradeVip: "升级 VIP",
      adminPortal: "管理员工作台",
      logOut: "退出登录",
    },
    language: {
      label: "网站语言",
      chinese: "中文",
      english: "English",
      switchToChinese: "切换到中文",
      switchToEnglish: "切换到英文",
    },
    footer: {
      description:
        "移民法律 AI 初步咨询服务界面。助手用于信息收集和一般信息说明；具体案件的法律意见应由合资格律师提供。",
      informationOnly: "仅供一般信息参考",
      lawyerHandoff: "支持转交律师处理",
      pages: "页面",
      contactConcept: "联系信息",
      sydneyService: "以悉尼为重点的移民服务体验",
      bookingSystem: "此部分将在后续接入真实律师事务所预约系统",
    },
  },
  en: {
    brand: {
      name: "Sovereign Nexus Legal",
      tagline: "AI-assisted migration intake",
    },
    nav: {
      workspace: "AI Workspace",
      services: "Services",
      intelligence: "Policy Intelligence",
      process: "Process",
      contact: "Contact",
    },
    header: {
      login: "Login",
      register: "Register",
      talkToAi: "Talk to AI",
      openNavigation: "Open navigation",
      closeNavigation: "Close navigation",
    },
    account: {
      menuFor: "Account menu for",
      signedInAs: "Signed in as",
      administrator: "Administrator",
      vipUntil: "VIP until",
      vipExpired: "VIP expired",
      freeAccount: "Free account",
      aiWorkspace: "AI Workspace",
      conversationsAndWorkspace: "My conversations / AI Workspace",
      lawyerPortal: "Lawyer portal",
      lawyerRequests: "My lawyer requests",
      renewVip: "Renew VIP",
      upgradeVip: "Upgrade to VIP",
      adminPortal: "Admin Portal",
      logOut: "Log out",
    },
    language: {
      label: "Site language",
      chinese: "中文",
      english: "English",
      switchToChinese: "Switch to Chinese",
      switchToEnglish: "Switch to English",
    },
    footer: {
      description:
        "A migration-law AI first-contact interface. The assistant supports intake and general information; case-specific legal advice should be handled by a qualified lawyer.",
      informationOnly: "General information only",
      lawyerHandoff: "Lawyer handoff by design",
      pages: "Pages",
      contactConcept: "Contact concept",
      sydneyService: "Sydney-focused migration service experience",
      bookingSystem:
        "Connect this section to the real law firm booking system later",
    },
  },
};

export function normalizeSiteLocale(value: unknown): SiteLocale {
  if (typeof value !== "string") {
    return DEFAULT_SITE_LOCALE;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "en" || normalized === "en-us") {
    return "en";
  }
  if (normalized === "zh" || normalized === "zh-cn") {
    return "zh-CN";
  }
  return DEFAULT_SITE_LOCALE;
}

export function getSiteLocaleFromCookie(cookieHeader?: string): SiteLocale {
  if (!cookieHeader) {
    return DEFAULT_SITE_LOCALE;
  }

  const cookie = cookieHeader.split(";").find((part) => {
    return part.trim().startsWith(`${SITE_LOCALE_COOKIE}=`);
  });
  if (!cookie) {
    return DEFAULT_SITE_LOCALE;
  }

  const value = cookie.slice(cookie.indexOf("=") + 1).trim();
  try {
    return normalizeSiteLocale(decodeURIComponent(value));
  } catch {
    return DEFAULT_SITE_LOCALE;
  }
}

export function serializeSiteLocaleCookie(locale: SiteLocale): string {
  return `${SITE_LOCALE_COOKIE}=${encodeURIComponent(locale)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export function getSiteTranslation(locale: SiteLocale): SiteTranslation {
  return SITE_TRANSLATIONS[locale];
}
