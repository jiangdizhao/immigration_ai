import type { SiteLocale } from "./site-locale";

export const PUBLIC_ROUTES = {
  aiWorkspace: "/ai-workspace",
  services: "/services",
  process: "/process",
  contact: "/contact",
} as const;

export const PUBLIC_SERVICE_IDS = [
  "study-student-visa",
  "skilled-employer-sponsorship",
  "partner-family",
  "visa-refusal-art-review",
  "permanent-residence-citizenship",
  "complex-matters-case-strategy",
] as const;

export type PublicServiceId = (typeof PUBLIC_SERVICE_IDS)[number];

export type PublicServiceIcon =
  | "study"
  | "skilled"
  | "family"
  | "review"
  | "residence"
  | "complex";

type LocalizedServiceCopy = {
  title: string;
  summary: string;
  bullets: readonly string[];
};

export type PublicService = {
  id: PublicServiceId;
  icon: PublicServiceIcon;
  copy: Record<SiteLocale, LocalizedServiceCopy>;
};

export const PUBLIC_SERVICE_CATALOG: readonly PublicService[] = [
  {
    id: "study-student-visa",
    icon: "study",
    copy: {
      "zh-CN": {
        title: "留学与学生签证",
        summary: "围绕留学规划、学生签证及相关初步信息整理，准备后续咨询。",
        bullets: [
          "学习经历与签证背景梳理",
          "课程与材料准备方向",
          "初步咨询重点整理",
        ],
      },
      en: {
        title: "Study & Student Visa",
        summary:
          "Organise initial information around study planning, student visas, and preparation for a follow-up consultation.",
        bullets: [
          "Study history and visa context",
          "Course and document preparation",
          "Initial consultation priorities",
        ],
      },
    },
  },
  {
    id: "skilled-employer-sponsorship",
    icon: "skilled",
    copy: {
      "zh-CN": {
        title: "技术移民与雇主担保",
        summary: "围绕技术移民、雇主担保及个人背景，整理初步情况与咨询重点。",
        bullets: [
          "职业与技能背景梳理",
          "雇主与工作情况整理",
          "材料准备方向说明",
        ],
      },
      en: {
        title: "Skilled Migration & Employer Sponsorship",
        summary:
          "Organise initial background and consultation priorities for skilled migration and employer sponsorship matters.",
        bullets: [
          "Occupation and skills background",
          "Employer and work context",
          "Document preparation direction",
        ],
      },
    },
  },
  {
    id: "partner-family",
    icon: "family",
    copy: {
      "zh-CN": {
        title: "配偶与家庭类",
        summary: "围绕关系、家庭背景和时间线，整理后续咨询所需的初步信息。",
        bullets: ["关系与家庭背景整理", "时间线与材料重点梳理", "咨询准备清单"],
      },
      en: {
        title: "Partner & Family",
        summary:
          "Organise initial information about relationships, family context, and timelines for a follow-up consultation.",
        bullets: [
          "Relationship and family context",
          "Timeline and document priorities",
          "Consultation preparation checklist",
        ],
      },
    },
  },
  {
    id: "visa-refusal-art-review",
    icon: "review",
    copy: {
      "zh-CN": {
        title: "签证拒签与 ART 复审",
        summary: "围绕拒签、复审相关文件和重要日期，整理需要进一步关注的问题。",
        bullets: [
          "通知与决定文件整理",
          "重要日期与时间线梳理",
          "进一步专业咨询准备",
        ],
      },
      en: {
        title: "Visa Refusal & ART Review",
        summary:
          "Organise notices, review-related documents, and important dates for matters that may need further professional attention.",
        bullets: [
          "Notices and decision documents",
          "Important dates and timelines",
          "Preparation for professional advice",
        ],
      },
    },
  },
  {
    id: "permanent-residence-citizenship",
    icon: "residence",
    copy: {
      "zh-CN": {
        title: "永居与公民相关服务",
        summary: "围绕永居、公民身份相关背景，整理初步情况和后续咨询方向。",
        bullets: ["现有身份与历史梳理", "长期规划信息准备", "咨询问题整理"],
      },
      en: {
        title: "Permanent Residence & Citizenship-related Services",
        summary:
          "Organise initial background and consultation direction for permanent residence and citizenship-related matters.",
        bullets: [
          "Current status and history",
          "Longer-term planning information",
          "Consultation question preparation",
        ],
      },
    },
  },
  {
    id: "complex-matters-case-strategy",
    icon: "complex",
    copy: {
      "zh-CN": {
        title: "复杂案件与个案策略咨询",
        summary: "适用于时间线较复杂、材料较多或需要进一步专业评估的咨询准备。",
        bullets: ["复杂时间线梳理", "材料重点初步整理", "专业咨询前的问题准备"],
      },
      en: {
        title: "Complex Matters & Case Strategy",
        summary:
          "Prepare for consultations involving complex timelines, extensive materials, or a need for further professional assessment.",
        bullets: [
          "Complex timeline organisation",
          "Initial document priorities",
          "Questions before professional advice",
        ],
      },
    },
  },
];

