export type GuideRole = "student" | "tpo" | "university_admin" | "principal" | "faculty" | "recruiter" | "platform_admin";

export type PageGuideCopy = { title: string; what: string; steps?: string[] };
export type TourSlide = { title: string; lead: string; points: string[] };

/** The first-run walkthrough for each staff role: what the workspace is for, then how to use it. */
export const TOURS: Record<Exclude<GuideRole, "student">, TourSlide[]> = {
  tpo: [
    { title: "Welcome to your placement workspace", lead: "Placeble shows how ready every student is for placements, and tells you who needs help.", points: ["Each student gets one readiness score out of 100", "Scores come from resume, aptitude, interview and more"] },
    { title: "Start by adding your students", lead: "Upload a roster or add students one by one. They get an invite to sign in.", points: ["Open Student roster to upload a sheet", "Students appear here once they sign in and practise"] },
    { title: "Spot who needs support", lead: "Overview and Needs support highlight students scoring low, so you can follow up early.", points: ["Tap a student to see their full report", "Send a message or an announcement from the same place"] },
    { title: "Find everything from the bottom bar", lead: "The tabs at the bottom are your main pages. More holds the rest, including Settings.", points: ["Every page has a short guide at the top", "Reopen this tour any time from More"] },
  ],
  university_admin: [
    { title: "Welcome to your university workspace", lead: "See every institute under your university in one place, and step into any of them.", points: ["University overview compares institutes side by side", "Each institute still has its own TPO"] },
    { title: "Move between institutes", lead: "Open Institutes to review a college, then use the same pages a TPO uses.", points: ["Add or invite institute teams from Institutes", "Roster, students and announcements work per institute"] },
    { title: "Keep the whole network moving", lead: "Announcements and access requests reach across your institutes.", points: ["Watch readiness trends on the overview", "Reopen this tour any time from More"] },
  ],
  principal: [
    { title: "Welcome, Principal", lead: "A read-only view of how your students are doing on placement readiness.", points: ["Overview shows the average score and who is placement ready", "Nothing here changes student data"] },
    { title: "Look closer when you need to", lead: "Break results down by branch and batch to see where to focus.", points: ["Students lists everyone with their score", "Branches and Batches compare groups"] },
    { title: "Get around quickly", lead: "Use the bottom tabs for main pages. More has Settings and sign out.", points: ["Each page has a short guide at the top", "Reopen this tour any time from More"] },
  ],
  faculty: [
    { title: "Welcome to your cohort view", lead: "See how the students you teach are progressing, and who needs a nudge.", points: ["Read-only, so you can explore freely", "Scores update as students practise"] },
    { title: "Help the students who need it", lead: "Students needing help lists those scoring low, with what to work on.", points: ["Messages lets you reach your students", "At risk and Progress show the trend over time"] },
    { title: "Find your way around", lead: "The bottom tabs hold your main pages. More has the rest.", points: ["Every page has a short guide at the top", "Reopen this tour any time from More"] },
  ],
  recruiter: [
    { title: "Welcome to hiring on Placeble", lead: "Find colleges, get approved, and see candidates who are ready for roles.", points: ["Colleges decide what you can see", "Only approved colleges show candidate details"] },
    { title: "Request access to a college", lead: "Browse the Marketplace and send a request. Approved colleges appear in My Institutes.", points: ["Track every request under My requests", "Drive access unlocks candidates for a specific drive"] },
    { title: "Shortlist and interview", lead: "Review candidates, shortlist the best, and manage interviews in one flow.", points: ["Shortlist keeps your picks together", "Reopen this tour any time from More"] },
  ],
  platform_admin: [
    { title: "Welcome to the admin console", lead: "Run the platform: customers, content, health and safety in one place.", points: ["Overview shows how Placeble is doing", "System status and Alerts flag problems early"] },
    { title: "Manage customers", lead: "Colleges, universities, companies and B2C students each have their own page.", points: ["Approve or suspend accounts", "Set agent and programme settings"] },
    { title: "Keep it safe and tidy", lead: "Handle deletion requests, review activity and publish announcements.", points: ["Activity history records every change", "Reopen this tour any time from More"] },
  ],
};

const g = (title: string, what: string, steps?: string[]): PageGuideCopy => ({ title, what, steps });

