export type LegalSection = { id: string; title: string; body: string[] };
export type LegalDocument = { title: string; summary: string; updated: string; sections: LegalSection[] };

const CONTACT = "support@placeble.in";
const UPDATED = "1 November 2026";

export const TERMS: LegalDocument = {
  title: "Terms of Service",
  summary: "The rules for using Placeble as a student, college or university, or recruiter.",
  updated: UPDATED,
  sections: [
    { id: "acceptance", title: "1. Acceptance of these terms", body: [
      "By creating an account or using Placeble you agree to these Terms of Service and to our Privacy Policy. If you use Placeble on behalf of a college, university or company, you confirm you are authorised to bind that organisation.",
      "If you do not agree, please do not use the service.",
    ] },
    { id: "who", title: "2. Who uses Placeble", body: [
      "Placeble is used by: students (either added by their college, or signing up on their own); college placement officers (TPOs) and principals; university placement officers who oversee several colleges; recruiters; and Placeble’s own administrators.",
      "What you can see and do depends on your role. Principals have read-only access to reports. University TPOs can manage the colleges in their university. Placeble administrators can manage accounts across the platform to run and support the service.",
    ] },
    { id: "accounts", title: "3. Accounts", body: [
      "College students: your college adds you to Placeble and we email you a temporary password. You must choose your own password the first time you sign in. Your college sets certain details for you, such as your name, student ID, branch and batch, and you cannot change them yourself. Ask your placement office if one is wrong.",
      "Direct students: anyone can create a free account with an email address and password. You must verify your email before you can sign in. If your college later adds the same email, your account, progress and data move into your college’s workspace.",
      "Recruiters need a company email address and a one-time verification of the organisation. Each college separately decides which drives and candidates a recruiter may see.",
      "You must give accurate information, keep your password confidential, and tell us promptly if you suspect unauthorised access. You are responsible for activity under your account.",
    ] },
    { id: "age", title: "4. Age and parental permission", body: [
      "You must be at least 13 to use Placeble. If you are under 18, we ask for a parent or guardian’s name and email and need their permission before you can use the service. Until they agree, your account stays locked. If they decline, we can’t open your account.",
      "We may ask for your date of birth to apply these rules. We may suspend an account if we have reason to believe the age or consent information is false.",
    ] },
    { id: "batches", title: "5. Batches and graduating", body: [
      "College students belong to a batch with a start and end month set by their college. When the batch ends you will see a graduate notice, and your workspace becomes read-only for 30 days so you can view and download your resume and reports. After that, sign-in is closed.",
      "Your college can change a batch’s dates, for example to extend it, and your access follows the new dates. Direct students are not tied to a batch.",
    ] },
    { id: "plans", title: "6. Free and paid plans (direct students)", body: [
      "Direct students get a free plan with monthly limits on certain features, such as AI resume help, mock interviews, aptitude tests, cover letters and group discussions. Limits reset each calendar month. A paid Pro plan removes those limits and is offered monthly or yearly.",
      "Prices are shown before you buy. Paid plans renew until cancelled and are charged through our payment provider. You can cancel at any time and keep Pro until the end of the period you have paid for. Unless the law says otherwise, payments for a period already started are not refundable. We may change prices or limits for future periods with reasonable notice.",
      "Students whose college adds them are covered by their college and are not charged by Placeble.",
    ] },
    { id: "use", title: "7. Acceptable use", body: [
      "Do not misuse Placeble. In particular, you must not: submit false or misleading information; impersonate another person or organisation; attempt to access data belonging to another college, student or recruiter; scrape, reverse engineer or overload the service; upload malicious code; or use the service for unlawful, discriminatory or harassing purposes.",
      "We may suspend or remove accounts that breach these terms or put other users at risk.",
    ] },
    { id: "content", title: "8. Your content", body: [
      "You keep ownership of the resumes, cover letters, answers and other content you submit, including anything you import from a resume file or a LinkedIn PDF. You grant Placeble a limited licence to store, process and display that content solely to operate the service, including generating readiness scores and sharing information with your college and recruiters in the ways described in the Privacy Policy.",
      "You are responsible for making sure your content is accurate and that you have the right to share it. Placeble does not read your LinkedIn account; if you add a LinkedIn link, we only keep the link you give us.",
    ] },
    { id: "messages", title: "9. Messages and announcements", body: [
      "Your college or Placeble may send you notifications and emails about placements, deadlines, your progress and your account. Some are essential service messages. You can ask your college or us about reducing non-essential messages.",
      "Colleges are responsible for the announcements they send to their own students.",
    ] },
    { id: "ai", title: "10. AI-assisted features", body: [
      "Placeble includes AI-assisted features such as mock interviews, resume suggestions and readiness scoring. These outputs are guidance, may contain errors, and are not a guarantee of any hiring or placement outcome. Please review all suggestions before relying on them.",
    ] },
    { id: "institutions", title: "11. Colleges, universities and recruiters", body: [
      "Colleges are responsible for the accuracy of their student lists, for setting their students’ branch and batch, and for using student information in line with their own policies and applicable law. Universities are responsible for the colleges and people they add.",
      "Recruiters may use candidate information only for the approved drive and must not share it with third parties or use it for any other purpose.",
    ] },
    { id: "availability", title: "12. Availability and changes", body: [
      "We work to keep Placeble available but do not promise uninterrupted service. We may change, suspend or discontinue features, and may update these terms. If a change is material we will give reasonable notice, for example by email or an in-app message. Continued use after a change means you accept the updated terms.",
    ] },
    { id: "liability", title: "13. Disclaimers and liability", body: [
      "Placeble is provided on an “as is” and “as available” basis. To the extent permitted by law, we are not liable for indirect or consequential loss, or for hiring decisions made by colleges or recruiters. Nothing in these terms limits liability that cannot lawfully be limited.",
    ] },
    { id: "termination", title: "14. Ending your account", body: [
      "You may stop using Placeble at any time and ask us to delete your account. We may suspend or terminate access for breach of these terms, or when a college’s access ends. Provisions that by their nature should continue after termination will do so.",
    ] },
    { id: "law", title: "15. Governing law", body: [
      "These terms are governed by the laws of India. Courts in India have jurisdiction over disputes, subject to any mandatory rights you have under local consumer law.",
    ] },
    { id: "contact", title: "16. Contact", body: [`Questions about these terms? Email us at ${CONTACT}.`] },
  ],
};