export type LocalizedPublicService = {
  id: PublicServiceId;
  icon: PublicServiceIcon;
} & LocalizedServiceCopy;

export function getPublicServiceCatalog(
  locale: SiteLocale
): LocalizedPublicService[] {
  return PUBLIC_SERVICE_CATALOG.map(({ copy, ...service }) => ({
    ...service,
    ...copy[locale],
  }));
}

export type PublicTeamPlaceholder = {
  id: string;
  isPlaceholder: true;
  avatar: "generic";
  name: Record<SiteLocale, string>;
  role: Record<SiteLocale, string>;
  status: Record<SiteLocale, string>;
  focus: Record<SiteLocale, string>;
};

export const PUBLIC_TEAM_PLACEHOLDERS: readonly PublicTeamPlaceholder[] = [
  {
    id: "team-placeholder-01",
    isPlaceholder: true,
    avatar: "generic",
    name: { "zh-CN": "示例律师 01", en: "Demo Lawyer 01" },
    role: {
      "zh-CN": "律师团队结构占位",
      en: "Lawyer team structure placeholder",
    },
    status: { "zh-CN": "资料待确认", en: "Profile pending confirmation" },
    focus: {
      "zh-CN": "服务方向待确认",
      en: "Service focus pending confirmation",
    },
  },
  {
    id: "team-placeholder-02",
    isPlaceholder: true,
    avatar: "generic",
    name: { "zh-CN": "示例律师 02", en: "Demo Lawyer 02" },
    role: {
      "zh-CN": "律师团队结构占位",
      en: "Lawyer team structure placeholder",
    },
    status: { "zh-CN": "资料待确认", en: "Profile pending confirmation" },
    focus: {
      "zh-CN": "服务方向待确认",
      en: "Service focus pending confirmation",
    },
  },
];

type PublicStep = {
  id: string;
  number: string;
  title: string;
  description: string;
};

type PublicPageCopy = {
  home: {
    hero: {
      eyebrow: string;
      title: string;
      description: string;
      aiCta: string;
      consultationCta: string;
      notes: readonly string[];
      preview: {
        eyebrow: string;
        title: string;
        question: string;
        answer: string;
        contextTitle: string;
        contextDescription: string;
        lawyerTitle: string;
        lawyerDescription: string;
      };
    };
    services: {
      eyebrow: string;
      title: string;
      description: string;
      cardCta: string;
    };
    journey: {
      eyebrow: string;
      title: string;
      description: string;
      steps: readonly PublicStep[];
    };
    team: {
      eyebrow: string;
      title: string;
      description: string;
    };
    trust: {
      eyebrow: string;
      title: string;
      description: string;
    };
  };
  services: {
    eyebrow: string;
    title: string;
    description: string;
    nextStep: string;
    nextStepDescription: string;
    aiCta: string;
    consultationCta: string;
  };
  process: {
    eyebrow: string;
    title: string;
    description: string;
    steps: readonly PublicStep[];
    boundaryEyebrow: string;
    boundaryTitle: string;
    boundaryDescription: string;
    boundaryPoints: readonly string[];
    aiCta: string;
    consultationCta: string;
  };
  contact: {
    eyebrow: string;
    title: string;
    description: string;
    aiCardTitle: string;
    aiCardDescription: string;
    aiCta: string;
    lawyerCardTitle: string;
    lawyerCardDescription: string;
    lawyerCta: string;
    readinessEyebrow: string;
    readinessTitle: string;
    readinessDescription: string;
    readiness: readonly string[];
    boundaryTitle: string;
    boundaryDescription: string;
  };
};