const TPO_PAGES: Record<string, PageGuideCopy> = {
  Overview: g("Your overview", "A snapshot of how your students are doing and what needs attention.", ["Check the four numbers at the top", "Open Needs support for anyone low", "Add students if the list is empty"]),
  Students: g("Students", "Everyone you have added, with their readiness score.", ["Search or filter the list", "Tap a student to see their report"]),
  Messages: g("Messages", "Talk to students directly.", ["Pick a student", "Write and send"]),
  Announcements: g("Announcements", "Send one message to many students at once.", ["Choose who should get it", "Write it and send"]),
  Interventions: g("Needs support", "Students scoring low, so you can help early.", ["Open a student to see what is weak", "Message them or plan a session"]),
  Roster: g("Student roster", "Add students in bulk from a spreadsheet.", ["Download the template", "Fill it in and upload", "Fix any rows flagged, then confirm"]),
  Branches: g("Branches and batches", "Organise students by branch and graduating year.", ["Add a branch", "Add batches under it"]),
  "Access requests": g("Access requests", "Companies asking to see your students. You decide who gets access.", ["Review each request", "Approve or decline"]),
  Settings: g("Settings", "Your institute details, branding and rules."),
  University: g("University overview", "Compare every institute under your university.", ["Spot the institutes that need attention", "Open one from Institutes"]),
  Institutes: g("Institutes", "All colleges under your university.", ["Open an institute to work inside it", "Invite a team from here"]),
};

/** A short "what is this page and what do I do here" note per page. Keyed by role then by the page's nav key. */
export const PAGES: Record<GuideRole, Record<string, PageGuideCopy>> = {
  student: {
    Overview: g("Your home", "This is where you see how ready you are and what to do next.", ["Check your readiness score", "Tap the suggested next step", "Come back after each practice to see it grow"]),
    Progress: g("Your progress", "See how your score changes over time and where you are strongest.", ["Look for the lowest bar", "Practise that area first"]),
    Agents: g("Career Studio tools", "Each tool measures one skill and adds to your score.", ["Pick a tool", "Finish it to count towards your score"]),
    Messages: g("Ask Ananya", "Chat with your assistant. Ask what to do next or how a score works.", ["Type in your own words", "Ask Ananya to open any tool"]),
    Profile: g("Your profile", "Keep your details up to date so colleges and recruiters see the right information."),
    "Resume Maker": g("Resume Maker", "Build an ATS-friendly resume and get feedback.", ["Fill in each section", "Review the suggestions", "Download when you are happy"]),
    "Aptitude Test": g("Aptitude Test", "Timed practice that sets your aptitude baseline.", ["Start a test", "Answer within the time", "Review your mistakes after"]),
    "Mock Interview": g("Mock Interview", "Practise role-specific questions and get instant feedback.", ["Choose a role", "Answer each question", "Read your feedback"]),
  },
  tpo: TPO_PAGES,
  university_admin: TPO_PAGES,
  principal: {
    Overview: g("Overview", "How your students are doing on placement readiness.", ["Read the average score", "Check who is placement ready"]),
    Students: g("Students", "Everyone with their score. Read-only.", ["Search a name", "Tap a student for their report"]),
    Branches: g("Branches", "Compare readiness by branch to see where to focus."),
    Batches: g("Batches", "Compare readiness by graduating batch."),
    Settings: g("Settings", "Your profile and display preferences."),
  },
  faculty: {
    Cohort: g("Your cohort", "The students you teach and how ready they are.", ["Scan the scores", "Tap a student to see more"]),
    Messages: g("Messages", "Reach out to your students."),
    Interventions: g("Students needing help", "Students scoring low, with what to work on.", ["Pick someone", "Send a message to help"]),
    "At risk": g("At risk", "Students most likely to fall behind if nothing changes."),
    Progress: g("Progress", "See how your cohort changes over time."),
  },
  recruiter: {
    Overview: g("Hiring overview", "Your approved colleges and open drives at a glance.", ["No colleges yet? Open Marketplace", "Send a request to a college"]),
    "My Institutes": g("My institutes", "Colleges that approved you. Live readiness for each."),
    Marketplace: g("Marketplace", "Find colleges and request access.", ["Browse or search", "Send a request", "Wait for the college to approve"]),
    "My requests": g("My requests", "Track every request you sent and its status."),
    Candidates: g("Candidates", "Ready students from your approved colleges.", ["Filter by skill or score", "Shortlist the best"]),
    "Drive access": g("Drive access", "Candidates unlocked for a specific drive."),
    Shortlist: g("Shortlist", "Your picks in one place, ready for interviews."),
    Interviews: g("Interviews", "Schedule and track interviews."),
    Progress: g("Progress", "How your hiring is going."),
  },
  platform_admin: {
    Overview: g("Platform overview", "How Placeble is doing across every college and company."),
    "System status": g("System status", "Health of the services behind Placeble."),
    Alerts: g("Alerts", "Things that need your attention now."),
    Colleges: g("Colleges", "Every college on the platform. Approve, suspend or open one."),
    Universities: g("Universities", "Universities and the institutes under them."),
    "B2C students": g("B2C students", "Students who joined on their own, not through a college."),
    Companies: g("Companies", "Recruiting companies and their approval status."),
    Programmes: g("Programmes", "Set which tools and agents each programme gets."),
    Announcements: g("Announcements", "Publish a message to chosen groups."),
    Blog: g("Blog", "Write and publish articles."),
    "Deletion requests": g("Deletion requests", "Review account deletion requests before approving."),
    Activity: g("Activity history", "A record of every admin action."),
    Settings: g("Settings", "Platform-wide settings."),
  },
};