export const PRIVACY: LegalDocument = {
  title: "Privacy Policy",
  summary: "What information Placeble collects, why we use it, who can see it, and the choices you have.",
  updated: UPDATED,
  sections: [
    { id: "overview", title: "1. Overview", body: [
      "This policy explains how Placeble handles personal information when you use our placement-readiness platform. We follow the principles of India’s Digital Personal Data Protection Act, 2023 and collect only what we need to run the service.",
    ] },
    { id: "collect", title: "2. Information we collect", body: [
      "Account details: your name, email address, role, college or university, and a securely hashed password.",
      "Profile and academic details: date of birth, programme or branch, batch or admission and graduating years, student ID where your college provides it, skills and the roles you are aiming for.",
      "For students under 18: a parent or guardian’s name and email, and their response to our permission request.",
      "Content you create: resumes, cover letters, aptitude and coding attempts, mock-interview and group-discussion responses, and the readiness scores derived from them. If you import a resume or a LinkedIn PDF export, we process the file you upload and keep the LinkedIn profile link you give us. We do not access your LinkedIn account.",
      "Account and billing: for direct students on a paid plan, your plan, its dates and a reference from our payment provider. We do not store your card details.",
      "Technical data: device and browser information, IP address, and security logs such as sign-in times. We use essential cookies to keep you signed in.",
    ] },
    { id: "use", title: "3. How we use it", body: [
      "To create and secure your account; verify your email; let your college manage your access and batch; check age and obtain guardian permission where needed; tailor practice and recommendations to your programme and target roles; generate readiness insights; match you to opportunities; send service emails and notifications such as sign-in details, password resets, announcements from your college and reminders; take payment for paid plans; and to maintain, protect and improve Placeble.",
      "We do not sell your personal information.",
    ] },
    { id: "share", title: "4. Who can see your information", body: [
      "Your college: its placement officers, and principals with read-only access, can see your profile, batch, sign-in status and readiness evidence, including a detailed report for each student.",
      "Your university: if your college belongs to a university, its university placement officers can see your college’s data, including reports.",
      "Recruiters: only where your college has granted a recruiter access to a specific drive, and only the information needed for that drive. College summaries shown to recruiters in the marketplace are aggregate and contain no individual student details.",
      "Placeble administrators: our staff can access accounts and data to run, secure and support the service, and their actions are logged. Direct students’ accounts are managed by Placeble directly, since there is no college involved.",
      "Service providers: trusted vendors that help us operate Placeble, such as hosting, email delivery, payments and AI processing, under confidentiality and security obligations.",
      "Legal: where required by law or to protect rights and safety.",
    ] },
    { id: "ai", title: "5. AI processing", body: [
      "Some features send the text you provide, such as interview answers or resume content, to AI providers to generate feedback. We share only what is needed for the feature and do not allow providers to use it to advertise to you.",
    ] },
    { id: "children", title: "6. Young people", body: [
      "Placeble is intended for students in higher education and professionals. You must be at least 13 to use it. If you are under 18 we need a parent or guardian’s permission before your account can be used, and we use the guardian’s details only for that purpose and to respond to their questions. A guardian can ask us to delete the account at any time.",
    ] },
    { id: "retention", title: "7. Retention and security", body: [
      "We keep your information while your account is active and for as long as needed to provide the service or meet legal obligations, then delete or anonymise it. For college students, access ends after your batch finishes: your workspace is read-only for 30 days, then sign-in closes. We may keep records for a reasonable period afterwards, for example for audit, legal or reporting reasons, unless you ask us to delete them where the law allows.",
      "We use encryption in transit, hashed passwords, access controls and separation between colleges. No system is perfectly secure, so please use a strong, unique password.",
    ] },
    { id: "rights", title: "8. Your choices and rights", body: [
      "You can view and update the parts of your profile you control in the app. Details set by your college can be corrected by your placement office. You may also ask us to correct, export or delete your personal information, or withdraw consent where processing is based on consent. Deleting some information may limit what the service can do for you. If your college holds your data as part of its placement records, we may need to refer your request to them.",
      `To exercise these rights, email ${CONTACT}. If you are not satisfied with our response you may contact the Data Protection Board of India.`,
    ] },
    { id: "messages", title: "9. Notifications and emails", body: [
      "We send essential messages about your account, such as verification, password and security emails. Your college and Placeble may also send announcements and reminders by notification or email. Ask us if you would like fewer non-essential messages.",
    ] },
    { id: "changes", title: "10. Changes to this policy", body: [
      "We may update this policy as the service evolves. We will change the “last updated” date above and, for material changes, notify you by email or in the app.",
    ] },
    { id: "contact", title: "11. Contact", body: [`Privacy questions or requests: ${CONTACT}.`] },
  ],
};