export const PUBLIC_PAGE_CONTENT: Record<SiteLocale, PublicPageCopy> = {
  "zh-CN": {
    home: {
      hero: {
        eyebrow: "澳洲留学与移民服务平台",
        title: "从初步了解，到更有准备的专业咨询",
        description:
          "围绕留学、签证与移民相关服务，先了解适合您的方向；您可以使用 AI 整理初步信息，并在需要时进入律师咨询流程。",
        aiCta: "开始 AI 初步咨询",
        consultationCta: "提交专业咨询需求",
        notes: ["服务方向清晰", "AI 协助整理", "需要时连接律师"],
        preview: {
          eyebrow: "AI 初步咨询示意",
          title: "从一个问题开始",
          question: "我想先了解自己的情况应该准备什么。",
          answer: "先整理背景和重要时间点，再决定下一步咨询方向。",
          contextTitle: "事项上下文",
          contextDescription: "保留已知信息和仍需确认的内容。",
          lawyerTitle: "律师咨询入口",
          lawyerDescription: "需要时从现有流程继续申请律师查看。",
        },
      },
      services: {
        eyebrow: "服务方向",
        title: "围绕不同阶段，了解可用的服务方向",
        description:
          "六个暂定服务类别用于帮助您找到入口。具体情况、适用范围和后续建议需要结合您的资料进一步确认。",
        cardCta: "查看服务方向",
      },
      journey: {
        eyebrow: "服务流程",
        title: "AI 负责初步整理，律师在需要时参与",
        description:
          "从说明情况开始，逐步整理事项背景，再根据需要进入专业咨询和后续服务。",
        steps: [
          {
            id: "tell-us",
            number: "01",
            title: "告诉我们您的情况",
            description: "从您的问题、背景和重要时间点开始。",
          },
          {
            id: "ai-organises",
            number: "02",
            title: "AI 协助整理初步信息",
            description: "用对话方式整理已知信息和仍需确认的事项。",
          },
          {
            id: "summary",
            number: "03",
            title: "形成咨询 / 事项摘要",
            description: "把初步背景整理成更容易继续讨论的上下文。",
          },
          {
            id: "lawyer",
            number: "04",
            title: "需要时连接律师",
            description: "涉及具体文件、风险或判断时，进入律师咨询路径。",
          },
          {
            id: "follow-up",
            number: "05",
            title: "持续服务与跟进",
            description: "根据后续确认的服务安排继续推进。",
          },
        ],
      },
      team: {
        eyebrow: "专业服务团队",
        title: "先建立服务入口，团队资料待确认",
        description:
          "以下卡片仅用于展示未来团队信息结构。真实律师资料确认后，会从同一内容模型替换。",
      },
      trust: {
        eyebrow: "信息边界",
        title: "官方法律原文、AI 分析与律师意见各有边界",
        description:
          "网站内容用于服务介绍和初步信息整理。AI 输出不等同于律师意见；涉及具体案件时，请通过现有咨询流程进一步确认。",
      },
    },
    services: {
      eyebrow: "服务目录",
      title: "围绕澳洲留学与移民需求的服务方向",
      description:
        "这些类别帮助您找到初步入口，并不代表资格结论、结果保证或所有子服务均已确认开放。",
      nextStep: "从服务了解进入初步咨询",
      nextStepDescription:
        "先浏览服务方向，再使用 AI 工作台整理您的情况；如有需要，可在现有流程中继续申请律师查看。",
      aiCta: "开始 AI 初步咨询",
      consultationCta: "提交咨询需求",
    },
    process: {
      eyebrow: "服务流程",
      title: "从说明情况，到专业咨询与持续跟进",
      description:
        "AI 是初步信息整理和引导层，帮助您更有准备地进入后续服务；它不替代律师，也不作最终资格判断。",
      steps: [
        {
          id: "tell-us",
          number: "01",
          title: "用户说明情况",
          description: "先说出您的问题、背景和希望了解的方向。",
        },
        {
          id: "ai-organises",
          number: "02",
          title: "AI 协助整理初步信息",
          description: "通过对话逐步整理已知事实和仍需确认的内容。",
        },
        {
          id: "summary",
          number: "03",
          title: "形成咨询摘要 / 事项上下文",
          description: "将初步信息集中起来，方便后续咨询继续使用。",
        },
        {
          id: "lawyer",
          number: "04",
          title: "必要时升级到真人律师",
          description: "遇到具体文件、重要日期或风险判断时，进入律师服务路径。",
        },
        {
          id: "follow-up",
          number: "05",
          title: "持续服务与跟进",
          description: "根据确认后的服务安排继续推进相关事项。",
        },
      ],
      boundaryEyebrow: "服务边界",
      boundaryTitle: "AI 帮助整理，不替代律师",
      boundaryDescription:
        "平台会把服务发现、初步整理和专业咨询入口连接起来，同时保留官方法律信息、AI 分析和律师意见之间的区别。",
      boundaryPoints: [
        "AI 负责初步信息整理和问题引导。",
        "具体案件的判断应通过专业咨询进一步确认。",
      ],
      aiCta: "进入 AI 工作台",
      consultationCta: "了解咨询入口",
    },
    contact: {
      eyebrow: "咨询入口",
      title: "准备下一步咨询",
      description:
        "您可以先使用 AI 工作台整理初步信息；如事项需要进一步专业判断，可从现有工作流程中提交律师查看请求。",
      aiCardTitle: "开始 AI 初步咨询",
      aiCardDescription:
        "适合先说明问题、整理背景，并逐步准备后续咨询所需的信息。",
      aiCta: "进入 AI 工作台",
      lawyerCardTitle: "提交律师咨询需求",
      lawyerCardDescription:
        "从 AI 工作台开始；对于具体文件、风险或重要日期，可在现有流程中申请律师查看。",
      lawyerCta: "开始提交需求",
      readinessEyebrow: "咨询准备",
      readinessTitle: "可以先准备这些信息",
      readinessDescription:
        "不需要一次准备完整。先从您确定的内容开始，后续可以继续补充和确认。",
      readiness: [
        "当前签证或身份背景",
        "重要日期、通知或决定文件",
        "学习、工作、家庭或关系背景",
        "需要优先关注的风险、期限或出行计划",
      ],
      boundaryTitle: "真实联系信息将在确认后接入",
      boundaryDescription:
        "目前不展示未经确认的电话、地址、邮箱、微信、办公时间或咨询费用。",
    },
  },
  en: {
    home: {
      hero: {
        eyebrow: "Australian immigration & study service platform",
        title: "From first questions to better-prepared professional advice",
        description:
          "Explore directions across study, visas, and migration services. Use AI to organise initial information, then continue to a lawyer consultation path when appropriate.",
        aiCta: "Start AI initial consultation",
        consultationCta: "Submit a consultation request",
        notes: [
          "Clear service directions",
          "AI-assisted organisation",
          "Lawyer pathway when needed",
        ],
        preview: {
          eyebrow: "AI initial consultation preview",
          title: "Start with one question",
          question:
            "I want to understand what information I should prepare first.",
          answer:
            "Start with your background and key dates, then choose the next consultation direction.",
          contextTitle: "Matter context",
          contextDescription:
            "Keep known information and open questions together.",
          lawyerTitle: "Lawyer consultation path",
          lawyerDescription:
            "Continue to request lawyer review through the existing workflow when needed.",
        },
      },
      services: {
        eyebrow: "Service directions",
        title: "Find a service direction for your next step",
        description:
          "Six provisional service categories help you find an entry point. Specific scope, suitability, and next steps require your information to be reviewed further.",
        cardCta: "View service direction",
      },
      journey: {
        eyebrow: "Service journey",
        title: "AI organises the initial picture; lawyers join when needed",
        description:
          "Start by explaining your situation, organise the matter context, and continue into professional consultation and follow-up when appropriate.",
        steps: [
          {
            id: "tell-us",
            number: "01",
            title: "Tell us about your situation",
            description: "Start with your question, background, and key dates.",
          },
          {
            id: "ai-organises",
            number: "02",
            title: "AI helps organise initial information",
            description:
              "Use a conversation to separate known facts from open questions.",
          },
          {
            id: "summary",
            number: "03",
            title: "Build a consultation / matter summary",
            description:
              "Turn the initial background into context that can be discussed further.",
          },
          {
            id: "lawyer",
            number: "04",
            title: "Connect with a lawyer when needed",
            description:
              "Use the lawyer pathway when documents, risk, or judgement matter.",
          },
          {
            id: "follow-up",
            number: "05",
            title: "Continue service and follow-up",
            description:
              "Continue according to the service arrangement confirmed later.",
          },
        ],
      },
      team: {
        eyebrow: "Professional service team",
        title: "Build the service entry point first; team details pending",
        description:
          "These cards show the future team information structure only. Confirmed lawyer data can replace them from the same content model.",
      },
      trust: {
        eyebrow: "Information boundaries",
        title:
          "Original law, AI analysis, and lawyer advice have different roles",
        description:
          "Public content supports service discovery and initial information organisation. AI output is not lawyer advice; use the existing consultation path for case-specific matters.",
      },
    },
    services: {
      eyebrow: "Service catalogue",
      title: "Service directions for Australian study and migration needs",
      description:
        "These categories provide an initial entry point. They are not eligibility conclusions, outcome guarantees, or confirmation that every sub-service is available.",
      nextStep: "Move from service discovery to initial consultation",
      nextStepDescription:
        "Browse the service directions, then use the AI workspace to organise your situation. Where appropriate, the existing workflow can continue to a lawyer review request.",
      aiCta: "Start AI initial consultation",
      consultationCta: "Submit a consultation request",
    },
    process: {
      eyebrow: "Service journey",
      title:
        "From explaining your situation to professional advice and follow-up",
      description:
        "AI is an initial information-organising and guidance layer. It helps you prepare for the next service step, but does not replace a lawyer or make final eligibility decisions.",
      steps: [
        {
          id: "tell-us",
          number: "01",
          title: "Tell us about your situation",
          description:
            "Start with your question, background, and the direction you want to explore.",
        },
        {
          id: "ai-organises",
          number: "02",
          title: "AI helps organise initial information",
          description:
            "Organise known facts and open questions through a guided conversation.",
        },
        {
          id: "summary",
          number: "03",
          title: "Build a consultation / matter context",
          description:
            "Keep the initial information together so it can support the next conversation.",
        },
        {
          id: "lawyer",
          number: "04",
          title: "Escalate to a lawyer when needed",
          description:
            "Enter the lawyer service path when documents, dates, or risk assessment require it.",
        },
        {
          id: "follow-up",
          number: "05",
          title: "Continue service and follow-up",
          description:
            "Continue according to the service arrangement confirmed after consultation.",
        },
      ],
      boundaryEyebrow: "Service boundary",
      boundaryTitle: "AI helps organise; it does not replace a lawyer",
      boundaryDescription:
        "The platform connects service discovery, initial organisation, and professional consultation while keeping original legal information, AI analysis, and lawyer advice distinct.",
      boundaryPoints: [
        "AI supports initial organisation and question guidance.",
        "Case-specific judgement should be confirmed through professional consultation.",
      ],
      aiCta: "Open AI workspace",
      consultationCta: "Explore the consultation path",
    },
    contact: {
      eyebrow: "Consultation entry point",
      title: "Prepare for the next consultation step",
      description:
        "Start in the AI workspace to organise initial information. If the matter needs professional judgement, the existing workflow can continue to a lawyer review request.",
      aiCardTitle: "Start an AI initial consultation",
      aiCardDescription:
        "Explain your question, organise the background, and progressively prepare information for a later consultation.",
      aiCta: "Open AI workspace",
      lawyerCardTitle: "Submit a lawyer consultation request",
      lawyerCardDescription:
        "Start in the AI workspace; for specific documents, risks, or important dates, request lawyer review through the existing workflow.",
      lawyerCta: "Start a request",
      readinessEyebrow: "Consultation preparation",
      readinessTitle: "Information you can prepare first",
      readinessDescription:
        "You do not need everything at once. Start with what you know and add or confirm details as you continue.",
      readiness: [
        "Current visa or status background",
        "Important dates, notices, or decision documents",
        "Study, work, family, or relationship background",
        "Risks, deadlines, or travel plans that need attention",
      ],
      boundaryTitle: "Real contact details will be added after confirmation",
      boundaryDescription:
        "Unconfirmed phone numbers, addresses, email, WeChat, office hours, and consultation fees are not displayed here.",
    },
  },
};

export function getPublicPageContent(locale: SiteLocale): PublicPageCopy {
  return PUBLIC_PAGE_CONTENT[locale];
}

export function getPublicTeamPlaceholders(locale: SiteLocale) {
  return PUBLIC_TEAM_PLACEHOLDERS.map((profile) => ({
    ...profile,
    name: profile.name[locale],
    role: profile.role[locale],
    status: profile.status[locale],
    focus: profile.focus[locale],
  }));
}
